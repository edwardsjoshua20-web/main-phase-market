export const INSTAJUDGE_INTERPRETATION_SCHEMA_VERSION = 1;

export const INTERPRETATION_TYPES = Object.freeze(['state_update', 'clarification_answer', 'correction', 'question', 'unknown']);
export const INTERPRETATION_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);
export const INTERPRETATION_ACTION_TYPES = Object.freeze(['cast', 'activate', 'attack', 'block', 'target', 'pass', 'other']);
const TURN_VALUES = Object.freeze(['user', 'opponent']);
const PHASE_VALUES = Object.freeze(['beginning', 'precombat-main', 'combat', 'postcombat-main', 'ending']);
const STEP_VALUES = Object.freeze(['untap', 'upkeep', 'draw', 'beginning-of-combat', 'declare-attackers', 'declare-blockers', 'first-strike-combat-damage', 'combat-damage', 'end-of-combat', 'end-step', 'cleanup']);
const PLAYER_VALUES = Object.freeze(['user', 'opponent']);

const LIMITS = Object.freeze({ objects: 12, actions: 12, stack: 12, combat: 12, ambiguities: 8, unrecognized: 8, text: 160 });
const nullableString = { anyOf: [{ type: 'string', maxLength: LIMITS.text }, { type: 'null' }] };
const nullableEnum = (values, description) => ({
  description,
  anyOf: [{ type: 'string', enum: values }, { type: 'null' }]
});
const turnValue = nullableEnum(TURN_VALUES, 'Explicit active player only. Use null when unstated.');
const phaseValue = nullableEnum(PHASE_VALUES, 'Explicit phase only. Use null when unstated.');
const stepValue = nullableEnum(STEP_VALUES, 'Explicit step only. Use null when unstated.');
const playerValue = nullableEnum(PLAYER_VALUES, 'Explicit player identity only. Use null when unstated.');

