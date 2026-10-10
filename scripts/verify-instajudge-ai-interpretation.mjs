import assert from 'node:assert/strict';
import { createMagicConversationState } from '../src/services/instajudge/magic/conversationState.js';
import { createInstaJudgeOwner } from '../src/services/instajudge/instajudgeOwner.js';
import { applyConfirmedMagicCorrection, validateAndAdaptMagicInterpretation } from '../src/services/instajudge/interpretation/interpretationAdapter.js';
import { allowsLiveAiFromClient } from '../src/services/instajudge/interpretation/interpretationClient.js';
import { emptyInstaJudgeInterpretation, parseInstaJudgeInterpretation } from '../src/services/instajudge/interpretation/interpretationContract.js';
import { handleInstaJudgeInterpretation } from '../cloudflare/instajudge-ai-interpreter.mjs';
import { createLiveAiRequestGate } from './lib/instajudge-live-ai-safety.mjs';

const catalog = [
  ['Divination', 'Sorcery', 'Draw two cards.'], ['Negate', 'Instant', 'Counter target noncreature spell.'],
  ['Cancel', 'Instant', 'Counter target spell.'], ['Murder', 'Instant', 'Destroy target creature.'],
  ['Grizzly Bears', 'Creature - Bear', ''], ['Colossal Dreadmaw', 'Creature - Dinosaur', 'Trample'],
  ['Giant Growth', 'Instant', 'Target creature gets +3/+3 until end of turn.'],
  ['Lightning Bolt', 'Instant', 'Lightning Bolt deals 3 damage to any target.']
].map(([name, type_line, oracle_text], index) => ({ id: `card-${index + 1}`, oracle_id: `oracle-${index + 1}`, game: 'magic', name, type_line, oracle_text }));

const searchOwner = {
  async searchPreviewByGame(query) {
    const key = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return catalog.filter((card) => card.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === key);
  }
};

function proposal(overrides = {}) {
  const base = emptyInstaJudgeInterpretation();
  return {
    ...base, interpretationType: 'state_update', confidence: 'high', ...overrides,
    facts: { ...base.facts, ...(overrides.facts || {}) },
    combat: { ...base.combat, ...(overrides.combat || {}) }
  };
}

const cases = [];
function add(message, output, expected = {}) { cases.push({ message, output, expected }); }

for (const [message, field, value, canonical] of [
  ['my turn', 'turn', 'user', ['activePlayer', 'player']], ['their turn', 'turn', 'opponent', ['activePlayer', 'opponent']],
  ['during upkeep', 'phase', 'upkeep', ['phase', 'beginning']], ['in the draw step', 'phase', 'draw', ['phase', 'beginning']],
  ['precombat main', 'phase', 'precombat main', ['phase', 'precombat-main']], ['combat', 'phase', 'combat', ['phase', 'combat']],
  ['postcombat main', 'phase', 'postcombat main', ['phase', 'postcombat-main']], ['in my end step', 'phase', 'end step', ['phase', 'ending']],
  ['beginning of combat', 'step', 'beginning of combat', ['step', 'beginning-of-combat']], ['declare attackers', 'step', 'declare attackers', ['step', 'declare-attackers']],
  ['declare blockers', 'step', 'declare blockers', ['step', 'declare-blockers']], ['first-strike damage', 'step', 'first strike damage', ['step', 'first-strike-combat-damage']],
  ['combat damage', 'step', 'combat damage', ['step', 'combat-damage']], ['end of combat', 'step', 'end of combat', ['step', 'end-of-combat']],
  ['I have priority', 'priorityHolder', 'user', ['priorityHolder', 'player']], ['they have priority', 'priorityHolder', 'opponent', ['priorityHolder', 'opponent']],
  ['the stack is empty', 'stackEmpty', true, ['stack.empty', true]], ['something is on the stack', 'stackEmpty', false, ['stack.empty', false]]
]) add(message, proposal({ facts: { [field]: value } }), { canonical });

