import assert from 'node:assert/strict';
import { CONTINUOUS_LAYERS, PT_SUBLAYERS, createContinuousEffect } from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import { beginCombat, declareAttackers, declareBlockers, endCombat, executeCombatDamageStep } from '../src/services/instajudge/magic/runtime/combatRuntime.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { parseOracleSemantics } from '../src/services/instajudge/magic/runtime/oracleSemantics.js';
import { addPermanent, createGameObject, createMagicRuntimeState } from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { TIMING_MODES, TIMING_REASON_CODES, activateAbility, castSpell, checkTimingPermission } from '../src/services/instajudge/magic/runtime/stackRuntime.js';
import { TURN_STEPS, executeCurrentTurnBasedAction } from '../src/services/instajudge/magic/runtime/turnRuntime.js';

let verified = 0;

function expect(condition, message) {
  assert(condition, message);
  verified += 1;
}

const card = {
  instant: { name: 'Timing Bolt', typeLine: 'Instant', oracleText: 'Timing Bolt deals 3 damage to any target.' },
  sorcery: { name: 'Timing Divination', typeLine: 'Sorcery', oracleText: 'Draw two cards.' },
  creature: { name: 'Timing Bear', typeLine: 'Creature - Bear', oracleText: '', power: 2, toughness: 2 },
  artifact: { name: 'Timing Relic', typeLine: 'Artifact', oracleText: '' },
  enchantment: { name: 'Timing Aura', typeLine: 'Enchantment', oracleText: '' },
  planeswalker: { name: 'Timing Walker', typeLine: 'Legendary Planeswalker - Test', oracleText: '' },
  battle: { name: 'Timing Siege', typeLine: 'Battle - Siege', oracleText: '' },
  flashCreature: { name: 'Timing Ambusher', typeLine: 'Creature - Rogue', oracleText: 'Flash\nDeathtouch', power: 2, toughness: 1 },
  restricted: { name: 'Timing Restricted', typeLine: 'Creature', oracleText: 'You may cast this spell only during combat.', power: 2, toughness: 2 }
};

function stateAt(step, { activePlayer = 'player', priorityHolder = activePlayer } = {}) {
  const phase = [TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW].includes(step)
    ? 'beginning'
    : [TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(step)
      ? 'main'
      : [TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP].includes(step) ? 'ending' : 'combat';
  const state = createMagicRuntimeState({
    scenario: { objects: [], continuousEffects: [], game: { activePlayer, phase, step, priorityHolder } }
  });
  if (priorityHolder == null) state.game.priorityHolder = null;
  return state;
}

function timing(state, timingCard, playerId = 'player', extras = {}) {
  return checkTimingPermission({ state, card: timingCard, actionType: 'Cast', playerId, ...extras });
}

const upkeep = stateAt(TURN_STEPS.UPKEEP);
expect(timing(upkeep, card.instant).allowed, 'An instant must be legal during upkeep when its player has priority.');

const opponentTurn = stateAt(TURN_STEPS.UPKEEP, { activePlayer: 'opponent', priorityHolder: 'player' });
expect(timing(opponentTurn, card.instant).allowed, 'An instant must be legal during an opponent turn when the acting player has priority.');

const response = stateAt(TURN_STEPS.UPKEEP);
response.stack.push({ id: 'spell-on-stack', kind: 'Spell' });
expect(timing(response, card.instant).allowed, 'An instant must be legal with a spell on the stack when its player has priority.');
response.game.priorityHolder = 'opponent';
expect(timing(response, card.instant).code === TIMING_REASON_CODES.WRONG_PRIORITY_HOLDER, 'An instant must be denied when another player has priority.');

const untap = stateAt(TURN_STEPS.UNTAP, { priorityHolder: null });
expect(timing(untap, card.instant).code === TIMING_REASON_CODES.NO_PRIORITY_WINDOW, 'An instant must be denied during untap.');

const stableCleanup = stateAt(TURN_STEPS.CLEANUP, { priorityHolder: null });
executeCurrentTurnBasedAction(stableCleanup);
expect(timing(stableCleanup, card.instant).code === TIMING_REASON_CODES.NO_PRIORITY_WINDOW, 'An instant must be denied during stable cleanup.');

const precombat = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
expect(timing(precombat, card.sorcery).code === TIMING_REASON_CODES.SORCERY_TIMING_ALLOWED, 'A sorcery must be legal during precombat main with priority and an empty stack.');
const postcombat = stateAt(TURN_STEPS.POSTCOMBAT_MAIN);
expect(timing(postcombat, card.sorcery).allowed, 'A sorcery must be legal during postcombat main.');
expect(timing(upkeep, card.sorcery).code === TIMING_REASON_CODES.WRONG_PHASE, 'A sorcery must be denied during upkeep.');

const combatForSorcery = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
beginCombat(combatForSorcery);
expect(timing(combatForSorcery, card.sorcery).code === TIMING_REASON_CODES.WRONG_PHASE, 'A sorcery must be denied during combat.');

const opponentsMain = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { activePlayer: 'opponent', priorityHolder: 'player' });
expect(timing(opponentsMain, card.sorcery).code === TIMING_REASON_CODES.WRONG_ACTIVE_PLAYER, 'A sorcery must be denied on the opponent turn.');

