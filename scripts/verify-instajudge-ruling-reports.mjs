import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REPORT_STATUSES,
  buildRulingReportDraft,
  captureRulingContext,
  isReportableRulingMessage,
  isRulingReportIntent
} from '../src/services/instajudge/rulingReportCore.js';

let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

const baseState = {
  activePlayer: 'player', phase: 'combat', step: 'declare-blockers', priorityKnown: true, priority: 'player',
  stack: { known: true, empty: true, items: [] },
  combat: {
    active: true,
    window: 'after-blockers',
    attackers: [{ id: 'attacker-1', card: { id: 'dreadmaw', name: 'Colossal Dreadmaw' }, controller: 'player', blocked: true }],
    blockers: [{ id: 'blocker-1', card: { id: 'bears', name: 'Grizzly Bears' }, controller: 'opponent', blocking: 'attacker-1' }],
    damageStep: 'normal'
  },
  commander: null
};
const session = { id: 'session-1', game: 'magic', magicState: baseState, stage: 'questioning' };
const result = {
  game: 'magic', verdict: 'no', kind: 'supported',
  answer: 'No. The attacker remains blocked and has no trample, so it deals 0 damage to the defending player.',
  cards: [{ id: 'dreadmaw', name: 'Colossal Dreadmaw', game: 'magic' }, { id: 'bears', name: 'Grizzly Bears', game: 'magic' }],
  engineScenario: { questionIntent: 'OUTCOME', requestedResult: { type: 'COMBAT_DAMAGE' } },
  provenance: { authority: 'deterministic-magic-runtime', operation: 'evaluate_magic_question', evaluator: 'buildRulesRuling' },
  diagnosticTrace: [{ type: 'combat-continuation', result: '0 damage' }]
};
const judge = { id: 'rowan', displayName: 'Judge Rowan' };
const context = captureRulingContext({ session, userMessage: 'Does Dreadmaw deal damage?', result, judge, inputSource: 'typed' });
const message = { id: 'ruling-1', role: 'assistant', text: result.answer, verdict: result.verdict, result: { ...result, reportContext: context } };
const transcript = [
  { id: 'user-1', role: 'user', text: 'Does Dreadmaw deal damage?' },
  message
];

// Flow A: completed rulings expose a reportable contract and preserve optional player notes.
check(isReportableRulingMessage(message), 'A completed ruling must be reportable.');
const report = buildRulingReportDraft({ message, transcript, session, judge, note: 'Blocked creatures stay blocked.', route: '/InstaJudge?game=magic', appVersion: 'test-build' });
assert.equal(report.userNote, 'Blocked creatures stay blocked.'); assertions += 1;
assert.equal(report.sessionId, 'session-1'); assertions += 1;
assert.equal(report.rulingId, 'ruling-1'); assertions += 1;

// Flow B: natural report phrases route deterministically without mutating canonical state.
for (const phrase of ['wrong', "that's wrong", 'wrong answer', 'bad ruling', 'report this', 'report error', 'that ruling is wrong']) {
  check(isRulingReportIntent(phrase), `Typed report intent was not recognized: ${phrase}`);
}
const beforeState = JSON.stringify(session.magicState);
buildRulingReportDraft({ message, transcript, session, judge });
assert.equal(JSON.stringify(session.magicState), beforeState); assertions += 1;

// Flow C: deterministic reports retain the engine/state snapshot and explicitly record no AI.
assert.equal(report.aiInvolved, false); assertions += 1;
assert.equal(report.engineOperation, 'evaluate_magic_question'); assertions += 1;
assert.equal(report.stateSnapshot.combat.attackers[0].card.name, 'Colossal Dreadmaw'); assertions += 1;
assert.equal(report.diagnosticPayload.provenance.authority, 'deterministic-magic-runtime'); assertions += 1;

// Flow D: AI metadata is retained in a safe bounded form without hidden prompt material.
const aiContext = captureRulingContext({
  session,
  userMessage: 'What happens here?',
  result: { ...result, aiConversation: { intent: 'rules_question', conversationControl: 'continue_conversation', proposedActions: [{ type: 'ask_rules_question' }], rulesRequest: { operation: 'evaluate_magic_question', question: 'What happens here?' }, interpretation: { interpretationType: 'question' }, systemPrompt: 'must-not-persist' } },
  judge
});
const aiMessage = { ...message, id: 'ruling-ai', result: { ...result, aiConversation: true, reportContext: aiContext } };
const aiReport = buildRulingReportDraft({ message: aiMessage, transcript: [...transcript.slice(0, 1), aiMessage], session, judge });
assert.equal(aiReport.aiInvolved, true); assertions += 1;
assert.equal(aiReport.diagnosticPayload.ai.intent, 'rules_question'); assertions += 1;
assert.equal(aiReport.diagnosticPayload.ai.rulesRequest.operation, 'evaluate_magic_question'); assertions += 1;
check(!JSON.stringify(aiReport).includes('must-not-persist'), 'Hidden prompt material must not be persisted.');

