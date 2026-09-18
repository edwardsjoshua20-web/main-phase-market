import assert from 'node:assert/strict';
import { createGenericZoneCard } from '../src/services/instajudge/magic/runtime/effectRuntime.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { addPermanent, createGameObject, createMagicRuntimeState } from '../src/services/instajudge/magic/runtime/runtimeState.js';
import {
  SPECIAL_ACTION_REASON_CODES,
  SPECIAL_ACTION_TYPES,
  checkSpecialAction,
  executeSpecialAction,
  setLandPlayAllowance
} from '../src/services/instajudge/magic/runtime/specialActionRuntime.js';
import { TURN_STEPS, advanceTurnStep } from '../src/services/instajudge/magic/runtime/turnRuntime.js';

let verified = 0;

function expect(condition, message) {
  assert(condition, message);
  verified += 1;
}

function phaseFor(step) {
  if ([TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW].includes(step)) return 'beginning';
  if ([TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(step)) return 'main';
  if ([TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP].includes(step)) return 'ending';
  return 'combat';
}

function stateAt(step, { activePlayer = 'player', priorityHolder = activePlayer, allowed = 1, used = 0 } = {}) {
  const state = createMagicRuntimeState({
    scenario: {
      objects: [],
      continuousEffects: [],
      game: { activePlayer, phase: phaseFor(step), step, priorityHolder, landPlaysAllowed: allowed, landPlaysUsed: used }
    }
  });
  state.game.priorityHolder = priorityHolder;
  return state;
}

function landIn(state, zone = 'hand', playerId = 'player', name = 'Runtime Plains') {
  return createGenericZoneCard(state, { playerId, zone, name, typeLine: 'Basic Land - Plains' });
}

function legality(state, object, playerId = 'player') {
  return checkSpecialAction({ state, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId, object });
}

const legal = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const legalLand = landIn(legal);
const initialStack = legal.stack.length;
expect(legality(legal, legalLand).code === SPECIAL_ACTION_REASON_CODES.LAND_PLAY_ALLOWED, 'A first land from hand must be legal in the active player precombat main phase.');
const execution = executeSpecialAction(legal, { actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object: legalLand });
expect(execution.executed && legalLand.zone === 'battlefield', 'A legal land play must move the exact hand object to the battlefield.');
expect(!legal.players.player.hand.includes(legalLand.id) && legal.players.player.battlefield.includes(legalLand.id), 'Land execution must update canonical player zones.');
expect(legal.game.landPlays.used === 1 && execution.allowance.used === 1, 'Land execution must increment the numeric per-turn used count.');
expect(legal.stack.length === initialStack && execution.stackUnchanged, 'A land play must not create or use a stack object.');
expect(legal.game.priorityHolder === 'player' && legal.game.step === TURN_STEPS.PRECOMBAT_MAIN, 'The active player must retain the action opportunity without advancing the phase.');

const postcombat = stateAt(TURN_STEPS.POSTCOMBAT_MAIN);
expect(legality(postcombat, landIn(postcombat)).allowed, 'A first land must be legal during postcombat main.');

for (const step of [TURN_STEPS.UPKEEP, TURN_STEPS.BEGINNING, TURN_STEPS.DECLARE_ATTACKERS, TURN_STEPS.END_STEP]) {
  const wrongPhase = stateAt(step);
  expect(!legality(wrongPhase, landIn(wrongPhase)).allowed, `A land play must be denied during ${step}.`);
}

const wrongPlayer = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { activePlayer: 'opponent', priorityHolder: 'player' });
expect(legality(wrongPlayer, landIn(wrongPlayer)).code === SPECIAL_ACTION_REASON_CODES.WRONG_ACTIVE_PLAYER, 'A nonactive player must not play an ordinary land.');
const wrongHand = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
expect(legality(wrongHand, landIn(wrongHand, 'hand', 'opponent')).code === SPECIAL_ACTION_REASON_CODES.WRONG_SOURCE_ZONE, 'The exact land must be in the acting player hand.');

const busyStack = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
busyStack.stack.push({ id: 'pending-spell', kind: 'Spell' });
expect(legality(busyStack, landIn(busyStack)).code === SPECIAL_ACTION_REASON_CODES.STACK_NOT_EMPTY, 'A land play must be denied while the stack is nonempty.');

const noPriority = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { priorityHolder: null });
expect(legality(noPriority, landIn(noPriority)).code === SPECIAL_ACTION_REASON_CODES.NO_ACTION_WINDOW, 'A land play must be denied without the active-player action window.');

const exhausted = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { used: 1 });
expect(legality(exhausted, landIn(exhausted)).code === SPECIAL_ACTION_REASON_CODES.LAND_PLAY_LIMIT_REACHED, 'A second ordinary land play must be denied after the default allowance is used.');

