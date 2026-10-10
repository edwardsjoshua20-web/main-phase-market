import fs from 'node:fs';
import { INSTAJUDGE_AI_LIVE_CORPUS } from './instajudge-ai-live-corpus.mjs';
import { createLiveAiRequestGate } from './lib/instajudge-live-ai-safety.mjs';

const endpoint = process.env.INSTAJUDGE_INTERPRET_API_URL;
if (!endpoint) throw new Error('Set INSTAJUDGE_INTERPRET_API_URL to the local Wrangler interpreter endpoint.');
const concurrency = Math.max(1, Math.min(6, Number(process.env.INSTAJUDGE_AI_EVAL_CONCURRENCY || 3)));
const reportPath = process.env.INSTAJUDGE_AI_EVAL_REPORT || '.tmp-instajudge-ai-live-report.json';
const modelPrices = { input: 0.293 / 1_000_000, output: 2.253 / 1_000_000 };
const modelNeurons = { input: 26_668 / 1_000_000, output: 204_805 / 1_000_000 };
const liveAi = createLiveAiRequestGate({ scriptName: 'instajudge:ai:eval', plannedCalls: INSTAJUDGE_AI_LIVE_CORPUS.length });

function norm(value) { return String(value ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
const aliases = {
  turn: { user: ['user', 'you', 'your', 'yours', 'player', 'me', 'my'], opponent: ['opponent', 'their', 'theirs', 'they'] },
  phase: {
    beginning: ['beginning', 'beginning phase', 'upkeep', 'draw', 'draw step'],
    'precombat-main': ['precombat main', 'precombat main phase', 'first main', 'first main phase'],
    combat: ['combat', 'combat phase'], 'postcombat-main': ['postcombat main', 'postcombat main phase', 'second main', 'second main phase'],
    ending: ['ending', 'ending phase', 'end', 'end step']
  },
  step: {
    upkeep: ['upkeep', 'upkeep step'], draw: ['draw', 'draw step'],
    'beginning-of-combat': ['beginning of combat', 'beginning of combat step'],
    'declare-attackers': ['declare attackers', 'declare attackers step', 'after attackers', 'before blockers'],
    'declare-blockers': ['declare blockers', 'declare blockers step', 'after blocks', 'after blockers'],
    'first-strike-combat-damage': ['first strike combat damage', 'first strike damage'],
    'combat-damage': ['combat damage', 'regular combat damage'], 'end-of-combat': ['end of combat', 'end of combat step'],
    'end-step': ['end step']
  },
  priorityHolder: { user: ['user', 'you', 'your', 'yours', 'player', 'me', 'my'], opponent: ['opponent', 'their', 'theirs', 'they'] }
};

function semanticEqual(field, expected, actual) {
  if (expected === actual) return { pass: true, exact: true };
  if (typeof expected === 'boolean') return { pass: actual === expected, exact: actual === expected };
  const actualKey = norm(actual);
  const accepted = aliases[field]?.[expected] || [norm(expected)];
  return { pass: accepted.includes(actualKey), exact: false };
}

function cardTexts(output) {
  return [
    ...(output.objects || []).map((item) => item.nameText),
    ...(output.actions || []).flatMap((item) => [item.sourceText, item.targetText]),
    ...(output.stack || []).flatMap((item) => [item.sourceText, item.targetText]),
    ...(output.combat?.attackers || []).map((item) => item.attackerText),
    ...(output.combat?.blockers || []).flatMap((item) => [item.blockerText, item.blockedAttackerText])
  ].filter(Boolean);
}

function targetPairs(output) {
  const pairs = [
    ...(output.actions || []).filter((item) => item.sourceText && item.targetText).map((item) => [item.sourceText, item.targetText]),
    ...(output.stack || []).filter((item) => item.sourceText && item.targetText).map((item) => [item.sourceText, item.targetText])
  ];
  return pairs.map(([source, target]) => `${norm(source)}=>${norm(target)}`);
}

function containsRuling(output, input) {
  const inputKey = norm(input);
  const values = JSON.stringify(output).match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)?.map((item) => item.slice(1, -1)) || [];
  return values.some((value) => {
    const key = norm(value);
    if (!key || inputKey.includes(key)) return false;
    return /^(?:yes|no)\b|\b(?:is legal|is illegal|can cast|cannot cast|wins combat|loses the game|deals? \d+ damage)\b/.test(key);
  });
}

function score(test, output) {
  const failures = [];
  let exact = true;
  const facts = output.facts || {};
  for (const [field, expected] of Object.entries(test.expected.facts)) {
    const compared = semanticEqual(field, expected, facts[field]);
    if (!compared.pass) failures.push({ type: facts[field] == null ? 'missing_fact' : 'other_failure', field, expected, actual: facts[field] });
    if (!compared.exact) exact = false;
  }
  for (const field of test.expected.absentFacts) {
    if (facts[field] !== null && facts[field] !== undefined) failures.push({ type: 'invented_fact', field, actual: facts[field] });
  }
  const actualCards = cardTexts(output);
  for (const expected of test.expected.cards) {
    if (!actualCards.some((value) => norm(value) === norm(expected))) failures.push({ type: 'missing_fact', field: 'card', expected, actual: actualCards });
    if (!actualCards.includes(expected)) exact = false;
  }
  for (const expected of test.expected.preserveRaw || []) {
    if (!actualCards.includes(expected)) failures.push({ type: 'card_name_mutation', expected, actual: actualCards });
  }
  if (test.expected.stack) {
    const actual = (output.stack || []).slice().sort((a, b) => a.position - b.position).map((item) => item.sourceText);
    if (actual.length !== test.expected.stack.length || actual.some((value, index) => norm(value) !== norm(test.expected.stack[index]))) failures.push({ type: 'wrong_relationship', field: 'stack_order', expected: test.expected.stack, actual });
    if (actual.some((value, index) => value !== test.expected.stack[index])) exact = false;
  }
  const actualTargets = targetPairs(output);
  for (const pair of test.expected.targets) {
    const wanted = `${norm(pair.source)}=>${norm(pair.target)}`;
    if (!actualTargets.includes(wanted)) failures.push({ type: 'wrong_relationship', field: 'target', expected: pair, actual: actualTargets });
  }
  const actualAttackers = (output.combat?.attackers || []).map((item) => norm(item.attackerText));
  for (const attacker of test.expected.attackers) if (!actualAttackers.includes(norm(attacker))) failures.push({ type: 'wrong_relationship', field: 'attacker', expected: attacker, actual: actualAttackers });
  const actualBlockers = (output.combat?.blockers || []).map((item) => `${norm(item.blockerText)}=>${norm(item.blockedAttackerText)}`);
  for (const blocker of test.expected.blockers) {
    const wanted = `${norm(blocker.blocker)}=>${norm(blocker.attacker)}`;
    if (!actualBlockers.includes(wanted)) failures.push({ type: 'wrong_relationship', field: 'blocker', expected: blocker, actual: actualBlockers });
  }
  if (test.expected.correction) {
    if (output.interpretationType !== 'correction' || !output.correction) failures.push({ type: 'wrong_correction_classification', expected: test.expected.correctionField, actual: output.interpretationType });
    else {
      if (!norm(output.correction.field).includes(norm(test.expected.correctionField))) failures.push({ type: 'wrong_correction_classification', field: 'correction.field', expected: test.expected.correctionField, actual: output.correction.field });
      if (test.expected.correctionValue && !norm(output.correction.proposedValueText).includes(norm(test.expected.correctionValue))) failures.push({ type: 'wrong_correction_classification', field: 'correction.value', expected: test.expected.correctionValue, actual: output.correction.proposedValueText });
    }
  } else if (output.interpretationType === 'correction' || output.correction) failures.push({ type: 'wrong_correction_classification', expected: false, actual: output.correction });
  const ambiguous = (output.ambiguities || []).length > 0 || output.interpretationType === 'unknown';
  if (test.expected.ambiguity && !ambiguous) failures.push({ type: 'missing_fact', field: 'ambiguity', expected: true, actual: false });
  if (!test.expected.ambiguity && (output.ambiguities || []).length > 0) failures.push({ type: 'excessive_ambiguity', actual: output.ambiguities });
  if (test.expected.noRuling && containsRuling(output, test.message)) failures.push({ type: 'invented_ruling' });
  return { failures, exact: failures.length === 0 && exact, acceptable: failures.length === 0 && !exact };
}

async function runCase(test) {
  const started = performance.now();
  let response;
  try {
    response = await liveAi.fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: 'magic', message: test.message, knownState: test.knownState || {}, pendingQuestion: test.pendingQuestion || null, recentContext: [] })
    });
    const body = await response.json();
    if (!response.ok || !body.interpretation) return { ...test, status: 'schema_failure', httpStatus: response.status, error: body.error || 'No interpretation', latencyMs: Math.round(performance.now() - started), usage: body.usage || null };
    const scored = score(test, body.interpretation);
    return { ...test, status: scored.exact ? 'exact_pass' : scored.acceptable ? 'acceptable_pass' : 'failed', failures: scored.failures, output: body.interpretation, model: body.model, usage: body.usage || null, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { ...test, status: 'schema_failure', httpStatus: response?.status || null, error: error.message, latencyMs: Math.round(performance.now() - started), usage: null };
  }
}

