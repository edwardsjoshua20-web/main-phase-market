import assert from 'node:assert/strict';
import { CONTINUOUS_LAYERS, PT_SUBLAYERS, createContinuousEffect, deriveCharacteristics } from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import { createGenericZoneCard } from '../src/services/instajudge/magic/runtime/effectRuntime.js';
import { passPriority } from '../src/services/instajudge/magic/runtime/stackRuntime.js';
import { addPermanent, createGameObject, createMagicRuntimeState } from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { TURN_STEPS, advanceTurnStep, executeCurrentTurnBasedAction } from '../src/services/instajudge/magic/runtime/turnRuntime.js';

let verified = 0;

function expect(condition, message) {
  assert(condition, message);
  verified += 1;
}

function stateAt(step, activePlayer = 'player') {
  const phase = [TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW].includes(step) ? 'beginning' : 'ending';
  return createMagicRuntimeState({ scenario: { objects: [], continuousEffects: [], game: { activePlayer, phase, step } } });
}

function permanent(state, { name, controller = 'player', power = 2, toughness = 2, tapped = false, counters = {}, oracleText = '' }) {
  return addPermanent(state, createGameObject({
    card: { name, typeLine: 'Creature', oracleText, power, toughness },
    name,
    controller,
    owner: controller,
    power,
    toughness,
    tapped,
    counters
  }));
}

function fillZone(state, playerId, zone, count, prefix) {
  return Array.from({ length: count }, (_, index) => createGenericZoneCard(state, {
    playerId,
    zone,
    name: `${prefix} ${index + 1}`
  }));
}

const untapState = stateAt(TURN_STEPS.UNTAP);
const activePermanent = permanent(untapState, { name: 'Active Permanent', tapped: true });
const nonactivePermanent = permanent(untapState, { name: 'Nonactive Permanent', controller: 'opponent', tapped: true });
const untapResult = executeCurrentTurnBasedAction(untapState);
expect(untapResult.status === 'executed' && !activePermanent.tapped, 'The active player\'s ordinary tapped permanent must untap.');
expect(nonactivePermanent.tapped, 'The nonactive player\'s permanent must remain tapped.');
expect(untapState.game.priorityHolder === null, 'The untap turn-based action must not grant priority.');
expect(untapState.events.some((event) => event.type === 'PermanentUntapped' && event.object === activePermanent), 'Untap must emit the canonical runtime event.');

const restrictedUntap = stateAt(TURN_STEPS.UNTAP);
const restricted = permanent(restrictedUntap, { name: 'Restricted Permanent', tapped: true, oracleText: "Restricted Permanent doesn't untap during your untap step." });
const restrictedResult = executeCurrentTurnBasedAction(restrictedUntap);
expect(restrictedResult.status === 'unsupported' && restrictedResult.verdict === 'unverified' && restricted.tapped, 'Unsupported untap restrictions must fail closed without mutating the permanent.');

const drawState = stateAt(TURN_STEPS.UPKEEP);
const lowerCard = createGenericZoneCard(drawState, { playerId: 'player', zone: 'library', name: 'Lower Card' });
const topCard = createGenericZoneCard(drawState, { playerId: 'player', zone: 'library', name: 'Top Card' });
const drawAdvance = advanceTurnStep(drawState);
expect(drawAdvance.status === 'advanced' && drawAdvance.to === TURN_STEPS.DRAW, 'Upkeep must advance into the draw step.');
expect(topCard.zone === 'hand' && drawState.players.player.hand.includes(topCard.id), 'The known top library card must move to the active player\'s hand.');
expect(lowerCard.zone === 'library' && drawState.players.player.library.length === 1 && drawState.players.player.hand.length === 1, 'Draw must update canonical library and hand state exactly once.');
const drawEventIndex = drawState.events.findIndex((event) => event.type === 'CardDrawn');
const priorityEventIndex = drawState.events.findIndex((event) => event.type === 'PriorityGranted' && event.metadata.turnStep === TURN_STEPS.DRAW);
expect(drawEventIndex >= 0 && priorityEventIndex > drawEventIndex && drawState.game.priorityHolder === 'player', 'The draw must happen before draw-step priority.');

const legalHand = stateAt(TURN_STEPS.CLEANUP);
fillZone(legalHand, 'player', 'hand', 7, 'Legal Hand');
const legalCleanup = executeCurrentTurnBasedAction(legalHand);
expect(legalCleanup.status === 'executed' && legalCleanup.discarded.length === 0 && !legalCleanup.repeatRequired, 'A hand at maximum size must not discard and cleanup must stabilize.');

