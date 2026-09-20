import {
  commanderDamageTotal,
  commanderDesignationFor,
  designateCommander,
  setCommanderDamageTotal
} from '../src/services/instajudge/magic/runtime/commanderRuntime.js';
import { beginCombat, declareAttackers, declareBlockers, executeCombatDamageStep } from '../src/services/instajudge/magic/runtime/combatRuntime.js';
import { CONTINUOUS_LAYERS, createContinuousEffect } from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import { createManaCost, createTriggeredPaymentCost, PAYMENT_STATUS } from '../src/services/instajudge/magic/runtime/costSystem.js';
import { executeTypedEffect } from '../src/services/instajudge/magic/runtime/effectRuntime.js';
import { evaluateMagicScenario } from '../src/services/instajudge/magic/ruleEvaluator.js';
import { apnapOrder, nextPlayerInTurnOrder, opponentsOf, playersStillInGame } from '../src/services/instajudge/magic/runtime/multiplayerRuntime.js';
import {
  addPermanent,
  createGameObject,
  createMagicRuntimeState,
  dealDamageToPlayerWithResult,
  gatherSimultaneousPlayerChoices,
  leavePlayersRuntime,
  moveObjectWithResult,
  putPendingTriggersOnStack,
  registerGameObject,
  registerReplacementEffect,
  resolveCommanderReturnChoice,
  runStateBasedActionsRuntime,
  setPendingRuntimeChoice
} from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { SPECIAL_ACTION_TYPES, executeSpecialAction } from '../src/services/instajudge/magic/runtime/specialActionRuntime.js';
import {
  STACK_OBJECT_TYPES,
  activateAbility,
  castSpell,
  counterStackObject,
  createStackObject,
  passPriority,
  pushStackObject,
  resolveTopOfStack,
  takePriorityAction
} from '../src/services/instajudge/magic/runtime/stackRuntime.js';
import { advanceTurnStep } from '../src/services/instajudge/magic/runtime/turnRuntime.js';
import { COMBAT_STEPS } from '../src/services/instajudge/magic/runtime/turnStructure.js';

let assertions = 0;
let compositionalCases = 0;
const metrics = { supported: 0, depends: 0, unverified: 0, incorrectConfident: 0 };

function verify(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(`Phase 9 certification failed: ${message}`);
}

function supported(condition, message) {
  verify(condition, message);
  metrics.supported += 1;
}

function expected(status, expectedStatus, message) {
  verify(status === expectedStatus, `${message}; expected ${expectedStatus}, received ${status}`);
  metrics[expectedStatus] += 1;
}

const commanderCard = {
  id: 'cert-commander-card',
  oracle_id: 'cert-commander-oracle',
  name: 'Certification Commander',
  type_line: 'Legendary Creature - Human Knight',
  mana_cost: '{2}',
  oracle_text: 'Double strike',
  power: '3',
  toughness: '3'
};

const instantCard = {
  id: 'cert-instant', name: 'Certification Instant', type_line: 'Instant', mana_cost: '{1}', oracle_text: 'Draw a card.'
};

function makeState(ids = ['a', 'b', 'c', 'd'], { active = ids[0], commanderZone = 'command', casts = 0, commanderController = ids[0] } = {}) {
  const owner = ids[0];
  return createMagicRuntimeState({
    cards: [commanderCard],
    message: commanderCard.name,
    scenario: {
      players: ids.map((id) => ({ id, name: id.toUpperCase(), role: id === owner ? 'user' : 'opponent' })),
      objects: [{
        id: 'commander-a', name: commanderCard.name, card: commanderCard, owner, controller: commanderController,
        zone: commanderZone, commander: true, commanderDesignationId: 'designation-a',
        abilities: ['double strike'], counters: {}
      }],
      continuousEffects: [],
      format: { id: 'commander', commanderDesignations: [{ id: 'designation-a', objectId: 'commander-a', ownerId: owner, castsFromCommandZone: casts }] },
      game: {
        activePlayer: active, turnOrder: ids, phase: 'main', step: 'precombat-main', priorityHolder: active,
        landPlaysAllowed: 1, landPlaysUsed: 0,
        factsProvided: { turn: true, phase: true, stack: true, priority: true, landAllowance: true }
      }
    }
  });
}

function addCreature(state, id, owner, power = 2, abilities = []) {
  return addPermanent(state, createGameObject({
    id, name: id, owner, controller: owner, power, toughness: power,
    abilities: abilities.map((ability) => typeof ability === 'string' ? { keyword: ability, text: ability } : ability)
  }));
}

