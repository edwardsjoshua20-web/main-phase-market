const REPORT_INTENT = /^(?:that(?:'s| is) wrong|wrong(?: answer)?|bad ruling|report(?: this| error)?|that ruling is wrong)[.!?]*$/i;
const REPORT_STATUSES = Object.freeze([
  'new',
  'reviewing',
  'confirmed_bug',
  'expected_behavior',
  'fixed',
  'closed'
]);

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function splitRulingAnswer(message = {}) {
  const raw = String(message.result?.summary || message.text || message.result?.answer || '').trim();
  const verdict = normalizeText(message.verdict).toUpperCase();
  const answer = verdict && raw.toUpperCase().startsWith(`${verdict} `)
    ? raw.slice(verdict.length).trim()
    : raw;
  const sentenceEnd = answer.match(/^(.+?[.?])(?:\s+|\n+)([\s\S]+)$/);
  if (!sentenceEnd) return { summary: answer, explanation: '' };
  return { summary: sentenceEnd[1].trim(), explanation: sentenceEnd[2].trim() };
}

export function isReportableRulingMessage(message = {}) {
  return message.role === 'assistant'
    && Boolean(message.verdict)
    && !message.result?.clarificationNeeded
    && message.result?.kind !== 'state-verification'
    && message.result?.kind !== 'ui-error';
}

export function isRulingReportIntent(value) {
  return REPORT_INTENT.test(normalizeText(value));
}

export function captureRulingContext({ session, userMessage, result, judge, inputSource = 'typed' }) {
  const cards = Array.isArray(result?.cards) ? result.cards : [];
  return Object.freeze({
    capturedAt: new Date().toISOString(),
    sessionId: session?.id || null,
    game: result?.game || session?.game || null,
    userMessage: String(userMessage || '').trim(),
    stateSnapshot: clone(session?.magicState || {
      game: session?.game || result?.game || null,
      resolvedCards: (session?.resolvedCards || []).map((card) => ({
        id: card.id || card.oracle_id || null,
        name: card.name || null
      }))
    }),
    cards: cards.map((card) => ({
      id: card.id || card.oracle_id || null,
      oracleId: card.oracle_id || null,
      name: card.name || null,
      game: card.game || result?.game || session?.game || null
    })),
    engineScenario: clone(result?.engineScenario || null),
    engineProvenance: clone(result?.provenance || null),
    diagnosticTrace: clone(result?.diagnosticTrace || []),
    aiConversation: clone(result?.aiConversation || null),
    flowRoute: result?.route || null,
    inputSource,
    judge: judge ? { id: judge.id, name: judge.displayName } : null
  });
}

function scenarioFingerprint(context, result) {
  const state = context?.stateSnapshot || {};
  const combat = state.combat || {};
  const stack = state.stack || {};
  const fingerprintInput = {
    game: context?.game,
    operation: context?.engineProvenance?.operation || null,
    verdict: String(result?.verdict || '').toLowerCase(),
    question: normalizeText(context?.userMessage).toLowerCase(),
    cards: (context?.cards || []).map((card) => card.oracleId || card.id || card.name).filter(Boolean).sort(),
    turn: state.activePlayer || null,
    phase: state.phase || null,
    step: state.step || null,
    priority: state.priority || null,
    stack: {
      known: stack.known ?? null,
      empty: stack.empty ?? null,
      items: (stack.items || []).map((item) => item.card?.id || item.card?.name || item.name).filter(Boolean).sort()
    },
    combat: {
      active: combat.active ?? null,
      window: combat.window || null,
      attackers: (combat.attackers || []).map((item) => item.card?.id || item.card?.name || item.name).filter(Boolean).sort(),
      blockers: (combat.blockers || []).map((item) => item.card?.id || item.card?.name || item.name).filter(Boolean).sort()
    }
  };
  return `ij-${fnv1a(stableStringify(fingerprintInput))}`;
}

export function buildRulingReportDraft({ message, transcript = [], session, judge, note = '', route = '', appVersion = '' }) {
  if (!isReportableRulingMessage(message)) throw new Error('Only a completed ruling can be reported.');
  const context = message.result?.reportContext || captureRulingContext({
    session,
    userMessage: '',
    result: message.result,
    judge
  });
  const parts = splitRulingAnswer(message);
  const transcriptWindow = transcript
    .slice(Math.max(0, transcript.findIndex((entry) => entry.id === message.id) - 10), transcript.findIndex((entry) => entry.id === message.id) + 1)
    .slice(-12)
    .map((entry) => ({ role: entry.role, text: String(entry.text || '').trim() }))
    .filter((entry) => entry.text);
  const result = message.result || {};

  return {
    game: context.game === 'magic' ? 'Magic: The Gathering' : (context.game || 'Magic: The Gathering'),
    sessionId: context.sessionId || session?.id || null,
    rulingId: message.id || null,
    judgeId: context.judge?.id || judge?.id || null,
    judgeName: context.judge?.name || judge?.displayName || null,
    route: route || '/InstaJudge',
    userMessage: context.userMessage || transcriptWindow.filter((entry) => entry.role === 'user').at(-1)?.text || '',
    judgeAnswer: parts.summary,
    explanation: parts.explanation,
    userNote: String(note || '').trim(),
    engineOperation: context.engineProvenance?.operation || null,
    engineVerdict: normalizeText(message.verdict || result.verdict).toLowerCase(),
    resultClass: result.kind || result.status || null,
    aiInvolved: Boolean(context.aiConversation || result.aiConversation),
    appVersion: normalizeText(appVersion) || 'local',
    scenarioFingerprint: scenarioFingerprint(context, result),
    cardNames: (context.cards || []).map((card) => card.name).filter(Boolean),
    stateSnapshot: clone(context.stateSnapshot),
    diagnosticPayload: {
      transcript: transcriptWindow,
      cards: clone(context.cards || []),
      scenario: clone(context.engineScenario),
      provenance: clone(context.engineProvenance),
      diagnosticTrace: clone(context.diagnosticTrace || []),
      ai: context.aiConversation ? {
        involved: true,
        intent: context.aiConversation.intent || null,
        conversationControl: context.aiConversation.conversationControl || null,
        proposedActions: clone(context.aiConversation.proposedActions || []),
        rulesRequest: clone(context.aiConversation.rulesRequest || null),
        semanticInterpretation: clone(context.aiConversation.interpretation || null)
      } : { involved: false },
      flow: {
        route: context.flowRoute || null,
        inputSource: context.inputSource || null,
        resultKind: result.kind || null
      }
    }
  };
}

export function isValidReportStatus(status) {
  return REPORT_STATUSES.includes(status);
}

export { REPORT_STATUSES };