const results = new Array(INSTAJUDGE_AI_LIVE_CORPUS.length);
let cursor = 0;
let completed = 0;
async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= INSTAJUDGE_AI_LIVE_CORPUS.length) return;
    results[index] = await runCase(INSTAJUDGE_AI_LIVE_CORPUS[index]);
    completed += 1;
    if (completed % 10 === 0 || completed === results.length) console.log(`Evaluated ${completed}/${results.length}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const statusCounts = Object.fromEntries(['exact_pass', 'acceptable_pass', 'failed', 'schema_failure'].map((status) => [status, results.filter((result) => result.status === status).length]));
const failureCounts = {};
for (const result of results) for (const failure of result.failures || []) failureCounts[failure.type] = (failureCounts[failure.type] || 0) + 1;
const categories = {};
for (const category of [...new Set(results.map((result) => result.category))]) {
  const group = results.filter((result) => result.category === category);
  categories[category] = { total: group.length, passed: group.filter((result) => ['exact_pass', 'acceptable_pass'].includes(result.status)).length, failed: group.filter((result) => !['exact_pass', 'acceptable_pass'].includes(result.status)).length };
}
const usage = results.reduce((total, result) => {
  const item = result.usage || {};
  total.inputTokens += Number(item.prompt_tokens || item.input_tokens || 0);
  total.outputTokens += Number(item.completion_tokens || item.output_tokens || 0);
  total.totalTokens += Number(item.total_tokens || 0);
  total.reportedNeurons += Number(item.neurons || 0);
  return total;
}, { inputTokens: 0, outputTokens: 0, totalTokens: 0, reportedNeurons: 0 });
usage.approximateCostUsd = Number((usage.inputTokens * modelPrices.input + usage.outputTokens * modelPrices.output).toFixed(6));
usage.estimatedNeurons = Number((usage.inputTokens * modelNeurons.input + usage.outputTokens * modelNeurons.output).toFixed(3));
usage.reportedNeurons = Number(usage.reportedNeurons.toFixed(3));
const report = {
  generatedAt: new Date().toISOString(), endpoint, model: results.find((item) => item.model)?.model || null,
  modelCalls: results.length, concurrency, statusCounts, failureCounts, categories, usage,
  latencyMs: { average: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length), max: Math.max(...results.map((item) => item.latencyMs)) },
  results
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, model: report.model, modelCalls: report.modelCalls, statusCounts, failureCounts, categories, usage, latencyMs: report.latencyMs }, null, 2));