function returnCommander(state, commander, destination = 'graveyard') {
  const moved = moveObjectWithResult(state, commander, destination, 'certification movement');
  supported(moved.status === 'depends' && moved.movementCommitted, `Commander move to ${destination} must create the post-move choice.`);
  const resolved = resolveCommanderReturnChoice(state, moved.pendingChoice.id, 'command');
  supported(resolved.status === 'committed' && commander.zone === 'command', `Commander must return from ${destination} through the canonical choice.`);
}

// Full command-zone, tax, stack, counter, and return lifecycle.
const lifecycle = makeState();
const lifecycleCommander = lifecycle.objects.get('commander-a');
const designation = commanderDesignationFor(lifecycle, lifecycleCommander);
for (let castIndex = 0; castIndex < 3; castIndex += 1) {
  const cast = castSpell(lifecycle, { sourceObject: lifecycleCommander, controller: 'a', skipTiming: true, availableMana: 20 });
  supported(cast.cast && cast.commanderCost.commanderTaxGenericMana === castIndex * 2, `Command-zone cast ${castIndex + 1} must apply the correct tax.`);
  supported(designation.castsFromCommandZone === castIndex + 1 && lifecycleCommander.zone === 'stack', 'Cast history must increment only after the spell reaches the stack.');
  if (castIndex === 1) {
    supported(counterStackObject(lifecycle, cast.stackObject).countered, 'The second commander cast must use ordinary countering.');
    supported(lifecycle.pendingChoices[0]?.ownerId === 'a', 'A countered commander must give its owner the return choice.');
    resolveCommanderReturnChoice(lifecycle, lifecycle.pendingChoices[0].id, 'command');
  } else {
    supported(resolveTopOfStack(lifecycle).resolved && lifecycleCommander.zone === 'battlefield', 'Commander spell must resolve through the ordinary stack.');
    if (castIndex < 2) returnCommander(lifecycle, lifecycleCommander);
  }
}
supported(designation.id === 'designation-a' && designation.castsFromCommandZone === 3, 'Designation and tax history must survive the full lifecycle.');

// Owner/controller separation and centralized pending-choice exclusion.
const ownerChoice = makeState(['a', 'b', 'c', 'd'], { commanderZone: 'battlefield', commanderController: 'b' });
const controlledCommander = ownerChoice.objects.get('commander-a');
const destroyed = moveObjectWithResult(ownerChoice, controlledCommander, 'graveyard', 'destroyed by C');
supported(destroyed.pendingChoice.ownerId === 'a' && destroyed.pendingChoice.chooser === 'a', 'The owner, not controller or destroyer, must receive the Commander return choice.');
ownerChoice.game.priorityHolder = 'b';
expected(passPriority(ownerChoice, 'b').status, 'depends', 'Pending Commander choice must block priority passing');
expected(takePriorityAction(ownerChoice, 'b', 'respond').status, 'depends', 'Pending Commander choice must block direct priority actions');
expected(castSpell(ownerChoice, { card: instantCard, controller: 'b', skipTiming: true }).status, 'depends', 'Pending Commander choice must block spell casting even through a low-level timing bypass');
expected(activateAbility(ownerChoice, { sourceObject: controlledCommander, controller: 'b', ability: { type: 'ActivatedAbility' } }).timing.status, 'depends', 'Pending Commander choice must block ability activation');
expected(advanceTurnStep(ownerChoice).status, 'depends', 'Pending Commander choice must block turn advancement');
expected(resolveTopOfStack(ownerChoice).status, 'depends', 'Pending Commander choice must block forced stack resolution');
const land = registerGameObject(ownerChoice, createGameObject({ id: 'pending-land', name: 'Pending Land', owner: 'b', controller: 'b', zone: 'hand', card: { name: 'Pending Land', type_line: 'Land' } }));
ownerChoice.players.b.hand.push(land.id);
expected(executeSpecialAction(ownerChoice, { actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'b', object: land, factsProvided: ownerChoice.scenario.game.factsProvided }).legality.status, 'depends', 'Pending Commander choice must block land play');
resolveCommanderReturnChoice(ownerChoice, destroyed.pendingChoice.id, 'command');
supported(controlledCommander.zone === 'command' && commanderDesignationFor(ownerChoice, controlledCommander).castsFromCommandZone === 0, 'Return movement must not increment tax history.');