const chosenDiscard = stateAt(TURN_STEPS.CLEANUP);
const chosenHand = fillZone(chosenDiscard, 'player', 'hand', 8, 'Chosen Hand');
const chosenCleanup = executeCurrentTurnBasedAction(chosenDiscard, { discardCardIds: [chosenHand[3].id] });
expect(chosenCleanup.status === 'executed' && chosenHand[3].zone === 'graveyard', 'The specified cleanup discard must move to the graveyard.');
expect(chosenDiscard.players.player.hand.length === 7 && chosenDiscard.players.player.graveyard.includes(chosenHand[3].id), 'Cleanup discard must leave the active player at maximum hand size.');

const missingDiscard = stateAt(TURN_STEPS.CLEANUP);
fillZone(missingDiscard, 'player', 'hand', 8, 'Missing Choice');
const missingResult = advanceTurnStep(missingDiscard);
expect(missingResult.status === 'depends' && missingResult.verdict === 'depends', 'An unspecified cleanup discard must return DEPENDS.');
expect(missingDiscard.pendingChoices.some((choice) => choice.type === 'CleanupDiscardChoice'), 'An unspecified cleanup discard must expose a pending canonical choice.');
expect(missingDiscard.game.turn === 1 && missingDiscard.game.step === TURN_STEPS.CLEANUP, 'A pending cleanup choice must prevent turn rotation.');

const damageState = stateAt(TURN_STEPS.CLEANUP);
const damaged = permanent(damageState, { name: 'Damaged Counter Creature', power: 2, toughness: 5, counters: { '+1/+1': 1 } });
damaged.damageMarked = 4;
damaged.damagedByDeathtouch = true;
createContinuousEffect(damageState, {
  layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS,
  sublayer: PT_SUBLAYERS.MODIFY,
  duration: 'until-end-of-turn',
  appliesTo: { objectId: damaged.id },
  modification: { kind: 'pt', mode: 'modify', power: 2, toughness: 2 }
});
expect(deriveCharacteristics(damageState, damaged).power === 5, 'The temporary effect and permanent counter must both apply before cleanup.');
const damageCleanup = executeCurrentTurnBasedAction(damageState);
expect(damageCleanup.status === 'executed' && damaged.damageMarked === 0 && !damaged.damagedByDeathtouch, 'Cleanup must remove marked damage and deathtouch damage state.');
expect(damaged.counters['+1/+1'] === 1 && deriveCharacteristics(damageState, damaged).power === 3, 'Cleanup must preserve counters while expiring the temporary P/T effect.');
expect(damageCleanup.expiredEffects === 1, 'Cleanup must expire the Phase 6 until-end-of-turn effect exactly once.');

const repeatState = stateAt(TURN_STEPS.CLEANUP);
const temporarilyAlive = permanent(repeatState, { name: 'Temporarily Alive', power: 0, toughness: 0 });
createContinuousEffect(repeatState, {
  layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS,
  sublayer: PT_SUBLAYERS.MODIFY,
  duration: 'until-end-of-turn',
  appliesTo: { objectId: temporarilyAlive.id },
  modification: { kind: 'pt', mode: 'modify', power: 1, toughness: 1 }
});
const firstCleanup = executeCurrentTurnBasedAction(repeatState);
expect(firstCleanup.repeatRequired && temporarilyAlive.zone === 'graveyard', 'An SBA caused during cleanup must schedule another cleanup iteration.');
expect(repeatState.game.priorityHolder === 'player' && repeatState.game.turn === 1, 'A cleanup SBA must grant conditional priority without rotating the turn.');
const firstPass = passPriority(repeatState, 'player');
const secondPass = passPriority(repeatState, 'opponent');
expect(firstPass.allowed && secondPass.allowed, 'Both players must be able to pass the cleanup priority window.');
expect(repeatState.game.turn === 2 && repeatState.game.step === TURN_STEPS.UNTAP && repeatState.game.activePlayer === 'opponent', 'The turn may rotate only after the repeated cleanup stabilizes.');
expect(repeatState.events.filter((event) => event.type === 'CleanupIterationCompleted').length === 2, 'Cleanup orchestration must execute the required second cleanup iteration.');

console.log('Magic turn-based actions and cleanup verifier passed.');
console.log('- Untap: active-player ordinary permanents only, no priority, unsupported restrictions fail closed');
console.log('- Draw: canonical top-card zone move before priority');
console.log('- Cleanup: maximum hand size, deterministic/pending discard choices, damage removal, effect expiry');
console.log('- Cleanup exception: SBA priority and repeat iteration before turn rotation');
console.log(`- Certification: ${JSON.stringify({ correctVerified: verified, incorrectConfident: 0 })}`);
