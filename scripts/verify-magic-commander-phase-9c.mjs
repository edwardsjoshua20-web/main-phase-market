import {
  COMMANDER_DAMAGE_THRESHOLD,
  commanderDamageTotal,
  commanderDesignationFor,
  setCommanderDamageTotal
} from '../src/services/instajudge/magic/runtime/commanderRuntime.js';
import { createCopyEffect, deriveCharacteristics } from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import {
  COMBAT_STEPS,
  beginCombat,
  declareAttackers,
  declareBlockers,
  executeCombat,
  executeCombatDamageStep
} from '../src/services/instajudge/magic/runtime/combatRuntime.js';
import { evaluateMagicScenario } from '../src/services/instajudge/magic/ruleEvaluator.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import {
  addPermanent,
  createGameObject,
  createMagicRuntimeState,
  dealDamageToPlayerWithResult,
  markDamageWithResult,
  moveObjectWithResult,
  registerPreventionEffect,
  registerReplacementEffect,
  runStateBasedActionsRuntime
} from '../src/services/instajudge/magic/runtime/runtimeState.js';

const commanderCard = {
  id: 'phase-9c-commander', oracle_id: 'phase-9c-oracle', name: 'Damage Test Commander',
  type_line: 'Legendary Creature - Angel', mana_cost: '{3}{W}', oracle_text: '', power: '11', toughness: '11'
};

let assertions = 0;
let compositionalCases = 0;
const metrics = { verifiedSupported: 0, depends: 0, unverified: 0, incorrectConfident: 0 };

function verify(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(`Phase 9C verification failed: ${message}`);
}

function stateWithCommanders({ power = 11, abilities = [], controller = 'player', secondCommander = false } = {}) {
  const primaryCard = { ...commanderCard, power: String(power), oracle_text: abilities.join(', ') };
  const objects = [{
    id: 'commander-a', name: primaryCard.name, card: primaryCard, owner: 'player', controller, zone: 'battlefield',
    commander: true, commanderDesignationId: 'designation-a', abilities: abilities.map((keyword) => ({ type: 'KeywordAbility', keyword })), counters: {}
  }];
  const cards = [primaryCard];
  const designations = [{ id: 'designation-a', objectId: 'commander-a', ownerId: 'player', startingZone: 'battlefield', castsFromCommandZone: 0 }];
  if (secondCommander) {
    const secondCard = { ...commanderCard, id: 'phase-9c-commander-b', oracle_id: 'phase-9c-oracle-b', name: 'Other Damage Commander' };
    cards.push(secondCard);
    objects.push({
      id: 'commander-b', name: secondCard.name, card: secondCard, owner: 'player', controller: 'player', zone: 'battlefield',
      commander: true, commanderDesignationId: 'designation-b', abilities: [], counters: {}
    });
    designations.push({ id: 'designation-b', objectId: 'commander-b', ownerId: 'player', startingZone: 'battlefield', castsFromCommandZone: 0 });
  }
  const state = createMagicRuntimeState({
    cards,
    message: cards.map((card) => card.name).join(' '),
    scenario: {
      objects, continuousEffects: [], format: { id: 'commander', commanderDesignations: designations },
      game: { activePlayer: controller, phase: 'combat', step: 'beginning-of-combat', priorityHolder: controller, stackEmpty: true, factsProvided: { turn: true, phase: true, stack: true, priority: true } }
    }
  });
  state.players.player.life = 40;
  state.players.opponent.life = 40;
  return state;
}

function deal(state, { sourceId = 'commander-a', recipient = 'opponent', amount, combat = true, runSba = true } = {}) {
  const result = dealDamageToPlayerWithResult(state, recipient, amount, state.objects.get(sourceId), { combat });
  const stateBasedActions = runSba ? runStateBasedActionsRuntime(state) : [];
  return { result, stateBasedActions };
}