// Four-player command-zone casts require a complete priority cycle.
for (const prior of [0, 1, 2]) {
  const priorityState = makeState(['a', 'b', 'c', 'd'], { casts: prior });
  const cast = castSpell(priorityState, { sourceObject: priorityState.objects.get('commander-a'), controller: 'a', skipTiming: true, availableMana: 20 });
  supported(cast.cast && cast.commanderCost.commanderTaxGenericMana === prior * 2, `Priority cast with ${prior} prior casts must pay the canonical tax.`);
  for (const playerId of ['a', 'b', 'c']) supported(!passPriority(priorityState, playerId).resolved && priorityState.stack.length === 1, `The spell must remain on the stack after ${playerId} passes.`);
  const resolved = passPriority(priorityState, 'd');
  supported(resolved.resolved && priorityState.objects.get('commander-a').zone === 'battlefield', 'The commander resolves only after all four players pass.');
}

// Commander damage remains recipient-by-designation and controller-independent.
const damage = makeState(['a', 'b', 'c', 'd'], { commanderZone: 'battlefield' });
const damageCommander = damage.objects.get('commander-a');
setCommanderDamageTotal(damage, 'b', 'designation-a', 10);
setCommanderDamageTotal(damage, 'c', 'designation-a', 7);
dealDamageToPlayerWithResult(damage, 'b', 11, damageCommander, { combat: true });
runStateBasedActionsRuntime(damage);
supported(commanderDamageTotal(damage, 'b', 'designation-a') === 21 && !damage.players.b.inGame, 'One recipient must lose at 21 from one designation.');
supported(commanderDamageTotal(damage, 'c', 'designation-a') === 7 && damage.players.c.inGame && damage.players.d.inGame, 'Commander damage must not combine recipients.');
const stolen = makeState(['a', 'b', 'c'], { commanderZone: 'battlefield' });
createContinuousEffect(stolen, {
  source: { id: 'control-effect', owner: 'b' }, controller: 'b', layer: CONTINUOUS_LAYERS.CONTROL,
  appliesTo: { objectId: 'commander-a' }, modification: { kind: 'control', controller: 'b' }, duration: 'indefinite'
});
dealDamageToPlayerWithResult(stolen, 'a', 4, stolen.objects.get('commander-a'), { combat: true });
supported(commanderDamageTotal(stolen, 'a', 'designation-a') === 4 && commanderDamageTotal(stolen, 'b', 'designation-a') === 0, 'A stolen commander must retain designation attribution against its actual recipient.');
leavePlayersRuntime(stolen, ['b']);
supported(stolen.objects.get('commander-a').zone === 'battlefield' && stolen.objects.get('commander-a').baseController === 'a', 'A foreign commander must revert to proven base control when its controller leaves.');
supported(commanderDamageTotal(stolen, 'a', 'designation-a') === 4, 'Controller departure must not erase Commander-damage history.');
const sameName = addPermanent(stolen, createGameObject({ id: 'same-name-copy', card: commanderCard, name: commanderCard.name, owner: 'a', controller: 'a', power: 3, toughness: 3 }));
dealDamageToPlayerWithResult(stolen, 'c', 3, sameName, { combat: true });
supported(commanderDamageTotal(stolen, 'c', 'designation-a') === 0, 'A same-name nondesignated copy must inherit neither tax nor Commander damage identity.');

// Multi-defender combat, first strike, Commander damage, and priority between damage steps.
const combat = makeState(['a', 'b', 'c', 'd'], { commanderZone: 'battlefield' });
const ordinary = addCreature(combat, 'ordinary-attacker', 'a', 4);
const trampler = addCreature(combat, 'trample-attacker', 'a', 5, ['trample']);
const commanderAttacker = combat.objects.get('commander-a');
const blocker = addCreature(combat, 'c-blocker', 'c', 2);
beginCombat(combat);
supported(declareAttackers(combat, [
  { object: ordinary, attackTarget: 'b' }, { object: trampler, attackTarget: 'c' }, { object: commanderAttacker, attackTarget: 'd' }
]).status === 'declared', 'Each attacker must preserve its independent defender.');
supported(declareBlockers(combat, [{ attacker: trampler, blockers: [blocker] }]).status === 'declared', 'Only the attacked defender may provide the blocker.');
const firstDamage = executeCombatDamageStep(combat, { step: COMBAT_STEPS.FIRST_STRIKE_DAMAGE });
supported(firstDamage.status === 'resolved' && commanderDamageTotal(combat, 'd', 'designation-a') === 3, 'First-strike Commander damage must be recorded for the correct defender.');
for (const playerId of ['a', 'b', 'c']) supported(!passPriority(combat, playerId).advancedTo, 'Regular damage must wait through the multiplayer first-strike priority cycle.');
const damageAdvance = passPriority(combat, 'd');
supported(!damageAdvance.advancedTo && combat.pendingChoices[0]?.type === 'CombatDamageChoice', 'After the fourth pass, material trample assignment must still be supplied.');
const regularDamage = advanceTurnStep(combat, { assignments: { [trampler.id]: { [blocker.id]: 2, defender: 3 } } });
supported(regularDamage.to === COMBAT_STEPS.COMBAT_DAMAGE, 'Regular damage may begin after the pass cycle and explicit trample assignment.');
supported(combat.players.b.life === 16 && combat.players.c.life === 17 && combat.players.d.life === 14, 'Regular and double-strike damage must reach the correct defenders, including trample.');
supported(commanderDamageTotal(combat, 'd', 'designation-a') === 6, 'Double-strike Commander damage must count in both damage steps.');

