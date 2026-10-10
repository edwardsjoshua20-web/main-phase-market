import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMagicConversationState } from '../src/services/instajudge/magic/conversationState.js';
import { validateAndAdaptMagicInterpretation } from '../src/services/instajudge/interpretation/interpretationAdapter.js';
import { emptyInstaJudgeInterpretation, parseInstaJudgeInterpretation } from '../src/services/instajudge/interpretation/interpretationContract.js';

const fixtureUrl = new URL('./fixtures/instajudge-ai-historical-misses.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8'));
assert.equal(fixture.cases.length, 35, 'Historical miss corpus must remain exactly 35 cases.');

const catalogNames = [
  'Divination', 'Divine Offering', 'Negate', 'Cancel', 'Counterspell', 'Murder', 'Grizzly Bears',
  'Colossal Dreadmaw', 'Giant Growth', 'Lightning Bolt', 'Llanowar Elves'
];
const catalog = catalogNames.map((name, index) => ({
  id: `offline-${index + 1}`, oracle_id: `offline-oracle-${index + 1}`, game: 'magic', name,
  type_line: /Bears|Dreadmaw|Elves/.test(name) ? 'Creature' : 'Instant', oracle_text: ''
}));
const cardKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const searchOwner = {
  async searchPreviewByGame(query) {
    const wanted = cardKey(query);
    return catalog.filter((card) => cardKey(card.name).startsWith(wanted) || card.name.split(/\s+/).some((word) => cardKey(word).startsWith(wanted))).slice(0, 8);
  }
};