// Single-designation accumulation and exact thresholds.
const accumulated = stateWithCommanders();
verify(deal(accumulated, { amount: 10 }).result.commanderDamage.newTotal === 10, 'The first combat hit must establish the designation total.');
verify(!accumulated.players.opponent.lost, 'Ten Commander damage must not cause a loss.');
const lethal = deal(accumulated, { amount: 11 });
verify(lethal.result.commanderDamage.priorTotal === 10 && lethal.result.commanderDamage.newTotal === 21, 'Ten plus eleven from one designation must total 21.');
verify(accumulated.players.opponent.lost, 'The recipient must lose at the SBA checkpoint after reaching 21.');
verify(accumulated.events.some((event) => event.type === 'PlayerLost' && event.metadata.reason === 'commander combat damage'), 'Commander loss must be emitted by the SBA owner.');
metrics.verifiedSupported += 5;

for (const [amount, lost] of [[20, false], [21, true], [22, true]]) {
  const state = stateWithCommanders({ power: amount });
  const outcome = deal(state, { amount });
  verify(state.players.opponent.lost === lost, `${amount} combat damage must ${lost ? '' : 'not '}cause Commander-damage loss.`);
  verify(outcome.result.commanderDamage.newTotal === amount, 'The exact committed amount must be stored.');
  metrics.verifiedSupported += 2;
}

// Independent designations and recipient matrix.
const independent = stateWithCommanders({ secondCommander: true });
deal(independent, { amount: 10 });
deal(independent, { sourceId: 'commander-b', amount: 11 });
verify(commanderDamageTotal(independent, 'opponent', 'designation-a') === 10, 'Designation A must retain its own total.');
verify(commanderDamageTotal(independent, 'opponent', 'designation-b') === 11, 'Designation B must retain its own total.');
verify(!independent.players.opponent.lost, 'Damage from different commanders must not combine.');
deal(independent, { amount: 11 });
verify(independent.players.opponent.lost, 'A later hit that takes designation A to 21 must cause loss.');
const separateRecipients = stateWithCommanders();
deal(separateRecipients, { recipient: 'opponent', amount: 12 });
deal(separateRecipients, { recipient: 'player', amount: 9 });
verify(commanderDamageTotal(separateRecipients, 'opponent', 'designation-a') === 12 && commanderDamageTotal(separateRecipients, 'player', 'designation-a') === 9, 'Each recipient must own an independent total for the same designation.');
metrics.verifiedSupported += 5;

// Zone, turn-independent history, life gain, and control changes.
const zones = stateWithCommanders();
deal(zones, { amount: 10 });
const zoneCommander = zones.objects.get('commander-a');
moveObjectWithResult(zones, zoneCommander, 'graveyard', 'destroyed', {}, { commanderReturnChoice: 'command' });
moveObjectWithResult(zones, zoneCommander, 'battlefield', 'recast and resolved');
verify(commanderDesignationFor(zones, zoneCommander).id === 'designation-a', 'The stable designation must survive zone changes.');
deal(zones, { amount: 11 });
verify(commanderDamageTotal(zones, 'opponent', 'designation-a') === 21 && zones.players.opponent.lost, 'Zone changes and recasting must not reset Commander damage.');
const lifeGain = stateWithCommanders();
deal(lifeGain, { amount: 20 });
lifeGain.players.opponent.life += 100;
deal(lifeGain, { amount: 1 });
verify(lifeGain.players.opponent.life === 119 && lifeGain.players.opponent.lost, 'Life gain must not reduce historical Commander damage.');
const stolen = stateWithCommanders({ controller: 'opponent' });
beginCombat(stolen);
declareAttackers(stolen, [stolen.objects.get('commander-a')]);
declareBlockers(stolen, []);
verify(executeCombat(stolen).status === 'resolved', 'A stolen commander controlled by the opponent must use ordinary combat against its owner.');
verify(commanderDamageTotal(stolen, 'player', 'designation-a') === 11, 'A stolen commander must remain keyed to its stable designation when damaging its owner.');
metrics.verifiedSupported += 5;