const additional = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { used: 1 });
expect(setLandPlayAllowance(additional, { allowed: 2 }).status === 'configured', 'A trusted runtime source must be able to configure a numeric additional-land allowance.');
const secondLand = landIn(additional, 'hand', 'player', 'Runtime Island');
expect(executeSpecialAction(additional, { actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', object: secondLand }).executed, 'A canonical two-land allowance must permit the second land.');
expect(legality(additional, landIn(additional, 'hand', 'player', 'Runtime Forest')).code === SPECIAL_ACTION_REASON_CODES.LAND_PLAY_LIMIT_REACHED, 'A canonical two-land allowance must deny the third land.');

const unsupportedAdditional = stateAt(TURN_STEPS.PRECOMBAT_MAIN, { used: 1 });
addPermanent(unsupportedAdditional, createGameObject({
  card: { name: 'Unparsed Exploration', typeLine: 'Enchantment', oracleText: 'You may play an additional land on each of your turns.' },
  controller: 'player',
  owner: 'player'
}));
const unsupportedAdditionalResult = legality(unsupportedAdditional, landIn(unsupportedAdditional));
expect(unsupportedAdditionalResult.status === 'unverified' && unsupportedAdditionalResult.code === SPECIAL_ACTION_REASON_CODES.UNSUPPORTED_LAND_PERMISSION, 'An unparsed additional-land permission must return UNVERIFIED instead of a false limit denial.');

const graveyardState = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const graveyardLand = landIn(graveyardState, 'graveyard');
const graveyardResult = legality(graveyardState, graveyardLand);
expect(graveyardResult.status === 'unverified' && graveyardResult.code === SPECIAL_ACTION_REASON_CODES.UNSUPPORTED_LAND_PERMISSION, 'A land in the graveyard without modeled permission must not be incorrectly allowed.');

const nonlandState = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const nonland = createGenericZoneCard(nonlandState, { playerId: 'player', zone: 'hand', name: 'Runtime Bear', typeLine: 'Creature - Bear' });
expect(legality(nonlandState, nonland).status === 'denied', 'A nonland object must not be playable through the land special action.');

const reset = stateAt(TURN_STEPS.CLEANUP, { used: 1 });
createGenericZoneCard(reset, { playerId: 'opponent', zone: 'library', name: 'Opponent Draw' });
createGenericZoneCard(reset, { playerId: 'player', zone: 'library', name: 'Player Draw' });
expect(advanceTurnStep(reset).to === TURN_STEPS.UNTAP && reset.game.activePlayer === 'opponent', 'Cleanup must rotate to the opponent turn.');
expect(reset.game.landPlays.used === 0 && reset.game.landPlays.allowed === 1 && reset.game.landPlays.turnId === reset.game.turnId, 'The next active player must receive a fresh default land allowance.');
reset.game.landPlays.used = 1;
while (reset.game.step !== TURN_STEPS.CLEANUP) advanceTurnStep(reset);
expect(advanceTurnStep(reset).to === TURN_STEPS.UNTAP && reset.game.activePlayer === 'player', 'The canonical turn engine must rotate back to the original player.');
expect(reset.game.landPlays.used === 0 && reset.game.landPlays.allowed === 1 && reset.game.landPlays.turnId === reset.game.turnId, 'Land usage must not leak into the original player next turn.');

const missingAllowance = evaluateMagicRulesRuntime({
  message: 'It is my turn, I have priority during my precombat main phase, and the stack is empty. Can I play Runtime Plains from my hand?',
  cards: [{ name: 'Runtime Plains', typeLine: 'Basic Land - Plains', oracleText: '' }]
});
expect(missingAllowance.verdict === 'depends' && /land plays already used/i.test(missingAllowance.clarificationNeeded), 'The public runtime must return DEPENDS when land usage is not supplied.');

const publicLegal = evaluateMagicRulesRuntime({
  message: "It is my turn, I have priority during my postcombat main phase, the stack is empty, and I haven't played a land. Can I play Runtime Plains from my hand?",
  cards: [{ name: 'Runtime Plains', typeLine: 'Basic Land - Plains', oracleText: '' }]
});
expect(publicLegal.verdict === 'yes', 'The public runtime must route a complete legal land question through the special-action owner.');
const publicBusy = evaluateMagicRulesRuntime({
  message: "It is my turn, I have priority during my main phase, a spell is on the stack, and I haven't played a land. Can I play Runtime Plains from my hand?",
  cards: [{ name: 'Runtime Plains', typeLine: 'Basic Land - Plains', oracleText: '' }]
});
expect(publicBusy.verdict === 'no', 'The public runtime must reject a land play while a spell is on the stack.');
const publicOpponentTurn = evaluateMagicRulesRuntime({
  message: "It is my opponent's turn, I have priority during their main phase, the stack is empty, and I haven't played a land. Can I play Runtime Plains from my hand?",
  cards: [{ name: 'Runtime Plains', typeLine: 'Basic Land - Plains', oracleText: '' }]
});
expect(publicOpponentTurn.verdict === 'no', 'The public runtime must reject an ordinary land play during the opponent turn.');
const publicGraveyard = evaluateMagicRulesRuntime({
  message: "It is my turn, I have priority during my main phase, the stack is empty, and I haven't played a land. Can I play Runtime Plains from my graveyard?",
  cards: [{ name: 'Runtime Plains', typeLine: 'Basic Land - Plains', oracleText: '' }]
});
expect(publicGraveyard.verdict === 'unverified', 'The public runtime must fail closed on an unsupported graveyard land-play permission.');
const publicMorph = evaluateMagicRulesRuntime({ message: 'Can I turn this face-down creature face up right now?', cards: [] });
expect(publicMorph.verdict === 'unverified', 'Unsupported face-up special actions must return UNVERIFIED.');

console.log('Magic canonical special-action runtime verifier passed.');
console.log('- Land timing: active player, main phase, empty stack, and action window enforced');
console.log('- Allowance: numeric default, exhaustion, trusted additional allowance, and turn reset verified');
console.log('- Execution: exact hand object moves through canonical zone change with no stack object');
console.log('- Unsupported: unusual source zones, unparsed additional permissions, and face-up actions fail closed');
console.log(`- Certification: ${JSON.stringify({ correctVerified: verified, incorrectConfident: 0 })}`);