function norm(value) { return String(value ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
const aliases = {
  turn: { user: ['user', 'you', 'your', 'player', 'me', 'my'], opponent: ['opponent', 'their', 'they'] },
  phase: { beginning: ['beginning', 'upkeep', 'draw'], 'precombat-main': ['precombat main', 'first main'], combat: ['combat'], 'postcombat-main': ['postcombat main', 'second main'], ending: ['ending', 'end step'] },
  step: { upkeep: ['upkeep'], draw: ['draw', 'draw step'], 'beginning-of-combat': ['beginning of combat'], 'declare-attackers': ['declare attackers', 'after attackers', 'before blockers'], 'declare-blockers': ['declare blockers', 'after blockers'], 'first-strike-combat-damage': ['first strike combat damage', 'first strike damage'], 'combat-damage': ['combat damage', 'regular combat damage'], 'end-of-combat': ['end of combat'], 'end-step': ['end step'] },
  priorityHolder: { user: ['user', 'you', 'me', 'my'], opponent: ['opponent', 'their', 'they'] }
};

function cardTexts(output) {
  return [
    ...output.objects.map((item) => item.nameText),
    ...output.actions.flatMap((item) => [item.sourceText, item.targetText]),
    ...output.stack.flatMap((item) => [item.sourceText, item.targetText]),
    ...output.combat.attackers.map((item) => item.attackerText),
    ...output.combat.blockers.flatMap((item) => [item.blockerText, item.blockedAttackerText])
  ].filter(Boolean);
}

function semanticFailures(test, output) {
  const failures = [];
  for (const [field, expected] of Object.entries(test.expected.facts)) {
    const actual = output.facts[field];
    const accepted = aliases[field]?.[expected] || [norm(expected)];
    if (actual !== expected && !accepted.includes(norm(actual))) failures.push(`${field}:${actual ?? 'missing'}`);
  }
  for (const field of test.expected.absentFacts) if (output.facts[field] !== null && output.facts[field] !== undefined) failures.push(`invented:${field}`);
  const cards = cardTexts(output);
  for (const expected of test.expected.cards) if (!cards.some((value) => norm(value) === norm(expected))) failures.push(`card:${expected}`);
  for (const expected of test.expected.preserveRaw || []) if (!cards.some((value) => norm(value) === norm(expected))) failures.push(`raw:${expected}`);
  if (test.expected.stack) {
    const actual = output.stack.slice().sort((a, b) => a.position - b.position).map((item) => norm(item.sourceText));
    if (actual.length !== test.expected.stack.length || actual.some((value, index) => value !== norm(test.expected.stack[index]))) failures.push('stack-order');
  }
  const targets = [...output.actions, ...output.stack].filter((item) => item.sourceText && item.targetText).map((item) => `${norm(item.sourceText)}=>${norm(item.targetText)}`);
  for (const pair of test.expected.targets) if (!targets.includes(`${norm(pair.source)}=>${norm(pair.target)}`)) failures.push(`target:${pair.source}`);
  const attackers = output.combat.attackers.map((item) => norm(item.attackerText));
  for (const expected of test.expected.attackers) if (!attackers.includes(norm(expected))) failures.push(`attacker:${expected}`);
  const blockers = output.combat.blockers.map((item) => `${norm(item.blockerText)}=>${norm(item.blockedAttackerText)}`);
  for (const pair of test.expected.blockers) if (!blockers.includes(`${norm(pair.blocker)}=>${norm(pair.attacker)}`)) failures.push(`blocker:${pair.blocker}`);
  if (test.expected.correction) {
    if (output.interpretationType !== 'correction' || !norm(output.correction?.field).includes(norm(test.expected.correctionField))) failures.push('correction-field');
  } else if (output.interpretationType === 'correction') failures.push('unexpected-correction');
  const ambiguous = output.ambiguities.length > 0 || output.interpretationType === 'unknown';
  if (test.expected.ambiguity !== ambiguous) failures.push(test.expected.ambiguity ? 'missing-ambiguity' : 'excessive-ambiguity');
  return failures;
}

function stateFor(test) {
  const state = createMagicConversationState();
  if (!test.expected.correction) return state;
  return {
    ...state, activePlayer: 'opponent', phase: 'precombat-main', step: 'upkeep', priorityHolder: 'opponent', priorityKnown: true,
    stack: { known: true, empty: false, items: [{ id: 'historical-stack-1', name: 'Divination', targets: [{ descriptor: 'Grizzly Bears', objectId: null }] }] }
  };
}

const results = [];
for (const test of fixture.cases) {
  if (!test.priorModelOutput) {
    results.push({ id: test.id, rootCause: test.rootCause, outcome: 'insufficient_historical_artifact', failures: [] });
    continue;
  }
  const adapted = await validateAndAdaptMagicInterpretation({ rawInterpretation: test.priorModelOutput, state: stateFor(test), searchOwner, message: test.message });
  const failures = semanticFailures(test, adapted.interpretation);
  const outcome = failures.length === 0 && !adapted.requiresClarification && adapted.unresolved.length === 0 && adapted.invalidFacts.length === 0
    ? 'normalized_correctly'
    : adapted.requiresClarification || adapted.unresolved.length > 0 || adapted.invalidFacts.length > 0
      ? 'safe_manual_clarification'
      : 'future_model_response_required';
  results.push({
    id: test.id, rootCause: test.rootCause, outcome, failures,
    unresolved: adapted.unresolved, candidateCards: Object.fromEntries(Object.entries(adapted.candidateCards).map(([key, cards]) => [key, cards.map((card) => card.name)])),
    strippedFields: adapted.strippedFields, invalidFacts: adapted.invalidFacts
  });
}

function proposal(overrides = {}) {
  const base = emptyInstaJudgeInterpretation();
  return { ...base, interpretationType: 'state_update', confidence: 'high', ...overrides, facts: { ...base.facts, ...(overrides.facts || {}) }, combat: { ...base.combat, ...(overrides.combat || {}) } };
}

let adversarialAssertions = 0;
async function adapt(message, raw, state = createMagicConversationState()) {
  return validateAndAdaptMagicInterpretation({ rawInterpretation: raw, state, searchOwner, message });
}

for (const [message, raw, stripped] of [
  ['First strike damage already happened.', proposal({ facts: { phase: 'combat', step: 'first-strike-combat-damage', stackEmpty: true } }), 'stackEmpty'],
  ['I am the active player.', proposal({ facts: { turn: 'user', priorityHolder: 'user' } }), 'priorityHolder'],
  ['My Grizzly Bears attacks.', proposal({ facts: { phase: 'combat', stackEmpty: true }, objects: [{ localId: 'a', nameText: 'Grizzly Bears', controller: 'opponent', role: 'attacker' }], combat: { attackers: [{ attackerText: 'Grizzly Bears', defender: 'opponent' }] } }), 'stackEmpty']
]) {
  const adapted = await adapt(message, raw);
  assert.ok(adapted.strippedFields.includes(stripped), message); adversarialAssertions += 1;
}

const reversed = await adapt('Divination, then Negate, then Cancel on top.', proposal({
  facts: { stackEmpty: false },
  actions: [
    { sequence: 1, actor: null, actionType: 'cast', sourceText: 'Divination', targetText: null, responseToSequence: null, timingText: null },
    { sequence: 2, actor: null, actionType: 'cast', sourceText: 'Negate', targetText: 'Divination', responseToSequence: 1, timingText: null },
    { sequence: 3, actor: null, actionType: 'cast', sourceText: 'Cancel', targetText: 'Negate', responseToSequence: 2, timingText: null }
  ],
  stack: [
    { position: 1, sourceText: 'Divination', controller: null, targetText: null, responseToPosition: null },
    { position: 2, sourceText: 'Negate', controller: null, targetText: 'Divination', responseToPosition: 1 },
    { position: 3, sourceText: 'Cancel', controller: null, targetText: 'Negate', responseToPosition: 2 }
  ]
}));
assert.deepEqual(reversed.interpretation.stack.map((item) => item.sourceText), ['Cancel', 'Negate', 'Divination']); adversarialAssertions += 1;

const fabricatedTarget = await adapt('Murder is on the stack.', proposal({ facts: { stackEmpty: false }, stack: [{ position: 1, sourceText: 'Murder', controller: 'opponent', targetText: 'Grizzly Bears', responseToPosition: null }] }));
assert.equal(fabricatedTarget.interpretation.stack[0].targetText, null); adversarialAssertions += 1;
assert.equal(fabricatedTarget.interpretation.stack[0].controller, null); adversarialAssertions += 1;

const invalidCorrection = await adapt('Scratch that.', proposal({ interpretationType: 'correction', correction: { field: 'turn', previousValueText: null, proposedValueText: 'user' } }));
assert.ok(invalidCorrection.invalidFacts.includes('correction')); adversarialAssertions += 1;

assert.throws(() => parseInstaJudgeInterpretation({ ...proposal(), ruling: 'YES' })); adversarialAssertions += 1;

for (const [message, phase, step, window = null] of [
  ['Beginning of combat.', 'combat', 'beginning-of-combat', null],
  ['Before attackers are declared.', 'combat', 'beginning-of-combat', 'before-attackers'],
  ['Attackers declared.', 'combat', 'declare-attackers', 'after-attackers'],
  ['After attackers are declared!', 'combat', 'declare-attackers', 'after-attackers'],
  ['Before I declare blockers.', 'combat', 'declare-attackers', 'before-blockers'],
  ['Declare blockers.', 'combat', 'declare-blockers', null],
  ['Blockers have been declared.', 'combat', 'declare-blockers', 'after-blockers'],
  ['After blockers.', 'combat', 'declare-blockers', 'after-blockers'],
  ['First-strike damage.', 'combat', 'first-strike-combat-damage', null],
  ['First strike damage already happened.', 'combat', 'first-strike-combat-damage', 'between-damage-steps'],
  ['Regular combat damage.', 'combat', 'combat-damage', null],
  ['End of combat.', 'combat', 'end-of-combat', null]
]) {
  const adapted = await adapt(message, proposal({ facts: { phase: 'ending', step: 'cleanup', stackEmpty: true } }));
  assert.equal(adapted.interpretation.facts.phase, phase, message); adversarialAssertions += 1;
  assert.equal(adapted.interpretation.facts.step, step, message); adversarialAssertions += 1;
  assert.equal(adapted.interpretation.facts.stackEmpty, null, message); adversarialAssertions += 1;
  if (window) assert.equal(adapted.state.combat.window, window, message); adversarialAssertions += 1;
}

for (const [message, inputOrder] of [
  ['Cancel is on top of Negate, which is on top of Divination.', ['Cancel', 'Negate', 'Divination']],
  ['Top to bottom is Cancel, Negate, Divination.', ['Cancel', 'Negate', 'Divination']],
  ['Bottom to top is Divination, Negate, Cancel.', ['Divination', 'Negate', 'Cancel']],
  ['Divination is bottom, Negate above it, Cancel on top.', ['Cancel', 'Negate', 'Divination']]
]) {
  const stack = inputOrder.map((sourceText, index) => ({ position: index + 1, sourceText, controller: null, targetText: null, responseToPosition: index + 1 < inputOrder.length ? index + 2 : null }));
  const adapted = await adapt(message, proposal({ facts: { stackEmpty: false }, stack }));
  assert.deepEqual(adapted.interpretation.stack.map((item) => item.sourceText), ['Cancel', 'Negate', 'Divination'], message); adversarialAssertions += 1;
}

const correctionState = {
  ...createMagicConversationState(), activePlayer: 'opponent', phase: 'combat', step: 'declare-attackers', priorityHolder: 'opponent', priorityKnown: true,
  stack: { known: true, empty: false, items: [{ id: 's1', name: 'Negate', targets: [{ descriptor: 'Grizzly Bears', objectId: null }] }] }
};
for (const [message, field] of [
  ['I meant empty.', 'stack'], ["Actually it's my turn.", 'turn'], ['I meant declare blockers.', 'step'],
  ['No, Murder targets Dreadmaw.', 'target'], ['No, priority is mine.', 'priority'], ['Not Negate — Cancel.', 'stack']
]) {
  const adapted = await adapt(message, proposal({ interpretationType: 'correction', correction: { field: 'pendingQuestion', previousValueText: null, proposedValueText: message } }), correctionState);
  assert.equal(adapted.interpretation.correction.field, field, message); adversarialAssertions += 1;
}

const targetCorrection = await adapt('Murder targets Dreadmaw, not Bears.', proposal({ interpretationType: 'correction', correction: { field: 'stack', previousValueText: 'Bears', proposedValueText: 'Bears' } }), correctionState);
assert.equal(targetCorrection.interpretation.correction.field, 'target'); adversarialAssertions += 1;
assert.equal(targetCorrection.interpretation.correction.proposedValueText, 'dreadmaw'); adversarialAssertions += 1;

const stackReplacement = await adapt('Not Negate — Cancel.', proposal({ interpretationType: 'correction', correction: { field: 'pendingQuestion', previousValueText: null, proposedValueText: null } }), correctionState);
assert.equal(stackReplacement.interpretation.correction.field, 'stack'); adversarialAssertions += 1;
assert.equal(stackReplacement.interpretation.correction.proposedValueText, 'Cancel'); adversarialAssertions += 1;

for (const [message, name, candidates] of [
  ['I cast Divin.', 'Divin', ['Divination', 'Divine Offering']],
  ['I cast Divin', 'Divin', ['Divination', 'Divine Offering']],
  ['Dreadm.', 'Dreadm', ['Colossal Dreadmaw']],
  ['Bolt.', 'Bolt', ['Lightning Bolt']]
]) {
  const raw = proposal({ objects: [{ localId: 'abbrev', nameText: message.replace(/^I cast /, ''), controller: null, role: 'source' }] });
  const adapted = await adapt(message, raw);
  assert.ok(adapted.unresolved.includes(name), message); adversarialAssertions += 1;
  assert.deepEqual((adapted.candidateCards[name] || []).map((card) => card.name), candidates, message); adversarialAssertions += 1;
}

const counts = Object.fromEntries(['normalized_correctly', 'future_model_response_required', 'safe_manual_clarification', 'insufficient_historical_artifact'].map((outcome) => [outcome, results.filter((item) => item.outcome === outcome).length]));
const byRootCause = Object.fromEntries([...new Set(results.map((item) => item.rootCause))].map((rootCause) => [rootCause, results.filter((item) => item.rootCause === rootCause).length]));
assert.equal(Object.values(counts).reduce((sum, value) => sum + value, 0), 35);

console.log(JSON.stringify({ historicalCases: 35, counts, byRootCause, adversarialAssertions, results }, null, 2));