// Same-name copies, noncombat damage, permanent damage, prevention, and replacement amounts.
const copyState = stateWithCommanders();
deal(copyState, { amount: 10 });
const copy = addPermanent(copyState, createGameObject({ id: 'same-name-copy', card: commanderCard, owner: 'player', controller: 'player', power: 11, toughness: 11 }));
dealDamageToPlayerWithResult(copyState, 'opponent', 11, copy, { combat: true });
runStateBasedActionsRuntime(copyState);
verify(commanderDamageTotal(copyState, 'opponent', 'designation-a') === 10, 'A same-name nondesignated copy must not share the designation total.');
verify(copyState.players.opponent.life === 19 && !copyState.players.opponent.lost, 'The copy still deals ordinary combat damage without creating Commander loss.');
const commanderBecomesCopy = stateWithCommanders();
const copiedCreature = addPermanent(commanderBecomesCopy, createGameObject({ name: 'Copied Creature', controller: 'player', owner: 'player', power: 4, toughness: 4 }));
createCopyEffect(commanderBecomesCopy, { target: commanderBecomesCopy.objects.get('commander-a'), source: copiedCreature });
verify(deriveCharacteristics(commanderBecomesCopy, commanderBecomesCopy.objects.get('commander-a')).name === 'Copied Creature', 'The safe copy test must prove the designated commander has copied new characteristics.');
deal(commanderBecomesCopy, { amount: 4 });
verify(commanderDamageTotal(commanderBecomesCopy, 'opponent', 'designation-a') === 4, 'A designated commander that becomes a copy must retain its stable designation for damage.');
const noncombat = stateWithCommanders();
deal(noncombat, { amount: 10 });
const noncombatResult = deal(noncombat, { amount: 11, combat: false });
verify(noncombatResult.result.commanderDamage == null && commanderDamageTotal(noncombat, 'opponent', 'designation-a') === 10, 'Noncombat damage from a commander must not count.');
const permanentDamage = stateWithCommanders();
const target = addPermanent(permanentDamage, createGameObject({ name: 'Target Creature', controller: 'opponent', owner: 'opponent', power: 30, toughness: 30 }));
const marked = markDamageWithResult(permanentDamage, target, 8, permanentDamage.objects.get('commander-a'), { combat: true });
verify(marked.dealt === 8 && commanderDamageTotal(permanentDamage, 'opponent', 'designation-a') === 0, 'Combat damage to a permanent must not count as player Commander damage.');
const prevented = stateWithCommanders();
registerPreventionEffect(prevented, { id: 'prevent-three', remaining: 3, applies: (event) => event.player === 'opponent' });
const partiallyPrevented = deal(prevented, { amount: 8 });
verify(partiallyPrevented.result.dealt === 5 && partiallyPrevented.result.commanderDamage.newTotal === 5, 'Only five damage after prevention must count.');
const fullyPrevented = stateWithCommanders();
registerPreventionEffect(fullyPrevented, { id: 'prevent-all', remaining: null, applies: (event) => event.player === 'opponent' });
const zero = deal(fullyPrevented, { amount: 8 });
verify(zero.result.dealt === 0 && zero.result.commanderDamage == null && commanderDamageTotal(fullyPrevented, 'opponent', 'designation-a') === 0, 'Fully prevented damage must add zero.');
const replaced = stateWithCommanders();
registerReplacementEffect(replaced, { id: 'reduce-damage', eventType: 'Damage', replace: (event) => ({ amount: event.amount - 3 }) });
const reduced = deal(replaced, { amount: 8 });
verify(reduced.result.replacedAmount === 5 && reduced.result.commanderDamage.newTotal === 5, 'A supported amount-changing replacement must count the final committed amount.');
metrics.verifiedSupported += 9;