export const INSTAJUDGE_INTERPRETATION_JSON_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', enum: [INSTAJUDGE_INTERPRETATION_SCHEMA_VERSION] },
    interpretationType: { type: 'string', enum: INTERPRETATION_TYPES },
    confidence: { type: 'string', enum: INTERPRETATION_CONFIDENCE },
    facts: { type: 'object', additionalProperties: false, properties: { turn: turnValue, phase: phaseValue, step: stepValue, priorityHolder: playerValue, stackEmpty: { description: 'Explicit stack state only. Use null when unstated.', anyOf: [{ type: 'boolean' }, { type: 'null' }] } }, required: ['turn', 'phase', 'step', 'priorityHolder', 'stackEmpty'] },
    objects: { type: 'array', maxItems: LIMITS.objects, items: { type: 'object', additionalProperties: false, properties: { localId: { type: 'string', maxLength: 64 }, nameText: { type: 'string', maxLength: LIMITS.text }, controller: playerValue, role: nullableString }, required: ['localId', 'nameText', 'controller', 'role'] } },
    actions: { type: 'array', maxItems: LIMITS.actions, items: { type: 'object', additionalProperties: false, properties: { sequence: { type: 'integer', minimum: 1, maximum: LIMITS.actions }, actor: playerValue, actionType: { type: 'string', enum: INTERPRETATION_ACTION_TYPES }, sourceText: nullableString, targetText: nullableString, responseToSequence: { anyOf: [{ type: 'integer', minimum: 1, maximum: LIMITS.actions }, { type: 'null' }] }, timingText: nullableString }, required: ['sequence', 'actor', 'actionType', 'sourceText', 'targetText', 'responseToSequence', 'timingText'] } },
    stack: { type: 'array', maxItems: LIMITS.stack, items: { type: 'object', additionalProperties: false, properties: { position: { type: 'integer', minimum: 1, maximum: LIMITS.stack }, sourceText: { type: 'string', maxLength: LIMITS.text }, controller: playerValue, targetText: nullableString, responseToPosition: { description: 'Position of the lower stack item this responds to, or null.', anyOf: [{ type: 'integer', minimum: 1, maximum: LIMITS.stack }, { type: 'null' }] } }, required: ['position', 'sourceText', 'controller', 'targetText', 'responseToPosition'] } },
    combat: { type: 'object', additionalProperties: false, properties: { attackers: { type: 'array', maxItems: LIMITS.combat, items: { type: 'object', additionalProperties: false, properties: { attackerText: { type: 'string', maxLength: LIMITS.text }, defender: nullableString }, required: ['attackerText', 'defender'] } }, blockers: { type: 'array', maxItems: LIMITS.combat, items: { type: 'object', additionalProperties: false, properties: { blockerText: { type: 'string', maxLength: LIMITS.text }, blockedAttackerText: { type: 'string', maxLength: LIMITS.text } }, required: ['blockerText', 'blockedAttackerText'] } } }, required: ['attackers', 'blockers'] },
    correction: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, properties: { field: { type: 'string', maxLength: 64 }, previousValueText: nullableString, proposedValueText: nullableString }, required: ['field', 'previousValueText', 'proposedValueText'] }] },
    ambiguities: { type: 'array', maxItems: LIMITS.ambiguities, items: { type: 'object', additionalProperties: false, properties: { field: { type: 'string', maxLength: 64 }, reason: { type: 'string', maxLength: 240 }, candidateTexts: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: LIMITS.text } } }, required: ['field', 'reason', 'candidateTexts'] } },
    unrecognized: { type: 'array', maxItems: LIMITS.unrecognized, items: { type: 'string', maxLength: LIMITS.text } }
  },
  required: ['schemaVersion', 'interpretationType', 'confidence', 'facts', 'objects', 'actions', 'stack', 'combat', 'correction', 'ambiguities', 'unrecognized']
});

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value, { nullable = false, max = LIMITS.text } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') throw new Error('Expected a string.');
  const clean = value.trim();
  if (clean.length > max) throw new Error(`Text exceeds ${max} characters.`);
  return clean;
}
function array(value, max, label) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must contain at most ${max} items.`);
  return value;
}
function keys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} contains missing or unsupported fields.`);
}
function integer(value, label, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${label} is invalid.`);
  return value;
}
function nullableInteger(value, label, max) { return value === null ? null : integer(value, label, max); }
export function parseInstaJudgeInterpretation(raw) {
  let input = raw;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { throw new Error('Interpretation is not valid JSON.'); }
  }
  keys(input, INSTAJUDGE_INTERPRETATION_JSON_SCHEMA.required, 'Interpretation');
  if (input.schemaVersion !== INSTAJUDGE_INTERPRETATION_SCHEMA_VERSION) throw new Error('Unsupported interpretation schema version.');
  if (!INTERPRETATION_TYPES.includes(input.interpretationType)) throw new Error('Unsupported interpretation type.');
  if (!INTERPRETATION_CONFIDENCE.includes(input.confidence)) throw new Error('Unsupported confidence value.');

  keys(input.facts, ['turn', 'phase', 'step', 'priorityHolder', 'stackEmpty'], 'facts');
  if (input.facts.stackEmpty !== null && typeof input.facts.stackEmpty !== 'boolean') throw new Error('stackEmpty must be boolean or null.');
  const facts = {
    turn: text(input.facts.turn, { nullable: true }), phase: text(input.facts.phase, { nullable: true }),
    step: text(input.facts.step, { nullable: true }), priorityHolder: text(input.facts.priorityHolder, { nullable: true }),
    stackEmpty: input.facts.stackEmpty
  };
  const objects = array(input.objects, LIMITS.objects, 'objects').map((item) => {
    keys(item, ['localId', 'nameText', 'controller', 'role'], 'object');
    return { localId: text(item.localId, { max: 64 }), nameText: text(item.nameText), controller: text(item.controller, { nullable: true }), role: text(item.role, { nullable: true }) };
  });
  const actions = array(input.actions, LIMITS.actions, 'actions').map((item) => {
    keys(item, ['sequence', 'actor', 'actionType', 'sourceText', 'targetText', 'responseToSequence', 'timingText'], 'action');
    if (!INTERPRETATION_ACTION_TYPES.includes(item.actionType)) throw new Error('Unsupported action type.');
    return { sequence: integer(item.sequence, 'action sequence', LIMITS.actions), actor: text(item.actor, { nullable: true }), actionType: item.actionType, sourceText: text(item.sourceText, { nullable: true }), targetText: text(item.targetText, { nullable: true }), responseToSequence: nullableInteger(item.responseToSequence, 'response action sequence', LIMITS.actions), timingText: text(item.timingText, { nullable: true }) };
  });
  const stack = array(input.stack, LIMITS.stack, 'stack').map((item) => {
    keys(item, ['position', 'sourceText', 'controller', 'targetText', 'responseToPosition'], 'stack item');
    return { position: integer(item.position, 'stack position', LIMITS.stack), sourceText: text(item.sourceText), controller: text(item.controller, { nullable: true }), targetText: text(item.targetText, { nullable: true }), responseToPosition: nullableInteger(item.responseToPosition, 'response stack position', LIMITS.stack) };
  });
  keys(input.combat, ['attackers', 'blockers'], 'combat');
  const combat = {
    attackers: array(input.combat.attackers, LIMITS.combat, 'attackers').map((item) => { keys(item, ['attackerText', 'defender'], 'attacker'); return { attackerText: text(item.attackerText), defender: text(item.defender, { nullable: true }) }; }),
    blockers: array(input.combat.blockers, LIMITS.combat, 'blockers').map((item) => { keys(item, ['blockerText', 'blockedAttackerText'], 'blocker'); return { blockerText: text(item.blockerText), blockedAttackerText: text(item.blockedAttackerText) }; })
  };
  let correction = null;
  if (input.correction !== null) {
    keys(input.correction, ['field', 'previousValueText', 'proposedValueText'], 'correction');
    correction = { field: text(input.correction.field, { max: 64 }), previousValueText: text(input.correction.previousValueText, { nullable: true }), proposedValueText: text(input.correction.proposedValueText, { nullable: true }) };
  }
  const ambiguities = array(input.ambiguities, LIMITS.ambiguities, 'ambiguities').map((item) => { keys(item, ['field', 'reason', 'candidateTexts'], 'ambiguity'); return { field: text(item.field, { max: 64 }), reason: text(item.reason, { max: 240 }), candidateTexts: array(item.candidateTexts, 6, 'candidateTexts').map((value) => text(value)) }; });
  const unrecognized = array(input.unrecognized, LIMITS.unrecognized, 'unrecognized').map((value) => text(value));
  return { schemaVersion: input.schemaVersion, interpretationType: input.interpretationType, confidence: input.confidence, facts, objects, actions, stack, combat, correction, ambiguities, unrecognized };
}

export function emptyInstaJudgeInterpretation(overrides = {}) {
  return { schemaVersion: 1, interpretationType: 'unknown', confidence: 'low', facts: { turn: null, phase: null, step: null, priorityHolder: null, stackEmpty: null }, objects: [], actions: [], stack: [], combat: { attackers: [], blockers: [] }, correction: null, ambiguities: [], unrecognized: [], ...overrides };
}