// Loss during combat leaves other defender state coherent.
const combatLoss = makeState(['a', 'b', 'c', 'd'], { commanderZone: 'battlefield' });
const lethalCommander = combatLoss.objects.get('commander-a');
const cAttacker = addCreature(combatLoss, 'c-attacker', 'a', 2);
setCommanderDamageTotal(combatLoss, 'b', 'designation-a', 18);
beginCombat(combatLoss);
declareAttackers(combatLoss, [{ object: lethalCommander, attackTarget: 'b' }, { object: cAttacker, attackTarget: 'c' }]);
declareBlockers(combatLoss, []);
executeCombatDamageStep(combatLoss, { step: COMBAT_STEPS.FIRST_STRIKE_DAMAGE });
supported(!combatLoss.players.b.inGame && combatLoss.players.c.life === 20, 'Lethal first-strike Commander damage must remove only B at the SBA checkpoint.');
supported(playersStillInGame(combatLoss).join('') === 'acd' && combatLoss.game.result.status === 'active', 'The game and C combat remain live after B leaves.');
for (const playerId of ['a', 'c']) passPriority(combatLoss, playerId);
passPriority(combatLoss, 'd');
supported(combatLoss.players.c.life === 18 && combatLoss.players.d.inGame, 'Regular combat damage against C must remain coherent after B leaves.');

// APNAP ordering, material same-controller ordering, and simultaneous choices.
const apnap = makeState();
apnap.pendingTriggers = ['a', 'b', 'b', 'c', 'd'].map((controller, index) => ({ id: `trigger-${index}`, source: { id: `source-${index}`, name: `Source ${index}`, owner: controller }, controller }));
putPendingTriggersOnStack(apnap, { orderMattersByPlayer: ['b'] });
supported(apnap.pendingChoices[0]?.type === 'TriggerOrderChoice', 'Material same-controller trigger order must create a choice.');
const ordered = putPendingTriggersOnStack(apnap, { triggerOrders: { b: ['trigger-2', 'trigger-1'] } });
supported(ordered.map((trigger) => trigger.controller).join('') === 'abbcd' && apnap.stack.at(-1).controller === 'd', 'Triggers must use APNAP groups and supplied within-controller order.');
const simultaneous = makeState();
let committed = 0;
for (const id of ['a', 'b', 'c']) expected(gatherSimultaneousPlayerChoices(simultaneous, { id: 'simultaneous-choice', selections: { [id]: 'keep' }, applyChoices: () => { committed += 1; } }).status, 'depends', 'Incomplete APNAP choices must remain pending');
supported(gatherSimultaneousPlayerChoices(simultaneous, { id: 'simultaneous-choice', selections: { d: 'keep' }, applyChoices: () => { committed += 1; } }).status === 'committed' && committed === 1, 'Simultaneous choices must commit once after all players choose.');

// Ward uses the ordinary multiplayer stack and full pass cycle.
const ward = makeState();
const wardTarget = addCreature(ward, 'ward-target', 'b', 2);
const wardTrigger = createStackObject({
  kind: STACK_OBJECT_TYPES.TRIGGERED_ABILITY,
  sourceObject: wardTarget,
  controller: 'b',
  costs: [createTriggeredPaymentCost(createManaCost('{2}'), { reason: 'ward', payer: 'a' })],
  effectIR: [{ type: 'CounterUnlessPaid', stackObjectId: 'target-spell' }]
});
pushStackObject(ward, wardTrigger);
ward.game.priorityHolder = 'a';
for (const id of ['a', 'b', 'c']) supported(!passPriority(ward, id).resolved, `Ward must remain pending while ${id} passes.`);
const wardPending = passPriority(ward, 'd');
expected(wardPending.status, 'depends', 'Unspecified Ward payment must become a centralized choice');
expected(takePriorityAction(ward, 'a', 'respond').status, 'depends', 'Ward choice must block further priority actions');
supported(resolveTopOfStack(ward, { paymentChoices: [{ triggerId: wardTrigger.id, status: PAYMENT_STATUS.PAID }] }).resolved, 'Paid Ward must resolve through the canonical stack owner.');

