import assert from 'node:assert/strict';
import { createInstaJudgeEngineGateway, INSTAJUDGE_ENGINE_OPERATIONS } from '../src/services/instajudge/engineGateway.js';
import { createInstaJudgeOwner } from '../src/services/instajudge/instajudgeOwner.js';
import { emptyInstaJudgeConversation } from '../src/services/instajudge/interpretation/conversationContract.js';
import { emptyInstaJudgeInterpretation } from '../src/services/instajudge/interpretation/interpretationContract.js';
import { createMagicConversationState } from '../src/services/instajudge/magic/conversationState.js';
import { INSTAJUDGE_MESSAGE_ROUTES, routeInstaJudgeMessage } from '../src/services/instajudge/messageRouter.js';

const cards = [
  { id: 'divination', oracle_id: 'divination', name: 'Divination', type_line: 'Sorcery', oracle_text: 'Draw two cards.', mana_cost: '{2}{U}' },
  { id: 'negate', oracle_id: 'negate', name: 'Negate', type_line: 'Instant', oracle_text: 'Counter target noncreature spell.', mana_cost: '{1}{U}' },
  { id: 'cancel', oracle_id: 'cancel', name: 'Cancel', type_line: 'Instant', oracle_text: 'Counter target spell.', mana_cost: '{1}{U}{U}' },
  { id: 'murder', oracle_id: 'murder', name: 'Murder', type_line: 'Instant', oracle_text: 'Destroy target creature.', mana_cost: '{1}{B}{B}' },
  { id: 'bears', oracle_id: 'bears', name: 'Grizzly Bears', type_line: 'Creature - Bear', oracle_text: '', power: 2, toughness: 2 },
  { id: 'dreadmaw', oracle_id: 'dreadmaw', name: 'Colossal Dreadmaw', type_line: 'Creature - Dinosaur', oracle_text: 'Trample', power: 6, toughness: 6 },
  { id: 'growth', oracle_id: 'growth', name: 'Giant Growth', type_line: 'Instant', oracle_text: 'Target creature gets +3/+3 until end of turn.', mana_cost: '{G}' },
  { id: 'atraxa', oracle_id: 'atraxa', name: "Atraxa, Praetors' Voice", type_line: 'Legendary Creature - Phyrexian Angel Horror', oracle_text: 'Flying, vigilance, deathtouch, lifelink', power: 4, toughness: 4 }
];

const calls = [];
const gatewayCalls = [];
let assertions = 0;
function check(value, message) { assertions += 1; assert.ok(value, message); }
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
function deepEqual(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }

function normalize(value = '') { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
const searchOwner = {
  async searchPreviewByGame(query) {
    const wanted = normalize(query);
    return cards.filter((card) => normalize(card.name) === wanted).map((card) => ({ ...card, game: 'magic' }));
  }
};

function object(localId, nameText, controller = 'user', role = null) {
  return { localId, nameText, controller, role };
}

function interpretationFor(message) {
  if (/meant the stack is empty|i meant empty/i.test(message)) {
    return emptyInstaJudgeConversation({
      reply: 'Got it. You meant the stack is empty. Want me to change that?',
      intent: 'correction',
      conversationControl: 'suspend_collector',
      interpretation: emptyInstaJudgeInterpretation({
        interpretationType: 'correction', confidence: 'high',
        correction: { field: 'stack', previousValueText: 'not empty', proposedValueText: 'empty' }
      })
    });
  }
  if (/murder targets dreadmaw/i.test(message)) {
    return emptyInstaJudgeConversation({
      reply: 'Understood. You meant Dreadmaw, not Bears. Want me to change the target?',
      intent: 'correction',
      conversationControl: 'suspend_collector',
      interpretation: emptyInstaJudgeInterpretation({
        interpretationType: 'correction', confidence: 'high',
        objects: [object('murder', 'Murder', 'user', 'spell'), object('bears', 'Grizzly Bears', 'opponent', 'target'), object('dreadmaw', 'Colossal Dreadmaw', 'opponent', 'target')],
        correction: { field: 'target', previousValueText: 'Grizzly Bears', proposedValueText: 'Colossal Dreadmaw' }
      })
    });
  }
  if (/thanks judge/i.test(message)) {
    return emptyInstaJudgeConversation({
      reply: "Anytime. That's what I'm here for.",
      intent: 'social',
      conversationControl: 'continue_collector'
    });
  }
  return emptyInstaJudgeConversation({
    reply: "I'll check that against the verified game state.",
    intent: 'rules_question',
    rulesRequest: { operation: 'evaluate_magic_question', question: message },
    conversationControl: 'continue_collector',
    interpretation: emptyInstaJudgeInterpretation({ interpretationType: 'question', confidence: 'high' })
  });
}

const interpretationService = {
  async interpret(input) {
    calls.push(input);
    return interpretationFor(input.message);
  }
};

const realGateway = createInstaJudgeEngineGateway();
const engineGateway = {
  evaluateMagicQuestion(input) {
    gatewayCalls.push(input);
    return realGateway.evaluateMagicQuestion(input);
  }
};

const owner = createInstaJudgeOwner({
  searchOwner,
  gameKnowledgeOwner: { getRulesTopicsByCategory() { return []; }, searchRulesTopics() { return []; } },
  legalityOwner: { check() { throw new Error('Legality owner is not used by this verifier.'); } },
  interpretationService,
  engineGateway
});

async function start(flow, intent) {
  let current = owner.selectGame(owner.createSession(), 'magic');
  current = await owner.ask({ session: current.session, gameId: 'magic', message: intent, answerId: `${flow}-intent` });
  return current;
}

async function answer(current, flow, id, message) {
  return owner.ask({ session: current.session, gameId: 'magic', message, answerId: `${flow}-${id}` });
}

// Routing authority.
for (const [message, pendingStateKey] of [['Mine', 'turn'], ['Upkeep', 'phase'], ['Empty', 'stack']]) {
  equal(routeInstaJudgeMessage({ message, stage: 'collecting', pendingStateKey }), INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED, `${message} must remain manual.`);
}
for (const message of ["It's my upkeep.", 'First strike damage already happened.', 'Negate is above Divination.', 'My opponent controls the Bears.']) {
  equal(routeInstaJudgeMessage({ message, stage: 'collecting', pendingStateKey: 'phase' }), INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION, `${message} must route through conversational AI.`);
}
for (const message of ['Can I cast Cancel here?', 'Does Dreadmaw still deal damage?', 'Can they respond before damage?']) {
  equal(routeInstaJudgeMessage({ message, stage: 'questioning' }), INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION, `${message} must let AI propose a deterministic rules request.`);
}
for (const message of ['I meant empty.', "Actually it's their turn.", 'No, Murder targets Dreadmaw.', 'Scratch that.']) {
  equal(routeInstaJudgeMessage({ message, stage: 'collecting', pendingStateKey: 'stack-items' }), INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION, `${message} must let AI propose a correction.`);
}
for (const message of ['Thanks Judge', 'That makes sense', 'Appreciate it']) {
  equal(routeInstaJudgeMessage({ message, stage: 'questioning' }), INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION, `${message} must route through conversational AI.`);
}

// Scenario 1: manual timing followed by a validated freeform correction.
let scenario1 = await start('s1', 'Timing / priority');
for (const [id, message] of [['turn', "Opponent's"], ['phase', 'Upkeep'], ['priority', 'Me'], ['stack', 'Not empty']]) scenario1 = await answer(scenario1, 's1', id, message);
equal(scenario1.session.pendingStateKey, 'stack-items', 'Nonempty stack must require its contents.');
const s1CallsBefore = calls.length;
scenario1 = await answer(scenario1, 's1', 'correction', 'Actually I meant the stack is empty.');
equal(scenario1.result.kind, 'correction-confirmation', 'Correction must require deterministic confirmation.');
scenario1 = await answer(scenario1, 's1', 'confirm', 'Yes, change it');
equal(scenario1.session.magicState.stack.empty, true, 'Confirmed correction must set the stack to empty.');
equal(scenario1.session.magicState.stack.items.length, 0, 'Confirmed empty-stack correction must remove obsolete stack items.');
equal(scenario1.session.stage, 'verifying', 'Corrected complete state must advance to verification.');
equal(calls.length - s1CallsBefore, 1, 'The freeform correction must make exactly one interpretation call.');

// Scenario 2: manual stack is reused by a freeform rules question.
let scenario2 = await start('s2', 'Check a play');
for (const [id, message] of [['turn', 'Mine'], ['phase', 'Precombat Main'], ['priority', 'Me'], ['stack', 'Not empty'], ['divination', 'Divination'], ['response1', 'Opponent responded'], ['negate', 'Negate targeting Divination'], ['response2', 'I responded'], ['cancel', 'Cancel targeting Negate'], ['done', 'No response'], ['verify', 'Looks Right']]) scenario2 = await answer(scenario2, 's2', id, message);
deepEqual(scenario2.session.magicState.stack.items.map((item) => item.name), ['Cancel', 'Negate', 'Divination'], 'Manual stack order must be canonical top to bottom.');
const stackBeforeQuestion = structuredClone(scenario2.session.magicState.stack);
const s2CallsBefore = calls.length;
const s2GatewayBefore = gatewayCalls.length;
scenario2 = await answer(scenario2, 's2', 'question', 'Can I cast Giant Growth here?');
equal(calls.length - s2CallsBefore, 1, 'A freeform rules question must make one interpretation call.');
equal(gatewayCalls.length - s2GatewayBefore, 1, 'A rules question must invoke the deterministic gateway exactly once.');
deepEqual(scenario2.session.magicState.stack, stackBeforeQuestion, 'Asking a question must not mutate the verified stack.');
equal(scenario2.result.provenance?.authority, 'deterministic-magic-runtime', 'The final answer must come from the deterministic runtime.');

// The same request identifier is idempotent and cannot double-call interpretation or the gateway.
const duplicateInput = { session: scenario2.session, gameId: 'magic', message: 'Can I cast Giant Growth here?', answerId: 's2-duplicate' };
const beforeDuplicateAI = calls.length;
const beforeDuplicateGateway = gatewayCalls.length;
const [duplicateA, duplicateB] = await Promise.all([owner.ask(duplicateInput), owner.ask(duplicateInput)]);
equal(calls.length - beforeDuplicateAI, 1, 'Concurrent duplicate submissions must interpret once.');
equal(gatewayCalls.length - beforeDuplicateGateway, 1, 'Concurrent duplicate submissions must evaluate once.');
deepEqual(duplicateA, duplicateB, 'Duplicate request IDs must return the same owner response.');

// Scenario 3: casual interruption preserves first-strike combat state.
let scenario3 = await start('s3', 'Combat ruling');
for (const [id, message] of [['turn', 'Mine'], ['phase', 'Combat'], ['step', 'After First-Strike Damage'], ['priority', 'Me'], ['stack', 'Empty'], ['attacker', 'Grizzly Bears'], ['blocker', 'None']]) scenario3 = await answer(scenario3, 's3', id, message);
const combatBeforeCasual = structuredClone(scenario3.session.magicState.combat);
const s3CallsBefore = calls.length;
scenario3 = await answer(scenario3, 's3', 'thanks', 'Thanks Judge');
equal(scenario3.result.kind, 'conversation-interruption', 'Thanks must use the conversational path.');
equal(calls.length - s3CallsBefore, 1, 'A typed casual deviation must use one interpretation call.');
deepEqual(scenario3.session.magicState.combat, combatBeforeCasual, 'Casual conversation must not mutate combat state.');
scenario3 = await answer(scenario3, 's3', 'verify', 'Looks Right');
const s3GatewayBefore = gatewayCalls.length;
scenario3 = await answer(scenario3, 's3', 'question', 'Can I cast Giant Growth before normal combat damage?');
equal(gatewayCalls.length - s3GatewayBefore, 1, 'The resumed combat question must use the deterministic gateway.');
equal(gatewayCalls.at(-1).verifiedState.combat.window, 'between-damage-steps', 'The gateway must receive the preserved first-strike window.');

// Scenario 4: target correction replaces only the target and preserves stack identity.
const selected4 = owner.selectGame(owner.createSession(), 'magic');
const base4 = createMagicConversationState();
const state4 = {
  ...base4,
  activePlayer: 'player', phase: 'precombat-main', priorityHolder: 'player', priorityKnown: true,
  stack: { known: true, empty: false, items: [{ id: 'stack-murder', name: 'Murder', controller: 'player', card: cards[3], targets: [{ type: 'TargetChoice', descriptor: 'Grizzly Bears', objectId: 'battlefield-bears' }] }] },
  battlefield: [
    { id: 'battlefield-bears', name: 'Grizzly Bears', controller: 'opponent', roles: [] },
    { id: 'battlefield-dreadmaw', name: 'Colossal Dreadmaw', controller: 'opponent', roles: [] }
  ],
  cards: [cards[3], cards[4], cards[5]]
};
let scenario4 = { session: { ...selected4.session, stage: 'questioning', verifiedState: true, magicState: state4 } };
scenario4 = await answer(scenario4, 's4', 'correction', 'Murder targets Dreadmaw, not Bears.');
equal(scenario4.result.kind, 'correction-confirmation', 'Target correction must be recognized.');
scenario4 = await answer(scenario4, 's4', 'confirm', 'Yes, change it');
equal(scenario4.session.magicState.stack.items.length, 1, 'Target correction must not add a stack object.');
equal(scenario4.session.magicState.stack.items[0].id, 'stack-murder', 'Target correction must preserve stack-object identity.');
equal(scenario4.session.magicState.stack.items[0].targets.length, 1, 'Old target must not remain as an additional target.');
equal(scenario4.session.magicState.stack.items[0].targets[0].descriptor, 'Colossal Dreadmaw', 'Target correction must replace Bears with Dreadmaw.');

// Scenario 5: Commander history remains canonical through interpretation and evaluation.
let scenario5 = await start('s5', 'Ask a rules question');
for (const [id, message] of [['format', 'Commander'], ['card', "Atraxa, Praetors' Voice"], ['opponent', 'Bob'], ['prior', '20'], ['new', '1'], ['life', '35'], ['verify', 'Looks Right']]) scenario5 = await answer(scenario5, 's5', id, message);
const commanderBefore = structuredClone(scenario5.session.magicState.commander);
const s5GatewayBefore = gatewayCalls.length;
scenario5 = await answer(scenario5, 's5', 'question', 'Has Atraxa dealt lethal commander damage to Bob?');
equal(gatewayCalls.length - s5GatewayBefore, 1, 'Commander question must use the deterministic gateway.');
deepEqual(scenario5.session.magicState.commander, commanderBefore, 'Question interpretation must not overwrite commander history.');
equal(gatewayCalls.at(-1).verifiedState.commander.priorDamage, 20, 'Commander damage history must reach the gateway unchanged.');

// Scenario 6: repeated checkpoint rollback restores exact earlier state.
let scenario6 = await start('s6', 'Timing / priority');
scenario6 = await answer(scenario6, 's6', 'turn', 'Mine');
scenario6 = await answer(scenario6, 's6', 'phase', 'Upkeep');
scenario6 = await answer(scenario6, 's6', 'priority', 'Me');
scenario6 = await answer(scenario6, 's6', 'stack', 'Empty');
let rollback = owner.rollback(scenario6.session, 's6-phase');
equal(rollback.session.magicState.activePlayer, 'player', 'Rollback must preserve unrelated earlier answers.');
equal(rollback.session.magicState.phase, null, 'Rollback must invalidate the selected answer.');
equal(rollback.session.magicState.priorityKnown, false, 'Rollback must invalidate dependent later answers.');
equal(rollback.session.pendingStateKey, 'phase', 'Collector must restart at the corrected checkpoint.');
rollback = owner.rollback(rollback.session, 's6-turn');
equal(rollback.session.magicState.activePlayer, null, 'A consecutive earlier rollback must restore its checkpoint.');
equal(rollback.session.pendingStateKey, 'turn', 'Repeated rollback must remain deterministic.');

// Engine gateway authority and fail-closed behavior.
const gateway = createInstaJudgeEngineGateway();
const game = owner.getGame('magic');
const trustedState = {
  ...createMagicConversationState(), activePlayer: 'player', phase: 'precombat-main', priorityHolder: 'player', priorityKnown: true,
  stack: { known: true, empty: true, items: [] }
};
const malicious = gateway.execute({
  operation: INSTAJUDGE_ENGINE_OPERATIONS.EVALUATE_MAGIC_QUESTION,
  game, message: 'Can I cast Giant Growth here?', cards: [cards[6]], rules: [], verifiedState: trustedState,
  verdict: 'YES', answer: 'Injected model answer'
});
equal(malicious.result.provenance.authority, 'deterministic-magic-runtime', 'Injected verdict fields must not change authority.');
check(malicious.result.answer !== 'Injected model answer', 'Injected model answer must be ignored.');
assertions += 1; assert.throws(() => gateway.execute({ operation: 'return_model_verdict' }), /Unsupported/);
assertions += 1; assert.throws(() => gateway.execute({ operation: INSTAJUDGE_ENGINE_OPERATIONS.EVALUATE_MAGIC_QUESTION, game, message: 'Can I cast Giant Growth?', cards: [cards[6]], verifiedState: {} }), /incomplete/);
assertions += 1; assert.throws(() => gateway.execute({ operation: INSTAJUDGE_ENGINE_OPERATIONS.EVALUATE_MAGIC_QUESTION, game, message: 'Can I cast Giant Growth?', cards: [{}], verifiedState: trustedState }), /card references/);
const impossibleTarget = gateway.execute({ operation: INSTAJUDGE_ENGINE_OPERATIONS.EVALUATE_MAGIC_QUESTION, game, message: 'Can I cast Murder targeting an absent creature?', cards: [cards[3]], verifiedState: trustedState });
check(!['yes', 'YES'].includes(impossibleTarget.result.verdict), 'Impossible target must fail closed rather than return a confident yes.');

console.log(`PASS: InstaJudge mixed integration (${assertions} assertions).`);
console.log(JSON.stringify({
  interpretationCalls: calls.length,
  deterministicGatewayCalls: gatewayCalls.length,
  manualOnlyCalls: 0,
  scenarios: 6,
  invariants: {
    manualStructuredZeroAI: true,
    deterministicRulingAuthority: true,
    deterministicCorrections: true,
    casualStateMutation: false,
    duplicateProcessingPrevented: true
  }
}, null, 2));