add('I cast Divination.', proposal({ objects: [{ localId: 'o1', nameText: 'Divination', controller: 'user', role: 'spell' }], actions: [{ sequence: 1, actor: 'user', actionType: 'cast', sourceText: 'Divination', targetText: null, responseToSequence: null, timingText: null }], stack: [{ position: 1, sourceText: 'Divination', controller: 'user', targetText: null, responseToPosition: null }] }), { stack: ['Divination'] });
add('Murder targeting Grizzly Bears is on the stack.', proposal({ objects: [{ localId: 'o1', nameText: 'Grizzly Bears', controller: 'opponent', role: 'target' }], stack: [{ position: 1, sourceText: 'Murder', controller: 'user', targetText: 'Grizzly Bears', responseToPosition: null }] }), { stack: ['Murder'] });
add('I cast Divination, he Negates it, then I Cancel his Negate.', proposal({ stack: [{ position: 1, sourceText: 'Cancel', controller: 'user', targetText: 'Negate', responseToPosition: 2 }, { position: 2, sourceText: 'Negate', controller: 'opponent', targetText: 'Divination', responseToPosition: 3 }, { position: 3, sourceText: 'Divination', controller: 'user', targetText: null, responseToPosition: null }] }), { stack: ['Cancel', 'Negate', 'Divination'] });
add('Lightning Bolt targeting my opponent is on the stack.', proposal({ stack: [{ position: 1, sourceText: 'Lightning Bolt', controller: 'user', targetText: 'opponent', responseToPosition: null }] }), { stack: ['Lightning Bolt'] });
add('Giant Growth targeting Grizzly Bears.', proposal({ objects: [{ localId: 'o1', nameText: 'Grizzly Bears', controller: 'user', role: 'target' }], stack: [{ position: 1, sourceText: 'Giant Growth', controller: 'user', targetText: 'Grizzly Bears', responseToPosition: null }] }), { stack: ['Giant Growth'] });
add('Negate is on top of Divination.', proposal({ stack: [{ position: 1, sourceText: 'Negate', controller: 'opponent', targetText: 'Divination', responseToPosition: 2 }, { position: 2, sourceText: 'Divination', controller: 'user', targetText: null, responseToPosition: null }] }), { stack: ['Negate', 'Divination'] });
add('two Divinations are on the stack', proposal({ stack: [{ position: 1, sourceText: 'Divination', controller: 'user', targetText: null, responseToPosition: 2 }, { position: 2, sourceText: 'Divination', controller: 'user', targetText: null, responseToPosition: null }] }), { stack: ['Divination', 'Divination'] });

