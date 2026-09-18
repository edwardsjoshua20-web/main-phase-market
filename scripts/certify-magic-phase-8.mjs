import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { beginCombat, combatNeedsFirstStrikeStep, declareAttackers, declareBlockers, executeCombatDamageStep } from '../src/services/instajudge/magic/runtime/combatRuntime.js';
import { CONTINUOUS_LAYERS, PT_SUBLAYERS, createContinuousEffect } from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import { PAYMENT_STATUS, createManaCost } from '../src/services/instajudge/magic/runtime/costSystem.js';
import { createGenericZoneCard } from '../src/services/instajudge/magic/runtime/effectRuntime.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { parseOracleSemantics } from '../src/services/instajudge/magic/runtime/oracleSemantics.js';
import { addPermanent, createGameObject, createMagicRuntimeState, moveObjectWithResult } from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import { SPECIAL_ACTION_TYPES, checkSpecialAction, executeSpecialAction, setLandPlayAllowance } from '../src/services/instajudge/magic/runtime/specialActionRuntime.js';
import { activateAbility, castSpell, checkTimingPermission, grantPriority, passPriority, resolveTopOfStack } from '../src/services/instajudge/magic/runtime/stackRuntime.js';
import { TURN_STEPS, advanceTurnStep, executeCurrentTurnBasedAction } from '../src/services/instajudge/magic/runtime/turnRuntime.js';

const metrics = { verifiedSupported: 0, depends: 0, unverified: 0, incorrectConfident: 0, compositionalCases: 0 };
const started = performance.now();

function verify(condition, message) {
  assert(condition, message);
  metrics.verifiedSupported += 1;
}

function classify(actual, expected, message) {
  const value = actual?.verdict || actual?.status;
  if (value !== expected) {
    if (['yes', 'no', 'allowed', 'denied'].includes(value) && ['depends', 'unverified', 'unsupported'].includes(expected)) metrics.incorrectConfident += 1;
    assert.equal(value, expected, message);
  }
  if (expected === 'depends') metrics.depends += 1;
  else if (expected === 'unverified' || expected === 'unsupported') metrics.unverified += 1;
  else metrics.verifiedSupported += 1;
}