// Trample, double strike, first-strike departure, and unresolved assignment.
const trample = stateWithCommanders({ power: 7, abilities: ['trample'] });
const blocker = addPermanent(trample, createGameObject({ id: 'blocker', name: 'Blocker', controller: 'opponent', owner: 'opponent', power: 2, toughness: 2 }));
beginCombat(trample);
declareAttackers(trample, [trample.objects.get('commander-a')]);
declareBlockers(trample, [{ attacker: trample.objects.get('commander-a'), blockers: [blocker] }]);
const trampleResult = executeCombat(trample, { assignments: { 'commander-a': { blocker: 2, defender: 5 } } });
verify(trampleResult.status === 'resolved' && commanderDamageTotal(trample, 'opponent', 'designation-a') === 5, 'Only trample damage assigned and dealt to the player must count.');
const doubleStrike = stateWithCommanders({ power: 5, abilities: ['double strike'] });
beginCombat(doubleStrike);
declareAttackers(doubleStrike, [doubleStrike.objects.get('commander-a')]);
declareBlockers(doubleStrike, []);
verify(executeCombat(doubleStrike).status === 'resolved' && commanderDamageTotal(doubleStrike, 'opponent', 'designation-a') === 10, 'Both double-strike damage steps must count.');
const firstOnly = stateWithCommanders({ power: 5, abilities: ['double strike'] });
beginCombat(firstOnly);
declareAttackers(firstOnly, [firstOnly.objects.get('commander-a')]);
declareBlockers(firstOnly, []);
const first = executeCombatDamageStep(firstOnly, { step: COMBAT_STEPS.FIRST_STRIKE_DAMAGE });
moveObjectWithResult(firstOnly, firstOnly.objects.get('commander-a'), 'graveyard', 'removed after first strike', {}, { commanderReturnChoice: 'remain' });
const regular = executeCombatDamageStep(firstOnly, { step: COMBAT_STEPS.COMBAT_DAMAGE });
verify(first.status === 'resolved' && regular.status === 'resolved' && commanderDamageTotal(firstOnly, 'opponent', 'designation-a') === 5, 'A commander that leaves after first-strike damage must not deal regular-step damage.');
const pending = stateWithCommanders({ power: 7, abilities: ['trample'] });
const pendingBlocker = addPermanent(pending, createGameObject({ id: 'pending-blocker', name: 'Pending Blocker', controller: 'opponent', owner: 'opponent', power: 2, toughness: 2 }));
beginCombat(pending);
declareAttackers(pending, [pending.objects.get('commander-a')]);
declareBlockers(pending, [{ attacker: pending.objects.get('commander-a'), blockers: [pendingBlocker] }]);
const pendingResult = executeCombat(pending);
verify(pendingResult.status === 'depends' && commanderDamageTotal(pending, 'opponent', 'designation-a') === 0, 'An unresolved trample assignment must not count damage early.');
metrics.verifiedSupported += 4;

// SBA timing is observably after the committed damage event.
const timing = stateWithCommanders();
setCommanderDamageTotal(timing, 'opponent', 'designation-a', 20);
const beforeSba = deal(timing, { amount: 1, runSba: false });
verify(beforeSba.result.commanderDamage.newTotal === 21 && !timing.players.opponent.lost, 'Reaching 21 must not mark loss in the middle of damage commitment.');
runStateBasedActionsRuntime(timing);
verify(timing.players.opponent.lost, 'The subsequent SBA checkpoint must mark the loss.');
verify(timing.events.findIndex((event) => event.type === 'CommanderCombatDamageRecorded') < timing.events.findIndex((event) => event.type === 'PlayerLost'), 'The event trace must place accounting before SBA loss.');
metrics.verifiedSupported += 3;