const combatFacts = { turn: 'user', phase: 'combat', step: 'declare blockers', priorityHolder: null, stackEmpty: true };
add('Colossal Dreadmaw is attacking.', proposal({ facts: combatFacts, objects: [{ localId: 'a1', nameText: 'Colossal Dreadmaw', controller: 'user', role: 'attacker' }], combat: { attackers: [{ attackerText: 'Colossal Dreadmaw', defender: 'opponent' }] } }), { attackers: 1 });
add('My Bears attacks.', proposal({ facts: combatFacts, objects: [{ localId: 'a1', nameText: 'Grizzly Bears', controller: 'user', role: 'attacker' }], combat: { attackers: [{ attackerText: 'Grizzly Bears', defender: 'opponent' }] } }), { attackers: 1 });
add('Dreadmaw is blocked by Bears.', proposal({ facts: combatFacts, objects: [{ localId: 'a1', nameText: 'Colossal Dreadmaw', controller: 'user', role: 'attacker' }, { localId: 'b1', nameText: 'Grizzly Bears', controller: 'opponent', role: 'blocker' }], combat: { attackers: [{ attackerText: 'Colossal Dreadmaw', defender: 'opponent' }], blockers: [{ blockerText: 'Grizzly Bears', blockedAttackerText: 'Colossal Dreadmaw' }] } }), { attackers: 1, blockers: 1 });
add('Bears attacks and their Bears blocks.', proposal({ facts: combatFacts, objects: [{ localId: 'a1', nameText: 'Grizzly Bears', controller: 'user', role: 'attacker' }, { localId: 'b1', nameText: 'Grizzly Bears', controller: 'opponent', role: 'blocker' }], combat: { attackers: [{ attackerText: 'Grizzly Bears', defender: 'opponent' }], blockers: [{ blockerText: 'Grizzly Bears', blockedAttackerText: 'Grizzly Bears' }] } }), { attackers: 1, blockers: 1 });
add('Dreadmaw attacks, Bears blocks, Murder targets Bears.', proposal({ facts: combatFacts, objects: [{ localId: 'a1', nameText: 'Colossal Dreadmaw', controller: 'user', role: 'attacker' }, { localId: 'b1', nameText: 'Grizzly Bears', controller: 'opponent', role: 'blocker' }], stack: [{ position: 1, sourceText: 'Murder', controller: 'user', targetText: 'Grizzly Bears', responseToPosition: null }], combat: { attackers: [{ attackerText: 'Colossal Dreadmaw', defender: 'opponent' }], blockers: [{ blockerText: 'Grizzly Bears', blockedAttackerText: 'Colossal Dreadmaw' }] } }), { attackers: 1, blockers: 1, stack: ['Murder'] });
add('Dreadmaw and Bears attack.', proposal({ facts: combatFacts, objects: [{ localId: 'a1', nameText: 'Colossal Dreadmaw', controller: 'user', role: 'attacker' }, { localId: 'a2', nameText: 'Grizzly Bears', controller: 'user', role: 'attacker' }], combat: { attackers: [{ attackerText: 'Colossal Dreadmaw', defender: 'opponent' }, { attackerText: 'Grizzly Bears', defender: 'opponent' }] } }), { attackers: 2 });
add('Their Dreadmaw attacks me.', proposal({ facts: { ...combatFacts, turn: 'opponent' }, objects: [{ localId: 'a1', nameText: 'Colossal Dreadmaw', controller: 'opponent', role: 'attacker' }], combat: { attackers: [{ attackerText: 'Colossal Dreadmaw', defender: 'user' }] } }), { attackers: 1 });

for (const [message, name] of [['Murdar targets Bears.', 'Murdar'], ['I cast Divin.', 'Divin'], ['Bears attacks.', 'Bears'], ['Colossal is attacking.', 'Colossal'], ['I cast Nagate.', 'Nagate']]) {
  add(message, proposal({ objects: [{ localId: 'x', nameText: name, controller: 'user', role: 'source' }] }), { unresolved: name });
}

for (const [message, field, value] of [
  ['I meant empty.', 'stack', 'empty'], ['actually empty', 'stack', 'empty'], ['no, the stack is empty', 'stack', 'empty'],
  ['I meant my turn', 'turn', 'user'], ["actually opponent's turn", 'turn', 'opponent'],
  ['I meant declare blockers', 'step', 'declare blockers'], ['no, precombat main', 'phase', 'precombat main'],
  ['actually Murder is on the stack', 'stack', 'Murder']
]) add(message, proposal({ interpretationType: 'correction', correction: { field, previousValueText: null, proposedValueText: value }, ...(value === 'Murder' ? { objects: [{ localId: 'm', nameText: 'Murder', controller: 'user', role: 'spell' }] } : {}) }), { correction: true });

