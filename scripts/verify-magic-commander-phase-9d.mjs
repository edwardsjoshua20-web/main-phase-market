import { designateCommander, commanderDamageTotal, setCommanderDamageTotal } from '../src/services/instajudge/magic/runtime/commanderRuntime.js';
import { deriveCharacteristics } from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import { beginCombat, declareAttackers, declareBlockers, executeCombat } from '../src/services/instajudge/magic/runtime/combatRuntime.js';
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
  putPendingTriggersOnStack,
  runStateBasedActionsRuntime
} from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import { STACK_OBJECT_TYPES, createStackObject, passPriority, pushStackObject, takePriorityAction } from '../src/services/instajudge/magic/runtime/stackRuntime.js';
import { advanceTurnStep } from '../src/services/instajudge/magic/runtime/turnRuntime.js';
import { TURN_STEPS } from '../src/services/instajudge/magic/runtime/turnStructure.js';

let assertions = 0;
let compositionalCases = 0;
const metrics = { supported: 0, depends: 0, unverified: 0, incorrectConfident: 0 };

function verify(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(`Phase 9D verification failed: ${message}`);
}

function makeState(ids = ['a', 'b', 'c', 'd'], { active = ids[0], genericObjects = [], format = { id: 'commander', commanderDesignations: [] } } = {}) {
  return createMagicRuntimeState({
    genericObjects,
    scenario: {
      players: ids.map((id) => ({ id, name: id.toUpperCase(), role: id === ids[0] ? 'user' : 'opponent' })),
      objects: [], continuousEffects: [], format,
      game: {
        activePlayer: active, turnOrder: ids, phase: 'main', step: 'precombat-main', priorityHolder: active,
        factsProvided: { turn: true, phase: true, stack: true, priority: true }
      }
    }
  });
}

function prepareCleanup(state) {
  state.game.step = TURN_STEPS.CLEANUP;
  state.game.phase = 'ending';
  state.game.turnBasedAction = 'cleanup';
  state.game.cleanupState = { iteration: 1, repeatRequired: false, priorityActive: false };
  state.game.turnBasedActionState = null;
  state.game.priorityHolder = null;
  state.game.consecutivePasses = 0;
}

function addCreature(state, id, controller, power = 2, commander = false) {
  const object = addPermanent(state, createGameObject({ id, name: id, owner: controller, controller, power, toughness: power, commander }));
  if (commander) designateCommander(state, object, { ownerId: controller, designationId: `designation-${id}` });
  return object;
}

// Canonical state, rotations, and two-player compatibility.
const rotation = makeState();
verify(rotation.game.turnOrder.join('') === 'abcd', 'Turn order must be explicit and stable.');
verify(rotation.game.nonactivePlayers.join('') === 'bcd' && rotation.game.nonactivePlayer === 'b', 'Nonactive players must be ordered with singular compatibility.');
const turns = [rotation.game.activePlayer];
for (let index = 0; index < 8; index += 1) {
  prepareCleanup(rotation);
  const advanced = advanceTurnStep(rotation);
  verify(advanced.status === 'advanced', 'Cleanup must advance to the next eligible turn.');
  turns.push(rotation.game.activePlayer);
}
verify(turns.join('') === 'abcdabcda', 'Four-player turn order must complete multiple clockwise rotations.');
const duel = makeState(['player', 'opponent'], { active: 'player' });
verify(duel.game.nonactivePlayers.join(',') === 'opponent' && duel.game.nonactivePlayer === 'opponent', 'Two-player nonactive compatibility must remain intact.');
metrics.supported += 12;

// Removing a player skips turns and priority immediately.
const removal = makeState();
const removed = leavePlayersRuntime(removal, ['c'], { reason: 'test loss' });
verify(removed.status === 'committed' && playersStillInGame(removal).join('') === 'abd', 'A leaving player must be removed from the in-game sequence.');
verify(nextPlayerInTurnOrder(removal, 'b') === 'd' && nextPlayerInTurnOrder(removal, 'd') === 'a', 'Turn lookup must skip the leaving player.');
removal.game.priorityHolder = 'b';
passPriority(removal, 'b');
verify(removal.game.priorityHolder === 'd', 'Priority must skip the leaving player.');
metrics.supported += 3;