// Flow E: stateful combat relationships survive serialization.
assert.equal(report.stateSnapshot.combat.attackers[0].blocked, true); assertions += 1;
assert.equal(report.stateSnapshot.combat.blockers[0].blocking, 'attacker-1'); assertions += 1;
assert.equal(report.stateSnapshot.combat.damageStep, 'normal'); assertions += 1;

// Flow F: Commander context is preserved by the generic canonical-state snapshot.
const commanderSession = { ...session, magicState: { ...baseState, commander: { card: { id: 'atraxa', name: 'Atraxa, Praetors\' Voice' }, priorDamage: 18, newDamage: 4, life: 40 } } };
const commanderContext = captureRulingContext({ session: commanderSession, userMessage: 'Is that lethal commander damage?', result, judge });
const commanderMessage = { ...message, id: 'ruling-commander', result: { ...result, reportContext: commanderContext } };
const commanderReport = buildRulingReportDraft({ message: commanderMessage, transcript: [commanderMessage], session: commanderSession, judge });
assert.equal(commanderReport.stateSnapshot.commander.priorDamage, 18); assertions += 1;
assert.equal(commanderReport.stateSnapshot.commander.newDamage, 4); assertions += 1;

// Flow G: casual and clarification messages are not eligible ruling surfaces.
check(!isReportableRulingMessage({ role: 'assistant', text: 'Thanks for playing.' }), 'Casual messages must not be reportable.');
check(!isReportableRulingMessage({ role: 'assistant', verdict: 'depends', result: { clarificationNeeded: 'Who has priority?' } }), 'Clarifications must not be reportable.');

// Fingerprints are deterministic and change when stable scenario inputs change.
const duplicate = buildRulingReportDraft({ message, transcript, session, judge });
assert.equal(duplicate.scenarioFingerprint, report.scenarioFingerprint); assertions += 1;
const changedMessage = { ...message, result: { ...message.result, reportContext: { ...context, userMessage: 'Can I cast Murder?' } } };
const changed = buildRulingReportDraft({ message: changedMessage, transcript, session, judge });
assert.notEqual(changed.scenarioFingerprint, report.scenarioFingerprint); assertions += 1;

// Transcript collection is bounded and unrelated history cannot expand the payload indefinitely.
const longTranscript = Array.from({ length: 40 }, (_, index) => ({ id: `m-${index}`, role: index % 2 ? 'assistant' : 'user', text: `message ${index}` }));
longTranscript.push(message);
const bounded = buildRulingReportDraft({ message, transcript: longTranscript, session, judge });
check(bounded.diagnosticPayload.transcript.length <= 12, 'Transcript snapshots must remain bounded.');

// Flow H/I: durable storage, status workflow, and server-side admin enforcement exist.
const migration = await readFile(new URL('../supabase/migrations/20261002120000_create_instajudge_error_reports.sql', import.meta.url), 'utf8');
const edgeFunction = await readFile(new URL('../supabase/functions/instajudge-error-reports/index.ts', import.meta.url), 'utf8');
check(migration.includes('enable row level security'), 'The report table must enable RLS.');
check(migration.includes('revoke all on table public.instajudge_error_reports from anon, authenticated'), 'Browser roles must not receive direct report-table access.');
for (const status of REPORT_STATUSES) check(migration.includes(`'${status}'`), `Missing durable report status: ${status}`);
check(edgeFunction.includes('await requireAdmin(request)'), 'Admin management actions must be authenticated server-side.');
check(edgeFunction.indexOf("action === 'create_report'") < edgeFunction.indexOf('await requireAdmin(request)'), 'Anonymous report creation must remain separate from admin management.');
check(edgeFunction.includes("action === 'list_reports'"), 'Admin list action is missing.');
check(edgeFunction.includes("action === 'update_report'"), 'Admin update action is missing.');

console.log(`InstaJudge ruling report verifier passed: ${assertions} assertions.`);