add('Can I cast this?', proposal({ interpretationType: 'question' }), { unchanged: true });
add('I pass priority.', proposal({ actions: [{ sequence: 1, actor: 'user', actionType: 'pass', sourceText: null, targetText: null, responseToSequence: null, timingText: null }] }), { unchanged: true });
add('Murder targets Bears.', proposal({ actions: [{ sequence: 1, actor: 'user', actionType: 'cast', sourceText: 'Murder', targetText: 'Grizzly Bears', responseToSequence: null, timingText: null }] }), { cards: 1 });
add('I activate this.', proposal({ actions: [{ sequence: 1, actor: 'user', actionType: 'activate', sourceText: null, targetText: null, responseToSequence: null, timingText: null }], ambiguities: [{ field: 'source', reason: 'No source was named.', candidateTexts: [] }] }), { ambiguity: true });
add('probably sometime in combat', proposal({ confidence: 'low', ambiguities: [{ field: 'step', reason: 'No combat step was supplied.', candidateTexts: [] }] }), { ambiguity: true });
add('something happened', proposal({ interpretationType: 'unknown', confidence: 'low', unrecognized: ['something happened'] }), { unchanged: true });
add('the phase is banana', proposal({ facts: { phase: 'banana' } }), { unchanged: true, invalidFact: 'phase' });
add('Divination is at stack position two', proposal({ stack: [{ position: 2, sourceText: 'Divination', controller: 'user', targetText: null, responseToPosition: null }] }), { unchanged: true, invalidFact: 'stack' });
add('Bears is blocking Dreadmaw', proposal({ objects: [{ localId: 'b1', nameText: 'Grizzly Bears', controller: 'opponent', role: 'blocker' }, { localId: 'a1', nameText: 'Colossal Dreadmaw', controller: 'user', role: 'attacker' }], combat: { blockers: [{ blockerText: 'Grizzly Bears', blockedAttackerText: 'Colossal Dreadmaw' }] } }), { unchanged: true, invalidFact: 'combat' });

assert.ok(cases.length >= 50, `Expected at least 50 cases, got ${cases.length}.`);
let assertions = 0;
for (const test of cases) {
  const parsed = parseInstaJudgeInterpretation(test.output);
  assert.equal(parsed.schemaVersion, 1, test.message); assertions += 1;
  let before = createMagicConversationState();
  if (test.expected.correction) {
    before = {
      ...before,
      activePlayer: 'player',
      phase: 'precombat-main',
      step: 'upkeep',
      priorityHolder: 'opponent',
      priorityKnown: true,
      stack: { known: true, empty: false, items: [{ id: 'existing-stack-1', name: 'Divination', targets: [] }] }
    };
  }
  if (test.expected.attackers !== undefined || test.expected.blockers !== undefined) {
    before = { ...before, phase: 'combat', step: 'declare-blockers', combat: { ...before.combat, known: true, active: true } };
  }
  const adapted = await validateAndAdaptMagicInterpretation({ rawInterpretation: parsed, state: before, searchOwner, message: test.message });
  const accepted = adapted.safeToApply ? adapted.state : before;
  const changed = JSON.stringify(accepted) !== JSON.stringify(before);
  if (test.expected.canonical) {
    const [path, value] = test.expected.canonical;
    const actual = path.split('.').reduce((current, segment) => current?.[segment], accepted);
    assert.equal(actual, value, test.message); assertions += 1;
  }
  if (test.expected.stack) { assert.deepEqual(accepted.stack.items.map((item) => item.name), test.expected.stack, test.message); assertions += 1; }
  if (test.expected.attackers !== undefined) { assert.equal(accepted.combat.attackers.length, test.expected.attackers, test.message); assertions += 1; }
  if (test.expected.blockers !== undefined) { assert.equal(accepted.combat.blocks[0]?.blockerIds.length || 0, test.expected.blockers, test.message); assertions += 1; }
  if (test.expected.unresolved) { assert.ok(adapted.unresolved.includes(test.expected.unresolved), test.message); assert.equal(changed, false, test.message); assertions += 2; }
  if (test.expected.correction) {
    assert.ok(adapted.correction, test.message); assert.equal(changed, false, test.message); assertions += 2;
    const corrected = applyConfirmedMagicCorrection(before, adapted.correction, adapted.cards);
    assert.notDeepEqual(corrected, before, test.message); assertions += 1;
  }
  if (test.expected.unchanged) { assert.equal(changed, false, test.message); assertions += 1; }
  if (test.expected.cards !== undefined) { assert.equal(adapted.cards.length, test.expected.cards, test.message); assertions += 1; }
  if (test.expected.ambiguity) { assert.ok(parsed.ambiguities.length > 0, test.message); assertions += 1; }
  if (test.expected.invalidFact) { assert.ok([...adapted.invalidFacts, ...adapted.strippedFields].includes(test.expected.invalidFact), test.message); assertions += 1; }
}