// N-player priority, pass reset, stack resolution, and post-resolution priority.
const priority = makeState();
const holders = [];
for (const id of ['a', 'b', 'c']) {
  holders.push(priority.game.priorityHolder);
  const passed = passPriority(priority, id);
  verify(passed.allowed && !passed.advancedTo, 'An empty-stack step must not advance before every player passes.');
}
holders.push(priority.game.priorityHolder);
const finalPass = passPriority(priority, 'd');
verify(holders.join('') === 'abcd' && Boolean(finalPass.advancedTo), 'The fourth consecutive pass must advance the empty-stack step.');

const stackState = makeState();
pushStackObject(stackState, createStackObject({ kind: STACK_OBJECT_TYPES.ACTIVATED_ABILITY, sourceObject: { id: 'ability-source', name: 'Ability', owner: 'a' }, controller: 'a' }));
stackState.game.priorityHolder = 'a';
for (const id of ['a', 'b', 'c']) verify(!passPriority(stackState, id).resolved && stackState.stack.length === 1, 'The stack must wait for all remaining players to pass.');
verify(passPriority(stackState, 'd').resolved && stackState.stack.length === 0 && stackState.game.priorityHolder === 'a', 'The fourth pass must resolve the top object and return priority to the active player.');
pushStackObject(stackState, createStackObject({ kind: STACK_OBJECT_TYPES.ACTIVATED_ABILITY, sourceObject: { id: 'ability-source-2', name: 'Ability 2', owner: 'a' }, controller: 'a' }));
stackState.game.priorityHolder = 'a';
passPriority(stackState, 'a');
verify(stackState.game.consecutivePasses === 1, 'A pass must increment the succession count.');
verify(takePriorityAction(stackState, 'b', 'respond').allowed && stackState.game.consecutivePasses === 0, 'An action must reset consecutive passes.');
metrics.supported += 10;

// APNAP simultaneous choices and trigger ordering.
const choices = makeState();
let commits = 0;
let choiceResult = gatherSimultaneousPlayerChoices(choices, { id: 'all-choose', selections: { a: 'keep' }, applyChoices: () => { commits += 1; } });
verify(choiceResult.nextChooser === 'b' && commits === 0, 'APNAP must gather the active choice first without executing early.');
choiceResult = gatherSimultaneousPlayerChoices(choices, { id: 'all-choose', selections: { b: 'keep' }, applyChoices: () => { commits += 1; } });
verify(choiceResult.nextChooser === 'c' && commits === 0, 'The second chooser must be the first nonactive player.');
choiceResult = gatherSimultaneousPlayerChoices(choices, { id: 'all-choose', selections: { c: 'keep' }, applyChoices: () => { commits += 1; } });
verify(choiceResult.nextChooser === 'd' && commits === 0, 'APNAP must continue in turn order.');
choiceResult = gatherSimultaneousPlayerChoices(choices, { id: 'all-choose', selections: { d: 'keep' }, applyChoices: () => { commits += 1; return 'simultaneous'; } });
verify(choiceResult.status === 'committed' && commits === 1 && choiceResult.result === 'simultaneous', 'Execution must occur once after all choices are gathered.');

const triggers = makeState();
triggers.pendingTriggers = ['a', 'b', 'c', 'd'].map((controller, index) => ({ id: `trigger-${index}`, source: { id: `source-${index}`, name: controller, owner: controller }, controller }));
const triggerOrder = putPendingTriggersOnStack(triggers);
verify(triggerOrder.map((trigger) => trigger.controller).join('') === 'abcd', 'Triggers must enter the stack in APNAP order.');
verify(triggers.stack.at(-1).controller === 'd', 'The last nonactive trigger must be on top.');
const orderChoice = makeState();
orderChoice.pendingTriggers = [1, 2].map((index) => ({ id: `a-trigger-${index}`, source: { id: `a-source-${index}`, name: `A${index}`, owner: 'a' }, controller: 'a' }));
verify(putPendingTriggersOnStack(orderChoice, { orderMattersByPlayer: ['a'] }).length === 0 && orderChoice.pendingChoices[0]?.type === 'TriggerOrderChoice', 'Unspecified material internal trigger order must create a pending choice.');
metrics.supported += 7;
metrics.depends += 1;