// Deterministic compositional matrix around the threshold.
for (const prior of [19, 20, 21, 22]) {
  for (const incoming of [0, 1, 2]) {
    for (const combat of [false, true]) {
      for (const prevention of [0, 1]) {
        for (const designated of [false, true]) {
          const state = stateWithCommanders();
          setCommanderDamageTotal(state, 'opponent', 'designation-a', prior);
          const source = designated ? state.objects.get('commander-a') : addPermanent(state, createGameObject({ name: commanderCard.name, card: commanderCard, controller: 'player', owner: 'player' }));
          if (prevention) registerPreventionEffect(state, { id: `matrix-prevent-${compositionalCases}`, remaining: prevention, applies: (event) => event.player === 'opponent' });
          const result = dealDamageToPlayerWithResult(state, 'opponent', incoming, source, { combat });
          runStateBasedActionsRuntime(state);
          const expectedIncrement = designated && combat ? Math.max(0, incoming - prevention) : 0;
          const expectedTotal = prior + expectedIncrement;
          const expectedLoss = expectedTotal >= COMMANDER_DAMAGE_THRESHOLD;
          verify(commanderDamageTotal(state, 'opponent', 'designation-a') === expectedTotal, 'Matrix total must derive from designation, combat metadata, and post-prevention damage.');
          verify(state.players.opponent.lost === expectedLoss, 'Matrix loss must derive independently from the 21+ invariant.');
          verify((result.commanderDamage?.damageDealt || 0) === expectedIncrement, 'Matrix structured damage must expose the actual counted increment.');
          compositionalCases += 1;
          metrics.verifiedSupported += 3;
        }
      }
    }
  }
}

const compilerCases = [
  ['My commander has already dealt 18 combat damage to Bob. If it hits for 3, does he lose?', 18, 3, 'opponent'],
  ['This commander has hit me for 14 commander damage. Does that count?', 14, null, 'player'],
  ['My commander dealt 10 damage and my other commander dealt 11. Is that 21 commander damage?', 10, null, 'opponent']
];
for (const [message, prior, incoming, recipient] of compilerCases) {
  const compiled = compileMagicScenario({ message, cards: [] }).format.commanderDamage;
  verify(compiled.known && compiled.prior[0].amount === prior && (compiled.incoming?.amount ?? null) === incoming && compiled.recipientId === recipient, 'Unambiguous Commander-damage language must compile to canonical state facts.');
  metrics.verifiedSupported += 1;
}

const publicCases = [
  ['My commander has dealt 20 combat damage to him. If it hits for 1, does he lose?', 'yes'],
  ['My commander dealt 10 combat damage earlier and later hits for 11. Does he lose?', 'yes'],
  ['My commander dealt 10 damage and my other commander dealt 11. Is that 21 commander damage?', 'no'],
  ['My commander dealt 20 combat damage earlier, but he gained 20 life. Does one more commander damage kill him?', 'yes'],
  ['If my commander Lightning Bolts someone, does that count as commander damage?', 'no'],
  ['Does 5 trample damage from my commander to a player count?', 'yes'],
  ['My commander would deal 8 combat damage, but 3 is prevented. How much commander damage counts?', 'yes'],
  ['My opponent stole my commander and hit me with it. Does that count toward commander damage?', 'yes'],
  ['I am not sure which commander dealt the prior commander damage. Does he lose at 21?', 'depends'],
  ['My commander has some unknown amount of commander damage. If it hits for 1, does he lose?', 'depends'],
  ['My face-down commander copy deals combat damage. Does it count as commander damage?', 'unverified'],
  ['An unknown replacement changes my commander damage. Does it count?', 'unverified']
];
for (const [message, expected] of publicCases) {
  const runtime = evaluateMagicRulesRuntime({ message, cards: [] });
  const publicResult = evaluateMagicScenario({ message, cards: [], rules: [] });
  verify(runtime.verdict === expected, `Runtime verdict for "${message}" must be ${expected}, received ${runtime.verdict}.`);
  verify(publicResult.verdict === expected, `Public verdict for "${message}" must be ${expected}, received ${publicResult.verdict}.`);
  if (expected === 'depends') metrics.depends += 1;
  else if (expected === 'unverified') metrics.unverified += 1;
  else metrics.verifiedSupported += 1;
}

verify(COMMANDER_DAMAGE_THRESHOLD === 21, 'The canonical Commander-damage threshold must be 21.');
verify(metrics.incorrectConfident === 0, 'Phase 9C requires zero incorrect confident rulings.');

console.log(JSON.stringify({
  verifier: 'Magic Commander Phase 9C',
  assertions,
  compositionalCases,
  publicCases: publicCases.length,
  ...metrics,
  status: 'PASS'
}, null, 2));