for (const invalid of [
  {},
  { ...proposal(), schemaVersion: 2 },
  { ...proposal(), ruling: 'yes' },
  { ...proposal(), confidence: 'certain' },
  { ...proposal(), facts: { ...proposal().facts, stackEmpty: 'yes' } },
  { ...proposal(), actions: [{ sequence: 1, actor: null, actionType: 'rule', sourceText: null, targetText: null, responseToSequence: null, timingText: null }] }
]) {
  assert.throws(() => parseInstaJudgeInterpretation(invalid)); assertions += 1;
}

let interpreterCalls = 0;
const fullStateProposal = proposal({
  facts: { turn: 'user', phase: 'precombat main', priorityHolder: 'user', stackEmpty: false },
  stack: [
    { position: 1, sourceText: 'Cancel', controller: 'user', targetText: 'Negate', responseToPosition: 2 },
    { position: 2, sourceText: 'Negate', controller: 'opponent', targetText: 'Divination', responseToPosition: 3 },
    { position: 3, sourceText: 'Divination', controller: 'user', targetText: null, responseToPosition: null }
  ]
});
const mockedOwner = createInstaJudgeOwner({
  searchOwner,
  gameKnowledgeOwner: { getRulesTopicsByCategory() { return []; }, searchRulesTopics() { return []; } },
  legalityOwner: { check() { throw new Error('Not used.'); } },
  interpretationService: { async interpret() { interpreterCalls += 1; return fullStateProposal; } }
});
let ownerFlow = mockedOwner.selectGame(mockedOwner.createSession(), 'magic');
ownerFlow = await mockedOwner.ask({ session: ownerFlow.session, gameId: 'magic', message: 'Ask a rules question' });
assert.equal(interpreterCalls, 0); assertions += 1;
ownerFlow = await mockedOwner.ask({ session: ownerFlow.session, gameId: 'magic', message: 'I cast Divination, he responds with Negate, then I Cancel his Negate.' });
assert.equal(interpreterCalls, 1); assertions += 1;
assert.deepEqual(ownerFlow.session.magicState.stack.items.map((item) => item.name), ['Cancel', 'Negate', 'Divination']); assertions += 1;
assert.equal(ownerFlow.session.magicState.activePlayer, null); assertions += 1;

const correctionOutput = proposal({ interpretationType: 'correction', correction: { field: 'stack', previousValueText: 'not empty', proposedValueText: 'empty' } });
const correctionOwner = createInstaJudgeOwner({
  searchOwner,
  gameKnowledgeOwner: { getRulesTopicsByCategory() { return []; }, searchRulesTopics() { return []; } },
  interpretationService: { async interpret() { return correctionOutput; } }
});
let correctionSession = correctionOwner.selectGame(correctionOwner.createSession(), 'magic').session;
correctionSession = { ...correctionSession, stage: 'editing', magicState: { ...createMagicConversationState(), stack: { known: true, empty: false, items: [{ id: 's1', name: 'Divination', targets: [] }] } } };
let correctionFlow = await correctionOwner.ask({ session: correctionSession, gameId: 'magic', message: 'I meant empty.' });
assert.equal(correctionFlow.session.stage, 'confirming-correction'); assertions += 1;
assert.equal(correctionFlow.session.magicState.stack.empty, false); assertions += 1;
correctionFlow = await correctionOwner.ask({ session: correctionFlow.session, gameId: 'magic', message: 'Yes, change it' });
assert.equal(correctionFlow.session.magicState.stack.empty, true); assertions += 1;

const invalidOwner = createInstaJudgeOwner({
  searchOwner,
  gameKnowledgeOwner: { getRulesTopicsByCategory() { return []; }, searchRulesTopics() { return []; } },
  interpretationService: { async interpret() { return { invalid: true }; } }
});
let fallback = invalidOwner.selectGame(invalidOwner.createSession(), 'magic');
fallback = await invalidOwner.ask({ session: fallback.session, gameId: 'magic', message: 'Ask a rules question' });
fallback = await invalidOwner.ask({ session: fallback.session, gameId: 'magic', message: 'my turn' });
assert.equal(fallback.session.magicState.activePlayer, 'player'); assertions += 1;