// Commander movement composes once with supported replacement effects.
const replacement = makeState(['a', 'b', 'c'], { commanderZone: 'battlefield' });
registerReplacementEffect(replacement, {
  id: 'graveyard-to-exile', eventType: 'ZoneChange', mandatory: true,
  applies: (event) => event.object?.id === 'commander-a' && event.to === 'graveyard',
  replace: { to: 'exile' }
});
const replacedMove = moveObjectWithResult(replacement, replacement.objects.get('commander-a'), 'graveyard', 'destroyed');
expected(replacedMove.status, 'depends', 'A supported replacement followed by Commander return must await the owner choice');
supported(replacement.objects.get('commander-a').zone === 'exile' && replacedMove.pendingChoice.currentZone === 'exile', 'Commander logic must consume the replacement result exactly once.');
resolveCommanderReturnChoice(replacement, replacedMove.pendingChoice.id, 'command');
supported(replacement.format.commander.movementHistory.map((entry) => entry.to).join(',') === 'exile,command', 'Replacement and Commander return must use one canonical movement history.');

// Player departures and turn/priority order remain stable after multiple removals.
const departures = makeState(['a', 'b', 'c', 'd', 'e']);
leavePlayersRuntime(departures, ['c']);
leavePlayersRuntime(departures, ['e']);
supported(playersStillInGame(departures).join('') === 'abd', 'Multiple departures must retain only surviving stable player IDs.');
supported(nextPlayerInTurnOrder(departures, 'a') === 'b' && nextPlayerInTurnOrder(departures, 'b') === 'd' && nextPlayerInTurnOrder(departures, 'd') === 'a', 'Turn and priority order must be A-B-D-A.');
const activeLeaves = makeState();
leavePlayersRuntime(activeLeaves, ['a']);
supported(activeLeaves.game.activePlayer === null && activeLeaves.game.turnOrderAnchor === 'a' && activeLeaves.game.priorityHolder === 'b', 'Active-player departure must preserve a safe anchor.');
activeLeaves.game.step = 'cleanup';
activeLeaves.game.phase = 'ending';
activeLeaves.game.turnBasedAction = 'cleanup';
activeLeaves.game.cleanupState = { iteration: 1, repeatRequired: false, priorityActive: false };
activeLeaves.game.turnBasedActionState = null;
activeLeaves.game.priorityHolder = null;
supported(advanceTurnStep(activeLeaves).status === 'advanced' && activeLeaves.game.activePlayer === 'b', 'The next eligible turn must begin after the active player leaves.');
const simultaneousLoss = makeState(['a', 'b', 'c', 'd']);
simultaneousLoss.players.b.life = 0;
simultaneousLoss.players.c.life = 0;
runStateBasedActionsRuntime(simultaneousLoss);
supported(simultaneousLoss.events.filter((event) => event.type === 'PlayerLost').length === 2 && playersStillInGame(simultaneousLoss).join('') === 'ad', 'Simultaneous losses must be processed in one stable SBA pass.');

// Each-player scopes and explicit/ambiguous targets use only players still in game.
const scopes = makeState();
leavePlayersRuntime(scopes, ['d']);
executeTypedEffect({ state: scopes, controller: 'a', effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'each opponent' } });
supported(scopes.players.a.life === 20 && scopes.players.b.life === 19 && scopes.players.c.life === 19 && scopes.players.d.life === 20, 'Each opponent must exclude the controller and players who left.');
const ambiguity = executeTypedEffect({ state: scopes, controller: 'a', effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'target opponent' } });
expected(ambiguity.status, 'depends', 'Unnamed target opponent must not select the first matching player');