function phaseFor(step) {
  if ([TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW].includes(step)) return 'beginning';
  if ([TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(step)) return 'main';
  if ([TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP].includes(step)) return 'ending';
  return 'combat';
}

const combatSteps = new Set([
  TURN_STEPS.BEGINNING,
  TURN_STEPS.DECLARE_ATTACKERS,
  TURN_STEPS.DECLARE_BLOCKERS,
  TURN_STEPS.FIRST_STRIKE_DAMAGE,
  TURN_STEPS.COMBAT_DAMAGE,
  TURN_STEPS.END
]);

function stateAt(step, { activePlayer = 'player', priorityHolder = activePlayer, stackDepth = 0, used = 0, allowed = 1, combatWindow = true } = {}) {
  const state = createMagicRuntimeState({
    scenario: {
      objects: [], continuousEffects: [],
      game: { activePlayer, phase: phaseFor(step), step, priorityHolder, landPlaysAllowed: allowed, landPlaysUsed: used }
    }
  });
  state.game.priorityHolder = priorityHolder;
  if (step === TURN_STEPS.DRAW) state.game.turnBasedActionState.status = 'complete';
  if (combatSteps.has(step)) state.combat = { priorityWindows: combatWindow ? [step] : [], step, attackers: [] };
  for (let index = 0; index < stackDepth; index += 1) state.stack.push({ id: `matrix-stack-${index}`, kind: 'Spell' });
  return state;
}

function creature(state, { name, controller = 'player', power = 2, toughness = 2, abilities = [], oracleText = '' } = {}) {
  return addPermanent(state, createGameObject({
    card: { name, typeLine: 'Creature', oracleText, power, toughness },
    controller,
    owner: controller,
    power,
    toughness,
    abilities: abilities.map((keyword) => ({ keyword, text: keyword }))
  }));
}

function landInHand(state, name = 'Certification Plains', playerId = 'player') {
  return createGenericZoneCard(state, { playerId, zone: 'hand', name, typeLine: 'Basic Land - Plains' });
}

const cards = {
  instant: { name: 'Certification Bolt', typeLine: 'Instant', oracleText: 'Certification Bolt deals 3 damage to any target.' },
  sorcery: { name: 'Certification Divination', typeLine: 'Sorcery', oracleText: 'Draw two cards.' },
  destroy: { name: 'Certification Verdict', typeLine: 'Instant', oracleText: 'Destroy target creature.' },
  creature: { name: 'Certification Bear', typeLine: 'Creature - Bear', oracleText: '', power: 2, toughness: 2 },
  flash: { name: 'Certification Ambusher', typeLine: 'Creature - Rogue', oracleText: 'Flash', power: 2, toughness: 1 },
  murder: { name: 'Certification Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.' },
  pump: { name: 'Certification Growth', typeLine: 'Instant', oracleText: 'Target creature gets +3/+3 until end of turn.' }
};

const allSteps = [
  TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW, TURN_STEPS.PRECOMBAT_MAIN,
  TURN_STEPS.BEGINNING, TURN_STEPS.DECLARE_ATTACKERS, TURN_STEPS.DECLARE_BLOCKERS,
  TURN_STEPS.FIRST_STRIKE_DAMAGE, TURN_STEPS.COMBAT_DAMAGE, TURN_STEPS.END,
  TURN_STEPS.POSTCOMBAT_MAIN, TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP
];
const cardClasses = [cards.instant, cards.sorcery, cards.creature, cards.flash];
const activatedAbilities = [
  parseOracleSemantics({ name: 'Certification Quick Device', typeLine: 'Artifact', oracleText: '{T}: Draw a card.' }).activatedAbilitiesIR[0],
  parseOracleSemantics({ name: 'Certification Slow Device', typeLine: 'Artifact', oracleText: '{T}: Draw a card. Activate only as a sorcery.' }).activatedAbilitiesIR[0]
];

function expectedTiming({ step, activePlayer, priorityHolder, stackDepth, card }) {
  const windowOpen = step !== TURN_STEPS.UNTAP && step !== TURN_STEPS.CLEANUP && priorityHolder != null;
  const instantSpeed = card.typeLine === 'Instant' || /\bflash\b/i.test(card.oracleText);
  if (!windowOpen || priorityHolder !== 'player') return false;
  if (instantSpeed) return true;
  return activePlayer === 'player'
    && [TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(step)
    && stackDepth === 0;
}

for (const step of allSteps) {
  for (const activePlayer of ['player', 'opponent']) {
    for (const priorityHolder of ['player', 'opponent', null]) {
      for (const stackDepth of [0, 1]) {
        for (const card of cardClasses) {
          const state = stateAt(step, { activePlayer, priorityHolder, stackDepth });
          const result = checkTimingPermission({ state, card, actionType: 'Cast', playerId: 'player' });
          const expected = expectedTiming({ step, activePlayer, priorityHolder, stackDepth, card });
          verify(result.allowed === expected, `Timing matrix mismatch: ${card.typeLine}/${step}/${activePlayer}/${priorityHolder}/${stackDepth}.`);
          metrics.compositionalCases += 1;
        }
      }
    }
  }
}

for (const step of allSteps) {
  for (const activePlayer of ['player', 'opponent']) {
    for (const priorityHolder of ['player', 'opponent', null]) {
      for (const stackDepth of [0, 1]) {
        for (const ability of activatedAbilities) {
          const state = stateAt(step, { activePlayer, priorityHolder, stackDepth });
          const result = checkTimingPermission({ state, ability, actionType: 'Activate', playerId: 'player' });
          const sorceryOnly = ability.restrictions.some((restriction) => restriction.mode === 'sorcery');
          const expected = expectedTiming({ step, activePlayer, priorityHolder, stackDepth, card: sorceryOnly ? cards.sorcery : cards.instant });
          verify(result.allowed === expected, `Ability timing matrix mismatch: ${sorceryOnly ? 'sorcery' : 'ordinary'}/${step}/${activePlayer}/${priorityHolder}/${stackDepth}.`);
          metrics.compositionalCases += 1;
        }
      }
    }
  }
}

function expectedLand({ step, activePlayer, priorityHolder, stackDepth, used, allowed = 1 }) {
  return activePlayer === 'player'
    && priorityHolder === 'player'
    && [TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(step)
    && stackDepth === 0
    && used < allowed;
}

for (const step of allSteps) {
  for (const activePlayer of ['player', 'opponent']) {
    for (const priorityHolder of ['player', 'opponent', null]) {
      for (const stackDepth of [0, 1]) {
        for (const used of [0, 1]) {
          const state = stateAt(step, { activePlayer, priorityHolder, stackDepth, used });
          const object = landInHand(state);
          const result = checkSpecialAction({ state, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object });
          verify(result.allowed === expectedLand({ step, activePlayer, priorityHolder, stackDepth, used }), `Land matrix mismatch: ${step}/${activePlayer}/${priorityHolder}/${stackDepth}/${used}.`);
          metrics.compositionalCases += 1;
        }
      }
    }
  }
}

let seed = 0x8d2026;
function random(max) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed % max;
}
for (let index = 0; index < 400; index += 1) {
  const step = allSteps[random(allSteps.length)];
  const activePlayer = ['player', 'opponent'][random(2)];
  const priorityHolder = ['player', 'opponent', null][random(3)];
  const stackDepth = random(2);
  const card = cardClasses[random(cardClasses.length)];
  const state = stateAt(step, { activePlayer, priorityHolder, stackDepth });
  const result = checkTimingPermission({ state, card, actionType: 'Cast', playerId: 'player' });
  verify(result.allowed === expectedTiming({ step, activePlayer, priorityHolder, stackDepth, card }), `Seeded timing mismatch at case ${index}.`);
  metrics.compositionalCases += 1;
}

const noMidDeclaration = stateAt(TURN_STEPS.DECLARE_ATTACKERS, { combatWindow: false });
verify(!checkTimingPermission({ state: noMidDeclaration, card: cards.instant, actionType: 'Cast', playerId: 'player' }).allowed, 'No priority action may occur during attacker declaration itself.');

const turn = stateAt(TURN_STEPS.UNTAP, { priorityHolder: null });
createGenericZoneCard(turn, { playerId: 'player', zone: 'library', name: 'Player Draw' });
const observedSteps = [turn.game.step];
let turnGuard = 0;
while (!(turn.game.turn === 2 && turn.game.step === TURN_STEPS.UNTAP)) {
  const before = turn.game.step;
  if (turn.game.priorityHolder) {
    const firstPlayer = turn.game.priorityHolder;
    const secondPlayer = firstPlayer === 'player' ? 'opponent' : 'player';
    verify(passPriority(turn, firstPlayer).allowed, `Priority pass failed for ${firstPlayer} during ${before}.`);
    verify(passPriority(turn, secondPlayer).allowed, `Priority pass failed for ${secondPlayer} during ${before}.`);
  } else {
    const result = advanceTurnStep(turn);
    verify(result.status === 'advanced', `Empty-combat turn progression failed from ${before}.`);
  }
  if (turn.game.step !== before) observedSteps.push(turn.game.step);
  turnGuard += 1;
  verify(turnGuard < 40, 'Ordinary turn progression must not loop.');
}
const emptyCombatSteps = allSteps.filter((step) => step !== TURN_STEPS.FIRST_STRIKE_DAMAGE);
verify(observedSteps.join('|') === emptyCombatSteps.join('|') + `|${TURN_STEPS.UNTAP}`, 'Ordinary empty-combat turn progression must visit every applicable canonical step exactly once.');

const stackTurn = stateAt(TURN_STEPS.UPKEEP);
createGenericZoneCard(stackTurn, { playerId: 'player', zone: 'library', name: 'Stack Turn Draw' });
const cast = castSpell(stackTurn, { card: cards.instant, controller: 'player' });
verify(cast.cast && advanceTurnStep(stackTurn).status === 'paused', 'A spell on the stack must block turn advancement.');
verify(passPriority(stackTurn, 'player').allowed, 'The caster must be able to pass priority.');
verify(passPriority(stackTurn, 'opponent').resolved && stackTurn.stack.length === 0, 'Two passes must resolve the top stack object.');
verify(stackTurn.game.priorityHolder === 'player', 'The active player must receive priority after resolution.');
passPriority(stackTurn, 'player');
const stackAdvance = passPriority(stackTurn, 'opponent');
verify(stackAdvance.advancedTo === TURN_STEPS.DRAW && stackTurn.game.step === TURN_STEPS.DRAW, 'Only a later pair of passes on the empty stack may advance the step.');

for (const step of [TURN_STEPS.UPKEEP, TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.DECLARE_ATTACKERS, TURN_STEPS.DECLARE_BLOCKERS, TURN_STEPS.FIRST_STRIKE_DAMAGE, TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP]) {
  const blocked = stateAt(step, { stackDepth: 1 });
  verify(advanceTurnStep(blocked).status === 'paused' && blocked.game.step === step, `A nonempty stack must block advancement during ${step}.`);
}

const landStack = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const landAfterResolution = landInHand(landStack);
castSpell(landStack, { card: cards.instant, controller: 'player' });
verify(!checkSpecialAction({ state: landStack, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object: landAfterResolution }).allowed, 'A land play must be denied while a spell is on the stack.');
passPriority(landStack, 'player');
passPriority(landStack, 'opponent');
verify(checkSpecialAction({ state: landStack, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object: landAfterResolution }).allowed, 'A land play must become legal after the stack resolves and priority returns.');

const firstStrike = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const firstAttacker = creature(firstStrike, { name: 'Certification First Striker', power: 3, toughness: 3, abilities: ['first strike'] });
const smallBlocker = creature(firstStrike, { name: 'Certification Small Blocker', controller: 'opponent', power: 2, toughness: 2 });
beginCombat(firstStrike);
declareAttackers(firstStrike, [firstAttacker]);
declareBlockers(firstStrike, [{ attacker: firstAttacker, blockers: [smallBlocker] }]);
const firstDamage = executeCombatDamageStep(firstStrike, { step: TURN_STEPS.FIRST_STRIKE_DAMAGE });
verify(firstDamage.status === 'resolved' && smallBlocker.zone === 'graveyard' && firstStrike.game.priorityHolder === 'player', 'First-strike damage must run SBAs before opening the real gap.');
passPriority(firstStrike, 'player');
verify(passPriority(firstStrike, 'opponent').advancedTo === TURN_STEPS.COMBAT_DAMAGE, 'Regular damage must begin only after both players pass in the first-strike gap.');

const gapRemoval = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const doubleAttacker = creature(gapRemoval, { name: 'Certification Double Striker', power: 2, toughness: 2, abilities: ['double strike'] });
const largeBlocker = creature(gapRemoval, { name: 'Certification Large Blocker', controller: 'opponent', power: 5, toughness: 5 });
beginCombat(gapRemoval);
declareAttackers(gapRemoval, [doubleAttacker]);
declareBlockers(gapRemoval, [{ attacker: doubleAttacker, blockers: [largeBlocker] }]);
executeCombatDamageStep(gapRemoval, { step: TURN_STEPS.FIRST_STRIKE_DAMAGE });
castSpell(gapRemoval, { card: cards.murder, controller: 'player', targets: [largeBlocker] });
passPriority(gapRemoval, 'player');
passPriority(gapRemoval, 'opponent', { resolve: () => resolveTopOfStack(gapRemoval, { resolveEffect: ({ target }) => moveObjectWithResult(gapRemoval, target, 'graveyard', 'certification removal') }) });
passPriority(gapRemoval, 'player');
verify(passPriority(gapRemoval, 'opponent').advancedTo === TURN_STEPS.COMBAT_DAMAGE, 'Regular damage must wait for a fresh pass cycle after a first-strike-gap spell resolves.');
verify(largeBlocker.zone === 'graveyard' && gapRemoval.players.opponent.life === 20, 'Removing a blocker in the first-strike gap must preserve blocked state without trample.');

const gapPump = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const pumpAttacker = creature(gapPump, { name: 'Certification Pump Striker', power: 1, toughness: 1, abilities: ['double strike'] });
beginCombat(gapPump);
declareAttackers(gapPump, [pumpAttacker]);
declareBlockers(gapPump, []);
executeCombatDamageStep(gapPump, { step: TURN_STEPS.FIRST_STRIKE_DAMAGE });
castSpell(gapPump, { card: cards.pump, controller: 'player', targets: [pumpAttacker] });
passPriority(gapPump, 'player');
passPriority(gapPump, 'opponent', { resolve: () => resolveTopOfStack(gapPump, { resolveEffect: () => createContinuousEffect(gapPump, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.MODIFY, duration: 'until-end-of-turn', appliesTo: { objectId: pumpAttacker.id }, modification: { kind: 'pt', mode: 'modify', power: 3, toughness: 3 } }) }) });
passPriority(gapPump, 'player');
verify(passPriority(gapPump, 'opponent').advancedTo === TURN_STEPS.COMBAT_DAMAGE, 'A first-strike-gap pump must resolve before the pass cycle that begins regular damage.');
verify(gapPump.players.opponent.life === 15, 'A pump spell resolved in the first-strike gap must affect regular double-strike damage.');

const noFirstStrike = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const ordinaryAttacker = creature(noFirstStrike, { name: 'Certification Ordinary Attacker' });
beginCombat(noFirstStrike);
declareAttackers(noFirstStrike, [ordinaryAttacker]);
declareBlockers(noFirstStrike, []);
verify(!combatNeedsFirstStrikeStep(noFirstStrike) && executeCombatDamageStep(noFirstStrike, { step: TURN_STEPS.FIRST_STRIKE_DAMAGE }).status === 'skipped', 'Combat without first/double strike must not manufacture a first-strike gap.');

const cleanup = stateAt(TURN_STEPS.CLEANUP, { priorityHolder: null });
const cleanupHand = Array.from({ length: 8 }, (_, index) => createGenericZoneCard(cleanup, { playerId: 'player', zone: 'hand', name: `Cleanup ${index}` }));
classify(executeCurrentTurnBasedAction(cleanup), 'depends', 'Cleanup must request a discard choice.');
const cleanupInstant = checkTimingPermission({ state: cleanup, card: cards.instant, actionType: 'Cast', playerId: 'player' });
classify(cleanupInstant, 'depends', 'A pending cleanup choice must block casting.');
const cleanupAbility = parseOracleSemantics({ name: 'Choice Device', typeLine: 'Artifact', oracleText: '{T}: Draw a card.' }).activatedAbilitiesIR[0];
classify(checkTimingPermission({ state: cleanup, ability: cleanupAbility, actionType: 'Activate', playerId: 'player' }), 'depends', 'A pending cleanup choice must block activation.');
classify(checkSpecialAction({ state: cleanup, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', card: { name: 'Choice Land', typeLine: 'Land' }, sourceZone: 'hand' }), 'depends', 'A pending cleanup choice must block land play.');
classify(passPriority(cleanup, 'player'), 'depends', 'A pending cleanup choice must block priority passing.');
cleanup.stack.push({ id: 'forced-resolution', kind: 'Spell' });
classify(resolveTopOfStack(cleanup), 'depends', 'A pending cleanup choice must block forced stack resolution.');
cleanup.stack.length = 0;
classify(advanceTurnStep(cleanup), 'depends', 'A pending cleanup choice must block turn advancement.');
verify(executeCurrentTurnBasedAction(cleanup, { discardCardIds: [cleanupHand[0].id] }).status === 'executed' && cleanup.pendingChoices.length === 0, 'Supplying the cleanup choice must clear the canonical blocker.');

const replacement = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const commander = creature(replacement, { name: 'Certification Commander' });
commander.commander = true;
const replacementPending = moveObjectWithResult(replacement, commander, 'hand', 'certification replacement');
classify(replacementPending, 'depends', 'An optional replacement must create a pending choice.');
classify(checkTimingPermission({ state: replacement, card: cards.instant, actionType: 'Cast', playerId: 'player' }), 'depends', 'An unresolved replacement choice must block priority actions.');
verify(moveObjectWithResult(replacement, commander, 'hand', 'certification replacement', {}, { replacementChoices: [`decline:commander-zone:${commander.id}`] }).status === 'committed' && replacement.pendingChoices.length === 0, 'Resolving the replacement choice must clear the blocker.');

const wardTurn = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const wardedCreature = addPermanent(wardTurn, createGameObject({
  card: { name: 'Certification Ward Target', typeLine: 'Creature', oracleText: 'Ward {2}', power: 2, toughness: 2 },
  controller: 'opponent', owner: 'opponent', power: 2, toughness: 2,
  abilities: [{ keyword: 'ward', cost: createManaCost('{2}'), text: 'Ward {2}' }]
}));
const wardCast = castSpell(wardTurn, { card: cards.destroy, controller: 'player', targets: [wardedCreature] });
verify(wardCast.cast && wardTurn.stack.length === 2 && advanceTurnStep(wardTurn).status === 'paused', 'A Ward trigger and its targeted spell must keep the main-phase turn from advancing.');
verify(passPriority(wardTurn, 'player').allowed, 'The active player must be able to pass over the Ward trigger.');
const unresolvedWard = passPriority(wardTurn, 'opponent');
classify(unresolvedWard, 'depends', 'An unspecified Ward payment must pause stack resolution.');
verify(wardTurn.pendingChoices[0]?.type === 'WardPaymentChoice' && wardTurn.game.priorityHolder === null, 'An unresolved Ward payment must become the canonical pending choice without granting priority.');
classify(checkTimingPermission({ state: wardTurn, card: cards.instant, actionType: 'Cast', playerId: 'player' }), 'depends', 'A pending Ward payment must block casting.');
classify(checkSpecialAction({ state: wardTurn, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object: landInHand(wardTurn, 'Ward Choice Land') }), 'depends', 'A pending Ward payment must block land play.');
classify(advanceTurnStep(wardTurn), 'depends', 'A pending Ward payment must block turn advancement.');
classify(resolveTopOfStack(wardTurn), 'depends', 'A pending Ward payment must block forced stack resolution without a payment choice.');
const wardTrigger = wardTurn.stack.at(-1);
const unpaidWard = resolveTopOfStack(wardTurn, { paymentChoices: [{ triggerId: wardTrigger.id, status: PAYMENT_STATUS.UNPAID }] });
verify(unpaidWard.resolved && unpaidWard.countered === wardCast.stackObject && wardTurn.stack.length === 0 && wardTurn.pendingChoices.length === 0, 'Resolving Ward unpaid must clear the choice and counter the original spell.');
grantPriority(wardTurn, 'player');
passPriority(wardTurn, 'player');
verify(passPriority(wardTurn, 'opponent').advancedTo === TURN_STEPS.BEGINNING, 'Turn progression must resume normally after Ward fully resolves.');

const combatWard = stateAt(TURN_STEPS.DECLARE_ATTACKERS);
const combatWardTarget = addPermanent(combatWard, createGameObject({
  card: { name: 'Combat Ward Target', typeLine: 'Creature', oracleText: 'Ward {1}', power: 2, toughness: 2 },
  controller: 'opponent', owner: 'opponent', power: 2, toughness: 2,
  abilities: [{ keyword: 'ward', cost: createManaCost('{1}'), text: 'Ward {1}' }]
}));
const combatWardCast = castSpell(combatWard, { card: cards.destroy, controller: 'player', targets: [combatWardTarget] });
verify(combatWardCast.cast && combatWard.stack.length === 2 && advanceTurnStep(combatWard).status === 'paused', 'A combat-window Ward interaction must block combat progression.');
const combatWardTrigger = combatWard.stack.at(-1);
passPriority(combatWard, 'player');
const paidWardPass = passPriority(combatWard, 'opponent', { resolve: () => resolveTopOfStack(combatWard, { paymentChoices: [{ triggerId: combatWardTrigger.id, status: PAYMENT_STATUS.PAID }] }) });
verify(paidWardPass.resolved && !paidWardPass.result.countered && combatWard.stack.length === 1, 'Paid Ward in a combat window must leave the original spell on the stack.');
passPriority(combatWard, 'player');
verify(passPriority(combatWard, 'opponent').resolved && combatWard.stack.length === 0, 'The original combat-window spell must resolve only after another complete priority pass cycle.');

const combatChoice = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const trampler = creature(combatChoice, { name: 'Certification Trampler', power: 5, toughness: 5, abilities: ['trample'] });
const trampleBlocker = creature(combatChoice, { name: 'Certification Trample Blocker', controller: 'opponent', power: 2, toughness: 2 });
beginCombat(combatChoice);
declareAttackers(combatChoice, [trampler]);
declareBlockers(combatChoice, [{ attacker: trampler, blockers: [trampleBlocker] }]);
classify(executeCombatDamageStep(combatChoice), 'depends', 'Ambiguous trample assignment must create a pending combat choice.');
classify(checkTimingPermission({ state: combatChoice, card: cards.instant, actionType: 'Cast', playerId: 'player' }), 'depends', 'A pending combat-damage choice must block casting.');
verify(executeCombatDamageStep(combatChoice, { assignments: { [trampler.id]: { [trampleBlocker.id]: 2, defender: 3 } } }).status === 'resolved' && combatChoice.pendingChoices.length === 0, 'Supplying combat damage assignment must clear the blocker and resolve damage.');

const additionalLand = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { used: 1 });
setLandPlayAllowance(additionalLand, { allowed: 2 });
verify(executeSpecialAction(additionalLand, { actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object: landInHand(additionalLand) }).executed, 'A trusted two-land allowance must execute the second land.');
verify(!checkSpecialAction({ state: additionalLand, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object: landInHand(additionalLand, 'Certification Third Land') }).allowed, 'A trusted two-land allowance must deny the third land.');

const cleanupLoop = stateAt(TURN_STEPS.CLEANUP, { priorityHolder: null });
const temporarilyAlive = creature(cleanupLoop, { name: 'Certification Temporary Creature', power: 0, toughness: 0 });
createContinuousEffect(cleanupLoop, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.MODIFY, duration: 'until-end-of-turn', appliesTo: { objectId: temporarilyAlive.id }, modification: { kind: 'pt', mode: 'modify', power: 1, toughness: 1 } });
const cleanupException = executeCurrentTurnBasedAction(cleanupLoop);
verify(cleanupException.repeatRequired && temporarilyAlive.zone === 'graveyard' && cleanupLoop.game.priorityHolder === 'player', 'Cleanup expiry must run SBAs and open the supported exception window.');
passPriority(cleanupLoop, 'player');
passPriority(cleanupLoop, 'opponent');
verify(cleanupLoop.game.turn === 2 && cleanupLoop.game.step === TURN_STEPS.UNTAP && cleanupLoop.events.filter((event) => event.type === 'CleanupIterationCompleted').length === 2, 'Cleanup exception must stabilize through one additional cleanup without looping.');

const publicCases = [
  ["I have priority during my opponent's upkeep. Can I cast Certification Bolt now?", [cards.instant], 'yes'],
  ['It is my turn, I have priority during my postcombat main phase, and the stack is empty. Can I cast Certification Bear now?', [cards.creature], 'yes'],
  ['I have priority. Can I cast Certification Divination in response to Certification Bolt?', [cards.sorcery, cards.instant], 'no'],
  ['Can I cast Certification Bolt between first strike damage and regular combat damage?', [cards.instant], 'yes'],
  ["It is my turn, I have priority during my postcombat main phase, the stack is empty, and I haven't played a land. Can I play Certification Plains from my hand?", [{ name: 'Certification Plains', typeLine: 'Basic Land - Plains', oracleText: '' }], 'yes'],
  ["It is my turn, I have priority during my main phase, the stack is empty, and I already played a land. Can I play Certification Plains from my hand?", [{ name: 'Certification Plains', typeLine: 'Basic Land - Plains', oracleText: '' }], 'no'],
  ["It is my turn, I have priority during my main phase, a spell is on the stack, and I haven't played a land. Can I play Certification Plains from my hand?", [{ name: 'Certification Plains', typeLine: 'Basic Land - Plains', oracleText: '' }], 'no'],
  ['Can I cast Certification Bolt during stable cleanup on my turn while the stack is empty?', [cards.instant], 'no'],
  ['Can I turn this face-down creature face up right now?', [], 'unverified'],
  ['Can I cast Certification Bolt right now?', [cards.instant], 'depends']
];
for (const [message, suppliedCards, expected] of publicCases) {
  const result = evaluateMagicRulesRuntime({ message, cards: suppliedCards });
  classify(result, expected, `Public InstaJudge mismatch: ${message}`);
  verify(result.trace?.some((entry) => /TimingPermissionChecked|SpecialActionPermissionChecked/.test(entry.type)), `Public result must trace to a canonical owner: ${message}`);
}

const dynamicFlash = checkTimingPermission({ state: stateAt(TURN_STEPS.UPKEEP), card: { name: 'Dynamic Flash', typeLine: 'Creature', oracleText: 'You may cast this spell as though it had flash.' }, actionType: 'Cast', playerId: 'player' });
classify(dynamicFlash, 'unverified', 'Dynamic flash-like permission must fail closed.');
classify(checkSpecialAction({ state: stateAt(TURN_STEPS.PRECOMBAT_MAIN), actionType: SPECIAL_ACTION_TYPES.TURN_FACE_UP, playerId: 'player' }), 'unverified', 'Unsupported face-up action must fail closed.');

const oracle = parseOracleSemantics({ name: 'Certification Device', typeLine: 'Artifact', oracleText: '{T}: Draw a card. Activate only as a sorcery.' });
verify(oracle.activatedAbilitiesIR[0]?.restrictions?.[0]?.mode === 'sorcery', 'Oracle semantics must preserve explicit sorcery-speed activation restrictions.');
const compiled = compileMagicScenario({ message: "It is my turn, I have priority during my postcombat main phase, the stack is empty, and I haven't played a land. Can I play Certification Plains from my hand?", cards: [{ name: 'Certification Plains', typeLine: 'Basic Land - Plains', oracleText: '' }] });
verify(compiled.actions[0]?.type === 'Play' && compiled.actions[0]?.zoneTo === 'battlefield' && compiled.game.factsProvided.landAllowance, 'Scenario compiler must represent land play as a special action with canonical state facts.');

metrics.durationMs = Math.round(performance.now() - started);
assert.equal(metrics.incorrectConfident, 0, 'Phase 8 certification cannot pass with an incorrect confident ruling.');
console.log('Magic Phase 8 integrated certification passed.');
console.log('- Turn, priority, stack, combat, cleanup, land play, pending choices, replacements, and public routing: certified');
console.log(`- Metrics: ${JSON.stringify(metrics)}`);