// Multiple defenders, independent blockers, damage, and Commander accounting.
const combat = makeState();
const attackers = [addCreature(combat, 'one', 'a', 3), addCreature(combat, 'two', 'a', 4), addCreature(combat, 'three', 'a', 5)];
beginCombat(combat);
const declared = declareAttackers(combat, [
  { object: attackers[0], attackTarget: 'b' }, { object: attackers[1], attackTarget: 'c' }, { object: attackers[2], attackTarget: 'd' }
]);
verify(declared.status === 'declared' && declared.attackers.map((entry) => entry.attackTarget).join('') === 'bcd', 'Attackers must preserve independent defenders.');
const wrongBlocker = addCreature(combat, 'b-blocker', 'b');
const illegalBlock = declareBlockers(combat, [{ attacker: attackers[1], blockers: [wrongBlocker] }]);
verify(illegalBlock.status === 'illegal', 'B cannot block a creature attacking C.');
declareBlockers(combat, []);
verify(executeCombat(combat).status === 'resolved', 'Unblocked multi-defender combat must resolve.');
verify(combat.players.b.life === 17 && combat.players.c.life === 16 && combat.players.d.life === 15, 'Combat damage must update each defender independently.');

const commanderCombat = makeState();
const commander = addCreature(commanderCombat, 'commander-a', 'a', 1, true);
setCommanderDamageTotal(commanderCombat, 'b', 'designation-commander-a', 20);
beginCombat(commanderCombat);
declareAttackers(commanderCombat, [{ object: commander, attackTarget: 'b' }]);
declareBlockers(commanderCombat, []);
executeCombat(commanderCombat);
verify(commanderDamageTotal(commanderCombat, 'b', 'designation-commander-a') === 21, 'Commander damage must remain keyed by recipient and designation.');
verify(!commanderCombat.players.b.inGame && commanderCombat.players.c.inGame && commanderCombat.players.d.inGame, 'Only the lethal Commander-damage recipient must leave.');
verify(commanderCombat.game.result.status === 'active', 'A four-player game must continue after one Commander-damage loss.');
metrics.supported += 7;

// Each-opponent, each-player, and target ambiguity.
const effects = makeState();
executeTypedEffect({ state: effects, controller: 'a', effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'each opponent' } });
verify(effects.players.a.life === 20 && effects.players.b.life === 19 && effects.players.c.life === 19 && effects.players.d.life === 19, 'Each opponent must affect all other in-game players only.');
executeTypedEffect({ state: effects, controller: 'a', effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'each player' } });
verify(Object.values(effects.players).map((player) => player.life).join(',') === '19,18,18,18', 'Each player must affect every in-game player.');
const ambiguous = executeTypedEffect({ state: effects, controller: 'a', effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'target opponent' } });
verify(ambiguous.status === 'depends' && ambiguous.choices.length === 3, 'An unnamed target opponent must not select an arbitrary player.');
metrics.supported += 2;
metrics.depends += 1;

// Ward-style stack cycle and multiplayer response chain.
const ward = makeState();
pushStackObject(ward, createStackObject({ kind: STACK_OBJECT_TYPES.TRIGGERED_ABILITY, sourceObject: { id: 'ward', name: 'Ward', owner: 'b' }, controller: 'b' }));
ward.game.priorityHolder = 'a';
for (const id of ['a', 'b', 'c']) verify(!passPriority(ward, id).resolved, 'Ward must remain pending before every player passes.');
verify(passPriority(ward, 'd').resolved, 'Ward resolves only after the full multiplayer pass cycle.');

const responses = makeState();
for (const [controller, name] of [['a', 'Spell 1'], ['c', 'Instant 2'], ['d', 'Instant 3']]) {
  pushStackObject(responses, createStackObject({ kind: STACK_OBJECT_TYPES.ACTIVATED_ABILITY, sourceObject: { id: name, name, owner: controller }, controller }));
}
responses.game.priorityHolder = 'a';
for (const id of ['a', 'b', 'c']) passPriority(responses, id);
const firstResolution = passPriority(responses, 'd');
verify(firstResolution.result.stackObject.sourceObject.name === 'Instant 3', 'The latest multiplayer response must resolve first.');
verify(responses.game.priorityHolder === 'a' && responses.stack.at(-1).sourceObject.name === 'Instant 2', 'After resolution the active player gets priority and LIFO state remains intact.');
metrics.supported += 6;

