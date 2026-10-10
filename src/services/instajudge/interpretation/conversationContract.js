import {
  INSTAJUDGE_INTERPRETATION_JSON_SCHEMA,
  emptyInstaJudgeInterpretation,
  parseInstaJudgeInterpretation
} from './interpretationContract.js';

export const INSTAJUDGE_CONVERSATION_SCHEMA_VERSION = 1;

export const INSTAJUDGE_CONVERSATION_INTENTS = Object.freeze([
  'conversational',
  'correction',
  'state_statement',
  'rules_question',
  'clarification',
  'cancellation',
  'social',
  'confirmation',
  'unknown'
]);

export const INSTAJUDGE_CONVERSATION_CONTROLS = Object.freeze([
  'continue_conversation',
  'hold_collector',
  'suspend_for_correction',
  'suspend_for_rules',
  'continue_collector',
  'suspend_collector',
  'resume_collector',
  'ask_clarification',
  'preserve_pending_correction',
  'complete'
]);

export const INSTAJUDGE_PROPOSED_ACTION_TYPES = Object.freeze([
  'propose_correction',
  'confirm_pending_correction',
  'cancel_pending_correction',
  'request_rollback',
  'identify_stack_object'
]);

const ACTION_FIELDS = Object.freeze(['turn', 'phase', 'step', 'priority', 'stack', 'target']);
const nullableString = (maxLength) => ({ anyOf: [{ type: 'string', maxLength }, { type: 'null' }] });

export const INSTAJUDGE_CONVERSATION_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', enum: [INSTAJUDGE_CONVERSATION_SCHEMA_VERSION] },
    reply: { type: 'string', maxLength: 1_000 },
    intent: { type: 'string', enum: INSTAJUDGE_CONVERSATION_INTENTS },
    proposedActions: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: INSTAJUDGE_PROPOSED_ACTION_TYPES },
          field: { anyOf: [{ type: 'string', enum: ACTION_FIELDS }, { type: 'null' }] },
          value: nullableString(240),
          target: nullableString(240)
        },
        required: ['type', 'field', 'value', 'target']
      }
    },
    rulesRequest: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            operation: { type: 'string', enum: ['evaluate_magic_question'] },
            question: { type: 'string', maxLength: 1_000 }
          },
          required: ['operation', 'question']
        }
      ]
    },
    conversationControl: { type: 'string', enum: INSTAJUDGE_CONVERSATION_CONTROLS },
    interpretation: INSTAJUDGE_INTERPRETATION_JSON_SCHEMA
  },
  required: ['schemaVersion', 'reply', 'intent', 'proposedActions', 'rulesRequest', 'conversationControl', 'interpretation']
});

function cleanText(value, maxLength, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') throw new Error('Expected conversational text.');
  const clean = value.trim();
  if (clean.length > maxLength) throw new Error(`Conversational text exceeds ${maxLength} characters.`);
  return clean;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains missing or unsupported fields.`);
  }
}

function legacyEnvelope(raw) {
  const interpretation = parseInstaJudgeInterpretation(raw);
  const intent = interpretation.interpretationType === 'correction'
    ? 'correction'
    : interpretation.interpretationType === 'question'
      ? 'rules_question'
      : interpretation.interpretationType === 'state_update' || interpretation.interpretationType === 'clarification_answer'
        ? 'state_statement'
        : 'unknown';
  return {
    schemaVersion: INSTAJUDGE_CONVERSATION_SCHEMA_VERSION,
    reply: '',
    intent,
    proposedActions: [],
    rulesRequest: null,
    conversationControl: interpretation.interpretationType === 'correction' ? 'suspend_for_correction' : 'continue_conversation',
    interpretation
  };
}

export function parseInstaJudgeConversation(raw) {
  let input = raw;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { throw new Error('Conversation response is not valid JSON.'); }
  }
  if (input?.interpretationType) return legacyEnvelope(input);
  exactKeys(input, INSTAJUDGE_CONVERSATION_JSON_SCHEMA.required, 'Conversation response');
  if (input.schemaVersion !== INSTAJUDGE_CONVERSATION_SCHEMA_VERSION) throw new Error('Unsupported conversation schema version.');
  if (!INSTAJUDGE_CONVERSATION_INTENTS.includes(input.intent)) throw new Error('Unsupported conversation intent.');
  if (!INSTAJUDGE_CONVERSATION_CONTROLS.includes(input.conversationControl)) throw new Error('Unsupported conversation control.');
  if (!Array.isArray(input.proposedActions) || input.proposedActions.length > 6) throw new Error('proposedActions is invalid.');
  const proposedActions = input.proposedActions.map((action) => {
    exactKeys(action, ['type', 'field', 'value', 'target'], 'Proposed action');
    if (!INSTAJUDGE_PROPOSED_ACTION_TYPES.includes(action.type)) throw new Error('Unsupported proposed action type.');
    if (action.field !== null && !ACTION_FIELDS.includes(action.field)) throw new Error('Unsupported proposed action field.');
    return {
      type: action.type,
      field: action.field,
      value: cleanText(action.value, 240, { nullable: true }),
      target: cleanText(action.target, 240, { nullable: true })
    };
  });
  let rulesRequest = null;
  if (input.rulesRequest !== null) {
    exactKeys(input.rulesRequest, ['operation', 'question'], 'Rules request');
    if (input.rulesRequest.operation !== 'evaluate_magic_question') throw new Error('Unsupported rules operation.');
    rulesRequest = {
      operation: input.rulesRequest.operation,
      question: cleanText(input.rulesRequest.question, 1_000)
    };
  }
  return {
    schemaVersion: input.schemaVersion,
    reply: cleanText(input.reply, 1_000),
    intent: input.intent,
    proposedActions,
    rulesRequest,
    conversationControl: input.conversationControl,
    interpretation: parseInstaJudgeInterpretation(input.interpretation)
  };
}

export function emptyInstaJudgeConversation(overrides = {}) {
  return {
    schemaVersion: INSTAJUDGE_CONVERSATION_SCHEMA_VERSION,
    reply: '',
    intent: 'unknown',
    proposedActions: [],
    rulesRequest: null,
    conversationControl: 'continue_conversation',
    interpretation: emptyInstaJudgeInterpretation(),
    ...overrides
  };
}