// Public natural-language certification cases.
const publicCases = [
  ["This is the second time I've cast my commander. How much extra does it cost?", 'yes'],
  ['My commander was countered. Does the tax increase?', 'yes'],
  ['My commander has dealt Bob 20 combat damage. If it hits him for 1, does he lose?', 'yes'],
  ['My commander dealt Bob 10 and Sarah 11. Is that 21?', 'no'],
  ['Bob stole my commander and hit me with it. Does that count?', 'yes'],
  ['My commander died. Can I leave it in the graveyard?', 'yes'],
  ['My commander died; do I have to put it in the command zone?', 'no'],
  ['In a four-player game Bob loses. Does the game end?', 'no'],
  ['In a four-player game, can I attack Bob with one creature and Sarah with another?', 'yes'],
  ['In a four-player game, who gets priority after I cast my commander?', 'yes'],
  ['In a four-player game. Turn order is me, Bob, Sarah, Mike. Three players get triggers at once. What order do they go on the stack?', 'yes'],
  ['In a four-player game, target opponent loses 1 life. Who loses life?', 'depends'],
  ['In a Two-Headed Giant Commander game, who gets priority next?', 'unverified'],
  ["In a four-player Commander game, Bob controls my permanent, but its control provenance is unknown. What happens when Bob leaves?", 'unverified']
];
for (const [message, verdict] of publicCases) {
  const result = evaluateMagicScenario({ message, cards: [] });
  verify(result.verdict === verdict, `Public case expected ${verdict}, received ${result.verdict}: ${message}`);
  if (/\btriggers?\b/i.test(message) && verdict === 'yes') {
    verify(/APNAP order/i.test(result.summary), 'Public simultaneous-trigger case must return the canonical APNAP explanation.');
  }
  if (verdict === 'depends') metrics.depends += 1;
  else if (verdict === 'unverified') metrics.unverified += 1;
  else metrics.supported += 1;
}

// Deterministic invariant matrix: identity, tax, recipient, order, departure, and pending-choice dimensions.
for (const playerCount of [3, 4, 5]) {
  const ids = ['a', 'b', 'c', 'd', 'e'].slice(0, playerCount);
  for (const active of ids) {
    for (const priorCasts of [0, 1, 2, 3]) {
      for (const priorDamage of [0, 10, 20]) {
        for (const incoming of [0, 1, 3]) {
          for (const pending of [false, true]) {
            const state = makeState(ids, { active, casts: priorCasts, commanderZone: 'command' });
            const source = state.objects.get('commander-a');
            const recipient = ids.find((id) => id !== 'a');
            setCommanderDamageTotal(state, recipient, 'designation-a', priorDamage);
            if (pending) setPendingRuntimeChoice(state, { id: `matrix-choice-${compositionalCases}`, type: 'ReplacementChoice', chooser: recipient });
            const tax = commanderDesignationFor(state, source).castsFromCommandZone * 2;
            verify(tax === priorCasts * 2, 'Matrix tax must derive only from stable designation history.');
            verify(apnapOrder(state)[0] === active && opponentsOf(state, active).length === playerCount - 1, 'Matrix APNAP/opponent dimensions must be N-player.');
            if (pending) {
              verify(castSpell(state, { sourceObject: source, controller: 'a', skipTiming: true }).status === 'depends', 'Matrix pending choice must block cast.');
            } else {
              const cast = castSpell(state, { sourceObject: source, controller: 'a', skipTiming: true, availableMana: 20 });
              verify(cast.cast && cast.commanderCost.commanderTaxGenericMana === tax, 'Matrix command-zone cast must apply invariant-derived tax.');
            }
            if (incoming > 0) {
              const battlefieldState = makeState(ids, { active, casts: priorCasts, commanderZone: 'battlefield' });
              const battlefieldCommander = battlefieldState.objects.get('commander-a');
              setCommanderDamageTotal(battlefieldState, recipient, 'designation-a', priorDamage);
              dealDamageToPlayerWithResult(battlefieldState, recipient, incoming, battlefieldCommander, { combat: true });
              verify(commanderDamageTotal(battlefieldState, recipient, 'designation-a') === priorDamage + incoming, 'Matrix damage must remain recipient/designation keyed.');
              runStateBasedActionsRuntime(battlefieldState);
              verify(battlefieldState.players[recipient].inGame === (priorDamage + incoming < 21), 'Matrix loss must match the 21-damage invariant.');
            }
            compositionalCases += 1;
            metrics.supported += incoming > 0 ? 5 : 3;
          }
        }
      }
    }
  }
}

console.log(JSON.stringify({
  verifier: 'Magic Commander Phase 9 Certification',
  assertions,
  compositionalCases,
  publicCases: publicCases.length,
  ...metrics,
  status: 'PASS'
}, null, 2));