const busyMain = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
busyMain.stack.push({ id: 'busy-stack', kind: 'Spell' });
expect(timing(busyMain, card.sorcery).code === TIMING_REASON_CODES.STACK_NOT_EMPTY, 'A sorcery must be denied with a nonempty stack.');
const noPriorityMain = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { priorityHolder: null });
expect(timing(noPriorityMain, card.sorcery).code === TIMING_REASON_CODES.NO_PRIORITY_WINDOW, 'A sorcery must be denied without priority.');

for (const permanentCard of [card.creature, card.artifact, card.enchantment, card.planeswalker, card.battle]) {
  const result = timing(precombat, permanentCard);
  expect(result.allowed && result.requiredTiming === TIMING_MODES.SORCERY, `${permanentCard.typeLine} must use ordinary sorcery timing.`);
}

expect(timing(opponentTurn, card.flashCreature).allowed, 'A creature with ordinary Flash must use instant timing.');
expect(timing(opponentTurn, card.creature).code === TIMING_REASON_CODES.WRONG_ACTIVE_PLAYER, 'A creature without Flash must remain sorcery speed.');

const ordinaryAbility = parseOracleSemantics({ name: 'Timing Device', typeLine: 'Artifact', oracleText: '{T}: Draw a card.' }).activatedAbilitiesIR[0];
const sorceryAbility = parseOracleSemantics({ name: 'Slow Device', typeLine: 'Artifact', oracleText: '{T}: Draw a card. Activate only as a sorcery.' }).activatedAbilitiesIR[0];
expect(checkTimingPermission({ state: upkeep, ability: ordinaryAbility, actionType: 'Activate', playerId: 'player' }).allowed, 'An ordinary activated ability must be legal with priority.');
const noAbilityPriority = stateAt(TURN_STEPS.UPKEEP, { priorityHolder: null });
expect(checkTimingPermission({ state: noAbilityPriority, ability: ordinaryAbility, actionType: 'Activate', playerId: 'player' }).code === TIMING_REASON_CODES.NO_PRIORITY_WINDOW, 'An ordinary activated ability must be denied without priority.');
expect(checkTimingPermission({ state: precombat, ability: sorceryAbility, actionType: 'Activate', playerId: 'player' }).allowed, 'Activate only as a sorcery must be legal during valid sorcery timing.');
expect(checkTimingPermission({ state: upkeep, ability: sorceryAbility, actionType: 'Activate', playerId: 'player' }).code === TIMING_REASON_CODES.WRONG_PHASE, 'Activate only as a sorcery must be denied during upkeep.');
expect(checkTimingPermission({ state: busyMain, ability: sorceryAbility, actionType: 'Activate', playerId: 'player' }).code === TIMING_REASON_CODES.STACK_NOT_EMPTY, 'Activate only as a sorcery must be denied with a nonempty stack.');

const castPriority = stateAt(TURN_STEPS.UPKEEP, { activePlayer: 'opponent', priorityHolder: 'player' });
expect(castSpell(castPriority, { card: card.instant, controller: 'player' }).cast && castPriority.game.priorityHolder === 'player', 'The acting player must retain priority after casting a spell.');
const activationPriority = stateAt(TURN_STEPS.UPKEEP, { activePlayer: 'opponent', priorityHolder: 'player' });
const abilitySource = addPermanent(activationPriority, createGameObject({ name: 'Priority Device', controller: 'player', owner: 'player', oracleText: '{T}: Draw a card.' }));
expect(activateAbility(activationPriority, { sourceObject: abilitySource, ability: ordinaryAbility, controller: 'player' }).activated && activationPriority.game.priorityHolder === 'player', 'The acting player must retain priority after activating an ability.');

expect(timing(busyMain, card.sorcery).code === TIMING_REASON_CODES.STACK_NOT_EMPTY, 'A sorcery cannot be cast in response to a spell.');

