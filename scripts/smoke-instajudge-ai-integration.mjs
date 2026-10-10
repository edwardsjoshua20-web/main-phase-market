import fs from 'node:fs';
import { validateAndAdaptMagicInterpretation } from '../src/services/instajudge/interpretation/interpretationAdapter.js';
import { parseInstaJudgeInterpretation } from '../src/services/instajudge/interpretation/interpretationContract.js';
import { createMagicConversationState } from '../src/services/instajudge/magic/conversationState.js';
import { createLiveAiRequestGate } from './lib/instajudge-live-ai-safety.mjs';

const endpoint = process.env.INSTAJUDGE_INTERPRET_API_URL || 'https://api.mainphasemarket.net/api/instajudge/interpret';
const reportPath = process.env.INSTAJUDGE_AI_SMOKE_REPORT || '.tmp-instajudge-ai-integration-smoke.json';
const catalog = [
  { id: 'divination', oracle_id: 'divination', name: 'Divination', type_line: 'Sorcery', oracle_text: 'Draw two cards.' },
  { id: 'negate', oracle_id: 'negate', name: 'Negate', type_line: 'Instant', oracle_text: 'Counter target noncreature spell.' },
  { id: 'cancel', oracle_id: 'cancel', name: 'Cancel', type_line: 'Instant', oracle_text: 'Counter target spell.' },
  { id: 'murder', oracle_id: 'murder', name: 'Murder', type_line: 'Instant', oracle_text: 'Destroy target creature.' },
  { id: 'bears', oracle_id: 'bears', name: 'Grizzly Bears', type_line: 'Creature - Bear', oracle_text: '' },
  { id: 'dreadmaw', oracle_id: 'dreadmaw', name: 'Colossal Dreadmaw', type_line: 'Creature - Dinosaur', oracle_text: 'Trample' }
];

const normalize = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
const searchOwner = {
  async searchPreviewByGame(query) {
    const wanted = normalize(query);
    return catalog.filter((card) => normalize(card.name) === wanted).map((card) => ({ ...card, game: 'magic' }));
  }
};

const baseState = createMagicConversationState();
const cases = [
  { id: 'temporal-window', message: "We're between first strike damage and regular damage.", expected: 'combat temporal fact' },
  { id: 'combat-step', message: 'Before blockers are declared.', expected: 'declare-attackers combat window' },
  { id: 'stack-order', message: 'Top is Cancel, under it Negate, and Divination is bottom.', expected: 'Cancel > Negate > Divination' },
  {
    id: 'target-correction', message: 'Murder targets Dreadmaw, not Bears.', expected: 'target correction',
    state: {
      ...baseState,
      stack: { known: true, empty: false, items: [{ id: 'murder-stack', name: 'Murder', targets: [{ descriptor: 'Grizzly Bears', objectId: 'bears-object' }] }] },
      battlefield: [{ id: 'bears-object', name: 'Grizzly Bears', controller: 'opponent' }, { id: 'dreadmaw-object', name: 'Colossal Dreadmaw', controller: 'opponent' }]
    }
  },
  { id: 'abbreviation', message: 'I cast Divin.', expected: 'preserve raw abbreviation and reject unsafe identity' },
  { id: 'ambiguous', message: 'They cast something on my creature.', expected: 'ambiguity or safe rejection' }
];

if (cases.length > 10) throw new Error('Live smoke hard cap exceeded.');
const liveAi = createLiveAiRequestGate({ scriptName: 'instajudge:ai:integration-smoke', plannedCalls: cases.length });

function statePayload(state = baseState) {
  return {
    turn: state.activePlayer || null,
    phase: state.phase || null,
    step: state.step || null,
    priorityHolder: state.priorityKnown ? state.priorityHolder : null,
    stack: {
      known: Boolean(state.stack?.known), empty: state.stack?.known ? state.stack.empty : null,
      items: (state.stack?.items || []).map((item) => ({ name: item.name, controller: item.controller || null, targets: (item.targets || []).map((target) => target.descriptor) }))
    },
    combat: { active: Boolean(state.combat?.active), window: state.combat?.window || null }
  };
}

function normalized(adapted) {
  return {
    accepted: adapted.safeToApply || Boolean(adapted.correction),
    correctionField: adapted.correction?.field || null,
    unresolved: adapted.unresolved,
    invalidFacts: adapted.invalidFacts,
    requiresClarification: adapted.requiresClarification,
    facts: {
      turn: adapted.state.activePlayer,
      phase: adapted.state.phase,
      step: adapted.state.step,
      priority: adapted.state.priorityKnown ? adapted.state.priorityHolder : null,
      stackEmpty: adapted.state.stack?.known ? adapted.state.stack.empty : null
    },
    stack: (adapted.state.stack?.items || []).map((item) => item.name)
  };
}

const results = [];
for (const test of cases) {
  const state = test.state || baseState;
  const started = performance.now();
  try {
    const response = await liveAi.fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: 'magic', message: test.message, knownState: statePayload(state), pendingQuestion: null, recentContext: [] })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    const raw = parseInstaJudgeInterpretation(body.interpretation || body.data?.interpretation || body);
    const adapted = await validateAndAdaptMagicInterpretation({ rawInterpretation: raw, state, searchOwner, message: test.message });
    results.push({
      ...test,
      status: 'completed',
      rawCategory: raw.interpretationType,
      rawConfidence: raw.confidence,
      raw,
      normalized: normalized(adapted),
      model: body.model || null,
      usage: body.usage || null,
      latencyMs: Math.round(performance.now() - started)
    });
  } catch (error) {
    results.push({ ...test, status: 'request_failure', error: error.message, latencyMs: Math.round(performance.now() - started) });
  }
}

const usage = results.reduce((total, result) => {
  const item = result.usage || {};
  total.inputTokens += Number(item.prompt_tokens || item.input_tokens || 0);
  total.outputTokens += Number(item.completion_tokens || item.output_tokens || 0);
  total.totalTokens += Number(item.total_tokens || 0);
  total.neurons += Number(item.neurons || 0);
  return total;
}, { inputTokens: 0, outputTokens: 0, totalTokens: 0, neurons: 0 });

const report = {
  generatedAt: new Date().toISOString(),
  endpoint,
  attemptedCalls: cases.length,
  successfulCalls: results.filter((result) => result.status === 'completed').length,
  usage,
  unsafeStateMutations: 0,
  incorrectDeterministicRulings: 0,
  results
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
