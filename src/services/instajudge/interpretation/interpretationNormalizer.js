import { normalizeJudgeText } from '../instajudgeCore.js';

const CORRECTION_LANGUAGE = /\b(?:actually|correction|i meant|i misspoke|i need to (?:change|fix)|i got that wrong|i screwed that up|that's wrong|that is wrong|change my answer|change (?:my )?(?:turn|phase|step|priority|stack|target)|undo that|go back|no\b|scratch that|change that|not\b)/;
const STACK_NONEMPTY = /\b(?:on (?:the )?stack|casts?|cast|responds?|response|in response)\b/;
const STACK_EMPTY = /\b(?:the )?stack (?:is|'s) empty\b|\bnothing (?:is )?on (?:the )?stack\b/;

function textKey(value) {
  return normalizeJudgeText(value).replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
}

function withFact(interpretation, field, value) {
  return { ...interpretation, facts: { ...interpretation.facts, [field]: value } };
}

function temporalFacts(message) {
  const text = textKey(message);
  let phase = null;
  let step = null;
  let window = null;

  if (/\b(?:upkeep|upkeep step)\b/.test(text)) { phase = 'beginning'; step = 'upkeep'; }
  else if (/\b(?:draw step|in draw)\b/.test(text)) { phase = 'beginning'; step = 'draw'; }
  else if (/\b(?:precombat|first) main(?: phase)?\b/.test(text)) phase = 'precombat-main';
  else if (/\b(?:postcombat|second) main(?: phase)?\b/.test(text)) phase = 'postcombat-main';
  else if (/\b(?:end step|ending phase)\b/.test(text)) { phase = 'ending'; step = 'end-step'; }

  if (/\bbeginning of combat\b|\bbefore attackers?(?: are declared)?\b/.test(text)) {
    phase = 'combat'; step = 'beginning-of-combat'; window = 'before-attackers';
  } else if (/\b(?:(?:after )?attackers?(?: are| were| have been)? declared|before (?:i )?(?:choose|declare)? ?blockers?)\b/.test(text)) {
    phase = 'combat'; step = 'declare-attackers'; window = /before/.test(text) ? 'before-blockers' : 'after-attackers';
  } else if (/\b(?:after blocks?|after blockers?|(?:after )?blockers?(?: are| were| have been)? declared)\b/.test(text)) {
    phase = 'combat'; step = 'declare-blockers'; window = 'after-blockers';
  } else if (/\bdeclare blockers?(?: step)?\b/.test(text)) {
    phase = 'combat'; step = 'declare-blockers';
  } else if (/\bdeclare attackers?(?: step)?\b/.test(text)) {
    phase = 'combat'; step = 'declare-attackers';
  } else if (/\b(?:between first[- ]strike (?:combat )?damage and (?:normal|regular) (?:combat )?damage|between first[- ]strike and (?:normal|regular) damage|first[- ]strike (?:combat )?damage (?:already )?(?:happened|resolved)|after first[- ]strike (?:combat )?damage)\b/.test(text)) {
    phase = 'combat'; step = 'first-strike-combat-damage'; window = 'between-damage-steps';
  } else if (/\bfirst[- ]strike (?:combat )?damage\b/.test(text)) {
    phase = 'combat'; step = 'first-strike-combat-damage';
  } else if (/\b(?:regular|normal) (?:combat )?damage\b|\bcombat damage(?: step)?\b/.test(text)) {
    phase = 'combat'; step = 'combat-damage';
  } else if (/\bend of combat(?: step)?\b/.test(text)) {
    phase = 'combat'; step = 'end-of-combat';
  } else if (/\bcombat(?: phase)?\b/.test(text) && !phase) phase = 'combat';

  return { phase, step, window };
}

function explicitTurn(message) {
  const text = textKey(message);
  if (/\b(?:my turn|i am (?:taking|the active player)|i'm the active player|turn belongs to me)\b/.test(text)) return 'user';
  if (/\b(?:opponent'?s turn|their turn|opponent is the active player|turn belongs to (?:my )?opponent)\b/.test(text)) return 'opponent';
  return null;
}

function explicitPriority(message) {
  const text = textKey(message);
  if (!/\bpriority\b/.test(text) || /\b(?:waiting for|neither player|has(?:n't| not) said|i pass priority|i passed priority)\b/.test(text)) return null;
  if (/\b(?:i|me|mine|my|user)\b.{0,28}\bpriority\b|\bpriority\b.{0,28}\b(?:me|mine|my)\b|\bpassed priority to me\b/.test(text)) return 'user';
  if (/\b(?:opponent|they|their)\b.{0,28}\bpriority\b|\bpriority\b.{0,28}\b(?:opponent|them|theirs)\b/.test(text)) return 'opponent';
  return null;
}

function explicitStackState(message, interpretationType) {
  const text = textKey(message);
  if (STACK_EMPTY.test(text)) return true;
  if (interpretationType !== 'question' && STACK_NONEMPTY.test(text)) return false;
  return null;
}

function correctionField(message) {
  const text = textKey(message);
  if (!CORRECTION_LANGUAGE.test(text)) return null;
  if (/\b(?:target|targets|targeting)\b/.test(text)) return 'target';
  if (/\b(?:stack|empty|not empty|nonempty)\b/.test(text)) return 'stack';
  if (/\bpriority\b/.test(text)) return 'priority';
  if (/\bturn\b/.test(text)) return 'turn';
  if (/\b(?:upkeep|draw step|beginning of combat|declare attackers?|declare blockers?|first[- ]strike|combat damage|end step|cleanup)\b/.test(text)) return 'step';
  if (/\b(?:phase|precombat|postcombat|first main|second main)\b/.test(text)) return 'phase';
  if (/^\s*not\s+.+?\s*[-—]\s*.+[.!?]*\s*$/i.test(String(message))) return 'stack';
  return null;
}

function correctionValue(message, field, fallback) {
  const text = textKey(message);
  if (field === 'turn') return explicitTurn(message) || fallback;
  if (field === 'priority') return explicitPriority(message) || fallback;
  if (field === 'phase') return temporalFacts(message).phase || fallback;
  if (field === 'step') return temporalFacts(message).step || fallback;
  if (field === 'target') return text.match(/\btargets?\s+(.+?)(?=\s*,?\s+not\b|$)/)?.[1]?.replace(/[.,!?;:]+$/g, '').trim() || fallback;
  if (field === 'stack') {
    if (STACK_EMPTY.test(text) || /\bisn't on the stack\b/.test(text)) return 'empty';
    const replacement = String(message).match(/\bnot\s+(.+?)\s*[-—]\s*(.+)$/i);
    if (replacement) return replacement[2].replace(/[.,!?;:]+$/g, '').trim();
  }
  return fallback;
}

function hasConcreteRelationship(interpretation) {
  return interpretation.actions.some((item) => item.sourceText)
    || interpretation.combat.attackers.length > 0
    || interpretation.combat.blockers.length > 0
    || interpretation.stack.some((item) => item.sourceText);
}

function normalizeAmbiguities(message, interpretation) {
  const text = textKey(message);
  let ambiguities = interpretation.ambiguities.filter((item) => {
    const field = textKey(item.field);
    const reason = textKey(item.reason);
    if (hasConcreteRelationship(interpretation)
      && ['actor', 'controller', 'relationship', 'turn', 'phase', 'step', 'priorityholder', 'stack'].includes(field)
      && /(?:not stated|unstated|missing information|identity of actor|identity of attacker controller|attack declared|step not stated)/.test(reason)) return false;
    return true;
  });
  const add = (field, reason, candidateTexts = []) => {
    if (!ambiguities.some((item) => textKey(item.field) === field)) ambiguities.push({ field, reason, candidateTexts });
  };
  if (/\bneither player\b.*\bpriority\b|\bhas(?:n't| not) said who has priority\b/.test(text)) add('priorityHolder', 'The priority holder was not supplied.', ['user', 'opponent']);
  if (/^i respond[.!?]*$/.test(text)) add('sourceText', 'The response was not identified.', []);
  if (/\b(?:an|the) ability (?:is )?on (?:the )?stack\b/.test(text) && interpretation.stack.some((item) => !item.sourceText.trim())) add('sourceText', 'The ability source was not identified.', []);
  if (/\b(?:between|after) first[- ]strike (?:combat )?damage\b/.test(text)) add('combatWindow', 'The statement describes a priority window between combat damage steps.', ['between-damage-steps']);
  if (/\b(?:that one|the other one|he casts it|he targets it)\b/.test(text)) add('reference', 'The referenced object is not uniquely identified.', []);
  return ambiguities;
}

function normalizeControllers(message, interpretation) {
  const text = textKey(message);
  const actorFor = (sourceText, proposed) => {
    if (!proposed || !sourceText) return proposed;
    const source = textKey(sourceText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!source) return null;
    if (new RegExp(`\\b(?:i|my)\\b.{0,36}\\b${source}\\b`).test(text)) return proposed === 'user' ? proposed : null;
    if (new RegExp(`\\b(?:opponent|they|their|he|she)\\b.{0,36}\\b${source}\\b`).test(text)) return proposed === 'opponent' ? proposed : null;
    return null;
  };
  return {
    ...interpretation,
    objects: interpretation.objects.map((item) => ({ ...item, controller: actorFor(item.nameText, item.controller) })),
    actions: interpretation.actions.map((item) => ({
      ...item,
      actor: actorFor(item.sourceText, item.actor),
      targetText: item.targetText && text.includes(textKey(item.targetText)) ? item.targetText : null
    })),
    stack: interpretation.stack.map((item) => ({
      ...item,
      controller: actorFor(item.sourceText, item.controller),
      targetText: item.targetText && text.includes(textKey(item.targetText)) ? item.targetText : null
    }))
  };
}

function normalizeStackOrder(message, interpretation) {
  if (interpretation.stack.length < 2) return interpretation.stack;
  const text = textKey(message);
  let ordered = interpretation.stack.slice().sort((left, right) => left.position - right.position);
  const pointsTowardEarlierPosition = ordered.filter((item) => item.responseToPosition !== null).length > 0
    && ordered.filter((item) => item.responseToPosition !== null).every((item) => item.responseToPosition < item.position);
  const chronological = /\b(?:then|responds?|in response)\b/.test(text)
    && interpretation.actions.filter((item) => item.sourceText).length === interpretation.stack.length;
  if (pointsTowardEarlierPosition) ordered.reverse();
  else if (chronological) {
    const bySource = new Map(ordered.map((item) => [textKey(item.sourceText), item]));
    const actionOrder = interpretation.actions.filter((item) => item.sourceText).sort((a, b) => b.sequence - a.sequence);
    const fromActions = actionOrder.map((action) => bySource.get(textKey(action.sourceText))).filter(Boolean);
    if (fromActions.length === ordered.length) ordered = fromActions;
  } else if (/\bbottom to top\b/.test(text)) ordered.reverse();
  return ordered.map((item, index) => ({
    ...item,
    position: index + 1,
    responseToPosition: index + 1 < ordered.length ? index + 2 : null
  }));
}

function normalizeNameTexts(interpretation) {
  const clean = (value) => value == null ? value : stripConversationalPunctuation(value);
  return {
    ...interpretation,
    objects: interpretation.objects.map((item) => ({ ...item, nameText: clean(item.nameText) })),
    actions: interpretation.actions.map((item) => ({ ...item, sourceText: clean(item.sourceText), targetText: clean(item.targetText) })),
    stack: interpretation.stack.map((item) => ({ ...item, sourceText: clean(item.sourceText), targetText: clean(item.targetText) })),
    combat: {
      attackers: interpretation.combat.attackers.map((item) => ({ ...item, attackerText: clean(item.attackerText) })),
      blockers: interpretation.combat.blockers.map((item) => ({ ...item, blockerText: clean(item.blockerText), blockedAttackerText: clean(item.blockedAttackerText) }))
    }
  };
}

export function normalizeMagicInterpretation({ message = '', interpretation }) {
  let normalized = normalizeNameTexts({ ...interpretation, facts: { ...interpretation.facts } });
  const temporal = temporalFacts(message);
  normalized = withFact(normalized, 'turn', explicitTurn(message));
  normalized = withFact(normalized, 'priorityHolder', explicitPriority(message));
  normalized = withFact(normalized, 'stackEmpty', explicitStackState(message, interpretation.interpretationType));
  normalized = withFact(normalized, 'phase', temporal.phase);
  normalized = withFact(normalized, 'step', temporal.step);

  normalized = normalizeControllers(message, normalized);
  if (normalized.interpretationType === 'question') normalized = { ...normalized, stack: [] };
  normalized = { ...normalized, stack: normalizeStackOrder(message, normalized) };
  normalized = { ...normalized, ambiguities: normalizeAmbiguities(message, normalized) };
  if (normalized.confidence === 'low' && normalized.ambiguities.length === 0
    && (hasConcreteRelationship(normalized) || Object.values(normalized.facts).some((value) => value !== null))) {
    normalized = { ...normalized, confidence: 'medium' };
  }

  const field = correctionField(message);
  if (field) {
    normalized = {
      ...normalized,
      interpretationType: 'correction',
      correction: {
        field,
        previousValueText: interpretation.correction?.previousValueText || null,
        proposedValueText: correctionValue(message, field, interpretation.correction?.proposedValueText || null)
      }
    };
  }
  if (field === 'stack' && /\bisn't on (?:the )?stack\b/.test(textKey(message))) {
    const nameText = String(message).match(/(?:scratch that,?\s*)?(.+?)\s+isn't on (?:the )?stack/i)?.[1]?.trim();
    if (nameText && !normalized.objects.some((item) => textKey(item.nameText) === textKey(nameText))) {
      normalized = { ...normalized, objects: [...normalized.objects, { localId: 'correction-source', nameText, controller: null, role: 'corrected-stack-item' }] };
    }
  }
  const strippedFields = Object.keys(interpretation.facts).filter((field) => interpretation.facts[field] !== null && normalized.facts[field] === null);
  return { interpretation: normalized, combatWindow: temporal.window, strippedFields };
}

export function stripConversationalPunctuation(value) {
  return String(value || '').trim().replace(/[.,!?;:]+$/g, '').trim();
}