// Leaving-game ownership, control cleanup, active-player safety, last player, and simultaneous losses.
const zones = ['battlefield', 'hand', 'graveyard', 'exile', 'command'];
const ownedObjects = zones.map((zone, index) => ({ id: `b-${zone}`, name: `B ${zone}`, owner: 'b', controller: 'b', zone, power: 2, toughness: 2, token: false }));
const leaving = makeState(['a', 'b', 'c'], { genericObjects: ownedObjects });
pushStackObject(leaving, createStackObject({ kind: STACK_OBJECT_TYPES.ACTIVATED_ABILITY, sourceObject: leaving.objects.get('b-hand'), controller: 'b' }));
const foreign = addPermanent(leaving, createGameObject({ id: 'a-owned', name: 'A Owned', owner: 'a', controller: 'b', baseController: 'a', power: 2, toughness: 2 }));
const leave = leavePlayersRuntime(leaving, ['b'], { reason: 'test' });
verify(zones.every((zone) => leaving.objects.get(`b-${zone}`).zone === 'outside-game'), 'All owned objects in represented zones must leave the game.');
verify(leaving.stack.length === 0, 'Stack objects controlled by the leaving player must cease.');
verify(foreign.zone === 'battlefield' && deriveCharacteristics(leaving, foreign).controller === 'a', 'A supported foreign object must revert rather than leave.');
verify(leave.status === 'committed', 'Known base control must be supported.');

const unknownControl = makeState(['a', 'b', 'c']);
const unknown = addPermanent(unknownControl, createGameObject({ id: 'unknown-control', name: 'Unknown Control', owner: 'a', controller: 'b', baseController: 'b', power: 2, toughness: 2 }));
const unknownLeave = leavePlayersRuntime(unknownControl, ['b']);
verify(unknownLeave.status === 'unverified' && unknownLeave.unsupportedControl.includes(unknown.id), 'Unknown control reversion history must fail closed.');
metrics.unverified += 1;

const activeLeaves = makeState();
leavePlayersRuntime(activeLeaves, ['a']);
verify(activeLeaves.game.activePlayer === null && activeLeaves.game.priorityHolder === 'b' && activeLeaves.game.turnOrderAnchor === 'a', 'An active player leaving must preserve a safe turn anchor and grant priority to the next player.');
prepareCleanup(activeLeaves);
advanceTurnStep(activeLeaves);
verify(activeLeaves.game.activePlayer === 'b', 'The next eligible player must begin the next turn after an active player leaves.');

const last = makeState(['a', 'b', 'c']);
leavePlayersRuntime(last, ['b', 'c']);
verify(last.game.result.status === 'complete' && last.game.result.winnerId === 'a', 'The last remaining player must win canonically.');
const simultaneous = makeState(['a', 'b', 'c']);
simultaneous.players.b.life = 0;
simultaneous.players.c.life = 0;
runStateBasedActionsRuntime(simultaneous);
const lossEvents = simultaneous.events.filter((event) => event.type === 'PlayerLost');
verify(lossEvents.length === 2 && simultaneous.game.result.winnerId === 'a', 'Simultaneous losses must be processed in one SBA batch without iteration-order winner artifacts.');
metrics.supported += 9;

// Compiler ownership and fail-closed public cases.
const compiled = compileMagicScenario({ message: "It's a four-player Commander game. Turn order is me, Bob, Sarah, Mike. Bob has priority." });
verify(compiled.players.map((player) => player.id).join(',') === 'player,bob,sarah,mike', 'The compiler must preserve named stable player identities.');
verify(compiled.game.turnOrder.join(',') === 'player,bob,sarah,mike' && compiled.game.priorityHolder === 'bob', 'The compiler must preserve explicit seating and priority.');
const unknownOrder = compileMagicScenario({ message: "It's a four-player Commander game with Bob, Sarah, and Mike." });
verify(!unknownOrder.game.turnOrderKnown, 'Mention order must not become certified seat order.');
metrics.supported += 2;
metrics.depends += 1;

// Deterministic cross-product exposes residual two-player assumptions.
for (const count of [3, 4, 5]) {
  const ids = ['a', 'b', 'c', 'd', 'e'].slice(0, count);
  for (const active of ids) {
    for (const stackDepth of [0, 1]) {
      for (const removedId of [null, ids.at(-1)]) {
        const state = makeState(ids, { active });
        if (removedId && removedId !== active) leavePlayersRuntime(state, [removedId]);
        if (stackDepth) pushStackObject(state, createStackObject({ kind: STACK_OBJECT_TYPES.ACTIVATED_ABILITY, sourceObject: { id: `matrix-${compositionalCases}`, name: 'Matrix', owner: active }, controller: active }));
        const inGame = playersStillInGame(state);
        verify(inGame.length === count - (removedId && removedId !== active ? 1 : 0), 'Matrix in-game count must be canonical.');
        verify(opponentsOf(state, active).length === inGame.length - 1, 'Matrix opponent enumeration must be N-player.');
        verify(apnapOrder(state)[0] === active, 'Matrix APNAP order must begin with the active player.');
        verify(nextPlayerInTurnOrder(state, active) === apnapOrder(state)[1], 'Matrix priority successor must match APNAP turn order.');
        compositionalCases += 1;
        metrics.supported += 4;
      }
    }
  }
}