const workerRequest = () => new Request('https://api.mainphasemarket.net/api/instajudge/interpret', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ game: 'magic', message: 'my turn', knownState: {}, pendingQuestion: null, recentContext: [] })
});
let capturedModel = null;
let capturedInput = null;
const workerResponse = await handleInstaJudgeInterpretation(workerRequest(), {
  AI: { async run(model, input) { capturedModel = model; capturedInput = input; return { response: proposal({ facts: { turn: 'user' } }) }; } }
});
assert.equal(workerResponse.status, 200); assertions += 1;
assert.match(capturedModel, /^@cf\//); assertions += 1;
assert.equal(capturedInput.temperature, 0); assertions += 1;
assert.equal(capturedInput.response_format.type, 'json_schema'); assertions += 1;
assert.match(capturedInput.messages[0].content, /not a judge/i); assertions += 1;
const unavailableResponse = await handleInstaJudgeInterpretation(workerRequest(), {});
assert.equal(unavailableResponse.status, 503); assertions += 1;
const malformedResponse = await handleInstaJudgeInterpretation(workerRequest(), { AI: { async run() { return { response: { invalid: true } }; } } });
assert.equal(malformedResponse.status, 502); assertions += 1;

assert.equal(allowsLiveAiFromClient({ hostname: '127.0.0.1', explicitOptIn: undefined }), false); assertions += 1;
assert.equal(allowsLiveAiFromClient({ hostname: 'localhost', explicitOptIn: 'true' }), true); assertions += 1;
assert.equal(allowsLiveAiFromClient({ hostname: 'www.mainphasemarket.net', explicitOptIn: undefined }), true); assertions += 1;

let blockedWorkerCalls = 0;
const localWorkerRequest = new Request('http://127.0.0.1:8787/api/instajudge/interpret', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ game: 'magic', message: 'my turn', knownState: {}, pendingQuestion: null, recentContext: [] })
});
const blockedWorkerResponse = await handleInstaJudgeInterpretation(localWorkerRequest, {
  AI: { async run() { blockedWorkerCalls += 1; return { response: proposal() }; } }
});
assert.equal(blockedWorkerResponse.status, 503); assertions += 1;
assert.equal(blockedWorkerCalls, 0); assertions += 1;
assert.match((await blockedWorkerResponse.json()).error, /blocked by development safety gate/i); assertions += 1;

assert.throws(() => createLiveAiRequestGate({
  scriptName: 'blocked-test', plannedCalls: 1, env: {}, fetchImpl: async () => new Response('{}')
}), /blocked by development safety gate/i); assertions += 1;
assert.throws(() => createLiveAiRequestGate({
  scriptName: 'budget-test', plannedCalls: 2,
  env: { INSTAJUDGE_ALLOW_LIVE_AI: 'true', INSTAJUDGE_LIVE_AI_MAX_CALLS: '1' },
  fetchImpl: async () => new Response('{}')
}), /exceeding the explicit process maximum/i); assertions += 1;

let interceptedRequests = 0;
const guardedMock = createLiveAiRequestGate({
  scriptName: 'mock-test', plannedCalls: 1,
  env: { INSTAJUDGE_ALLOW_LIVE_AI: 'true', INSTAJUDGE_LIVE_AI_MAX_CALLS: '1' },
  fetchImpl: async () => { interceptedRequests += 1; return new Response('{"ok":true}', { status: 200 }); }
});
assert.equal((await guardedMock.fetch('https://mock.invalid')).status, 200); assertions += 1;
assert.equal(interceptedRequests, 1); assertions += 1;
await assert.rejects(() => guardedMock.fetch('https://mock.invalid'), /process maximum of 1 reached/i); assertions += 1;
assert.equal(interceptedRequests, 1); assertions += 1;

console.log(`PASS: InstaJudge AI interpretation contract (${cases.length} cases, ${assertions} assertions).`);
