import { isRulingReportIntent } from './rulingReportCore.js';

export const INSTAJUDGE_MESSAGE_ROUTES = Object.freeze({
  MANUAL_STRUCTURED: 'manual_structured',
  FREEFORM_STATE: 'freeform_state',
  RULES_QUESTION: 'rules_question',
  CORRECTION: 'correction',
  CONVERSATIONAL_INTERRUPTION: 'conversational_interruption',
  CASUAL_CONVERSATION: 'casual_conversation',
  RULING_REPORT: 'ruling_report',
  UNKNOWN: 'unknown'
});

const MANUAL_CHOICES = new Set([
  'ask a rules question', 'check a play', 'combat ruling', 'timing / priority',
  'commander',
  'mine', "opponent's", 'opponent', 'me', 'not sure',
  'untap', 'upkeep', 'draw', 'precombat main', 'combat', 'postcombat main', 'end step', 'cleanup',
  'beginning of combat', 'before attackers', 'declare attackers', 'after attackers',
  'after attackers / before blockers', 'before blockers', 'declare blockers', 'after blockers',
  'first-strike damage', 'after first-strike damage', 'combat damage', 'end of combat',
  'empty', 'not empty', 'opponent responded', 'i responded', 'no response', 'no target',
  'yes', 'no', 'looks right', 'edit state', 'yes change it', 'no keep it'
]);
const MAGIC_INTENT_CHOICES = new Set(['ask a rules question', 'check a play', 'combat ruling', 'timing / priority']);

const DIRECT_ANSWERS = Object.freeze({
  turn: /^(?:mine|my turn|me|opponent(?:'s)?|opponent's turn|their turn)$/i,
  phase: /^(?:untap|upkeep|draw(?: step)?|precombat main|combat|postcombat main|end step|cleanup)$/i,
  step: /^(?:untap|upkeep|draw(?: step)?|beginning of combat|before attackers|declare attackers|after attackers|after attackers\s*\/\s*before blockers|before blockers|declare blockers|after blockers|first(?:-| )strike damage|after first(?:-| )strike damage|combat damage|end of combat)$/i,
  priority: /^(?:me|mine|i have priority|opponent|opponent's|they have priority|not sure)$/i,
  stack: /^(?:empty|not empty|something is on the stack)$/i,
  'stack-response-choice': /^(?:opponent responded|i responded|no response)$/i,
  'stack-response-target': /^(?:no target)$/i,
  'combat-blockers': /^(?:none|no blockers?)$/i,
  'commander-prior-damage': /^\d+$/,
  'commander-new-damage': /^\d+$/,
  'commander-life': /^\d+$/
});

function normalize(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isManualStructuredMessage(message = '') {
  return MANUAL_CHOICES.has(normalize(message));
}

export function isExpectedStructuredAnswer({ message = '', pendingStateKey = null, resolvedCards = [] } = {}) {
  const clean = String(message || '').trim();
  if (!clean || !pendingStateKey) return false;
  if (DIRECT_ANSWERS[pendingStateKey]?.test(clean)) return true;
  if (['combat-attackers', 'combat-blockers', 'stack-items', 'stack-response-item', 'stack-response-target', 'commander-card'].includes(pendingStateKey)) {
    return resolvedCards.length > 0;
  }
  if (pendingStateKey === 'commander-opponent') {
    return /^[\p{L}\p{N}][\p{L}\p{N}' -]{0,79}$/u.test(clean) && !/[?]/.test(clean);
  }
  return false;
}

export function routeInstaJudgeMessage({ message = '', stage = '', pendingStateKey = null, inputSource = 'typed', resolvedCards = [] } = {}) {
  const clean = String(message || '').trim();
  if (!clean) return INSTAJUDGE_MESSAGE_ROUTES.UNKNOWN;
  if (inputSource === 'quick-reply') return INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED;
  if (isRulingReportIntent(clean)) return INSTAJUDGE_MESSAGE_ROUTES.RULING_REPORT;
  if (stage === 'intent' && MAGIC_INTENT_CHOICES.has(normalize(clean))) return INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED;
  if (/^commander$/i.test(clean)) return INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED;
  if (stage === 'confirming-correction' && /^(?:yes|yes please|yes,? change it|yeah,? go ahead|go ahead|do it|please do|no|no,? keep it|no,? leave it|leave it|never mind|cancel)$/i.test(clean)) {
    return INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED;
  }
  if (stage === 'verifying' && /^(?:looks right|edit state)$/i.test(clean)) return INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED;
  if (isExpectedStructuredAnswer({ message: clean, pendingStateKey, resolvedCards })) return INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED;
  return inputSource === 'typed'
    ? INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION
    : INSTAJUDGE_MESSAGE_ROUTES.UNKNOWN;
}

export function shouldRepairCollectorInput({ previousStage, previousStateKey, session, result } = {}) {
  if (result?.inputRepairEligible !== true) return false;
  if (!['collecting', 'editing', 'clarifying'].includes(previousStage)) return false;
  if (!previousStateKey || session?.stage !== previousStage) return false;
  const currentKey = session?.pendingStateKey || (session?.stage === 'clarifying' ? 'clarification' : null);
  return currentKey === previousStateKey && result?.interactionField === previousStateKey;
}