for (const count of [3, 4, 5]) {
  const ids = ['a', 'b', 'c', 'd', 'e'].slice(0, count);
  for (const active of ids) {
    for (const [passCount, priorityHolder] of ids.entries()) {
      const state = makeState(ids, { active });
      state.game.priorityHolder = priorityHolder;
      state.game.consecutivePasses = passCount;
      verify(playersStillInGame(state).includes(priorityHolder), 'Matrix priority holder must be an in-game stable player.');
      verify(nextPlayerInTurnOrder(state, priorityHolder) !== priorityHolder, 'Matrix priority must advance to a distinct player.');
      compositionalCases += 1;
      metrics.supported += 2;
    }
    for (const defender of ids.filter((id) => id !== active)) {
      const state = makeState(ids, { active });
      const attacker = addCreature(state, `matrix-attacker-${compositionalCases}`, active, 1);
      beginCombat(state);
      const attack = declareAttackers(state, [{ object: attacker, attackTarget: defender }]);
      verify(attack.status === 'declared' && attack.attackers[0].attackTarget === defender, 'Matrix attacker must retain its selected defender.');
      const life = state.players[defender].life;
      const effect = executeTypedEffect({ state, controller: active, targetPlayer: defender, effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'target opponent' } });
      verify(effect.status === 'executed' && state.players[defender].life === life - 1, 'Matrix explicit opponent target must affect only the selected legal opponent.');
      const matrixCommander = addCreature(state, `matrix-commander-${compositionalCases}`, active, 1, true);
      dealDamageToPlayerWithResult(state, defender, 1, matrixCommander, { combat: true });
      verify(commanderDamageTotal(state, defender, `designation-${matrixCommander.id}`) === 1, 'Matrix Commander damage must use the selected recipient dimension.');
      compositionalCases += 1;
      metrics.supported += 3;
    }
  }
}

const publicCases = [
  ["It's a four-player Commander game. Turn order is me, Bob, Sarah, Mike. What is the turn order?", 'yes'],
  ["It's a four-player Commander game. Turn order is me, Bob, Sarah, Mike. I cast a spell, Bob passes, Sarah responds, then Mike responds. What resolves first?", 'yes'],
  ["It's a four-player Commander game with Bob, Sarah, and Mike. If Bob dies, does the game end?", 'no'],
  ["It's a four-player Commander game with Bob, Sarah, and Mike. Can I attack Bob with one creature and Sarah with another?", 'yes'],
  ["It's a four-player Commander game. Turn order is me, Bob, Sarah, Mike. If Sarah loses before her turn, does she still get a turn?", 'no'],
  ["It's a four-player Commander game with Bob, Sarah, and Mike. Each opponent loses 1 life. Does every opponent lose life?", 'yes'],
  ["It's a four-player Commander game with Bob, Sarah, and Mike. Target opponent loses 1 life. Who loses life?", 'depends'],
  ["It's a four-player Commander game. Turn order is me, Bob, Sarah, Mike. A targets Bob's Ward permanent. Does Sarah get a priority opportunity?", 'yes'],
  ["It's a four-player Commander game with Bob, Sarah, and Mike. My commander has dealt 20 to Bob and 10 to Sarah, then hits Bob for 1. Who loses?", 'yes'],
  ["It's a four-player Commander game with Bob, Sarah, and Mike. Bob controls my commander when he loses. Does my commander leave the game?", 'no'],
  ["It's a four-player Commander game. Turn order is me, Bob, Sarah, Mike. Who gets priority next?", 'depends'],
  ["It's a four-player Commander game with Bob, Sarah, and Mike. Three opponents have triggers at the same time. Whose go on the stack first?", 'depends'],
  ["In a Two-Headed Giant Commander game, who gets priority next?", 'unverified'],
  ["In a Commander game with Limited Range of Influence, who can I attack?", 'unverified']
];
for (const [message, expected] of publicCases) {
  const result = evaluateMagicScenario({ message, cards: [] });
  verify(result.verdict === expected, `Public case expected ${expected} but received ${result.verdict}: ${message}`);
  if (expected === 'depends') metrics.depends += 1;
  else if (expected === 'unverified') metrics.unverified += 1;
  else metrics.supported += 1;
}

console.log(JSON.stringify({
  verifier: 'Magic Commander Phase 9D', assertions, compositionalCases,
  publicCases: publicCases.length, ...metrics, status: 'PASS'
}, null, 2));