const combatState = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const firstStriker = addPermanent(combatState, createGameObject({
  name: 'Timing First Striker', controller: 'player', owner: 'player', power: 2, toughness: 2,
  abilities: [{ keyword: 'first strike', text: 'first strike' }]
}));
beginCombat(combatState);
expect(timing(combatState, card.instant).allowed, 'An instant must be legal during beginning-of-combat priority.');
declareAttackers(combatState, [firstStriker]);
expect(timing(combatState, card.instant).allowed, 'An instant must be legal after attackers are declared.');
declareBlockers(combatState, []);
expect(timing(combatState, card.instant).allowed, 'An instant must be legal after blockers are declared.');
executeCombatDamageStep(combatState, { step: TURN_STEPS.FIRST_STRIKE_DAMAGE });
expect(timing(combatState, card.instant).allowed && combatState.combat.priorityWindows.includes(TURN_STEPS.FIRST_STRIKE_DAMAGE), 'The real first-strike damage step must open an instant-speed priority gap before regular damage.');
executeCombatDamageStep(combatState, { step: TURN_STEPS.COMBAT_DAMAGE });
expect(timing(combatState, card.instant).allowed, 'An instant must be legal after regular combat damage.');
endCombat(combatState);
expect(timing(combatState, card.instant).allowed, 'An instant must be legal during the end-of-combat priority window.');

const midDeclaration = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
beginCombat(midDeclaration);
midDeclaration.game.step = TURN_STEPS.DECLARE_ATTACKERS;
midDeclaration.combat.step = TURN_STEPS.DECLARE_ATTACKERS;
expect(timing(midDeclaration, card.instant).code === TIMING_REASON_CODES.NO_PRIORITY_WINDOW, 'No artificial casting window may exist during the attacker declaration action.');

const exceptionalCleanup = stateAt(TURN_STEPS.CLEANUP, { priorityHolder: null });
const temporaryCreature = addPermanent(exceptionalCleanup, createGameObject({ name: 'Cleanup Timing Creature', controller: 'player', owner: 'player', power: 0, toughness: 0 }));
createContinuousEffect(exceptionalCleanup, {
  layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS,
  sublayer: PT_SUBLAYERS.MODIFY,
  duration: 'until-end-of-turn',
  appliesTo: { objectId: temporaryCreature.id },
  modification: { kind: 'pt', mode: 'modify', power: 1, toughness: 1 }
});
const cleanupResult = executeCurrentTurnBasedAction(exceptionalCleanup);
expect(cleanupResult.repeatRequired && timing(exceptionalCleanup, card.instant).allowed, 'An instant must be legal when Phase 8B cleanup actually creates priority.');
expect(timing(exceptionalCleanup, card.sorcery).code === TIMING_REASON_CODES.WRONG_PHASE, 'Cleanup priority must not create sorcery timing.');

const unsupported = timing(precombat, card.restricted);
expect(unsupported.status === 'unverified' && unsupported.code === TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, 'An unsupported casting modifier must return UNVERIFIED.');

const publicUpkeep = evaluateMagicRulesRuntime({ message: "I have priority during my opponent's upkeep. Can I cast Timing Bolt now?", cards: [card.instant] });
expect(publicUpkeep.verdict === 'yes', 'The public runtime must route opponent-upkeep instant timing through the canonical authority.');
const publicPermanent = evaluateMagicRulesRuntime({ message: 'It is my turn, I have priority during my postcombat main phase, and the stack is empty. Can I cast Timing Bear now?', cards: [card.creature] });
expect(publicPermanent.verdict === 'yes', 'The public runtime must route noninstant permanent timing through the canonical authority.');
const publicResponse = evaluateMagicRulesRuntime({ message: 'I have priority. Can I cast Timing Divination in response to Timing Bolt?', cards: [card.sorcery, card.instant] });
expect(publicResponse.verdict === 'no', 'The public runtime must reject a sorcery response to a spell.');
const publicFirstStrike = evaluateMagicRulesRuntime({ message: 'Can I cast Timing Bolt between first strike damage and regular combat damage?', cards: [card.instant] });
expect(publicFirstStrike.verdict === 'yes' && publicFirstStrike.runtime.timingWindow === 'first-strike-gap', 'The public runtime must use the real combat engine for the first-strike priority gap.');

console.log('Magic canonical timing permission verifier passed.');
console.log('- Instant and sorcery timing: priority, active player, phase, and stack enforced');
console.log('- Spell types and Flash: canonical card characteristics enforced');
console.log('- Activated abilities: ordinary and explicit sorcery-speed restrictions enforced');
console.log('- Combat: beginning, post-attackers, post-blockers, and first-strike priority windows verified');
console.log('- Cleanup: stable denial and Phase 8B exception priority verified');
console.log(`- Certification: ${JSON.stringify({ correctVerified: verified, incorrectConfident: 0 })}`);
