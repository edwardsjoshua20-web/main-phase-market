import { collectMagicConversationState } from '../magic/conversationState.js';
import { normalizeJudgeText } from '../instajudgeCore.js';
import { parseInstaJudgeInterpretation } from './interpretationContract.js';
import { normalizeMagicInterpretation, stripConversationalPunctuation } from './interpretationNormalizer.js';

const TURN = Object.freeze({ user: 'my turn', player: 'my turn', me: 'my turn', 'my turn': 'my turn', opponent: "opponent's turn", their: "opponent's turn", 'their turn': "opponent's turn", "opponent's turn": "opponent's turn" });
const PHASE = Object.freeze({
  'precombat-main': 'precombat main', 'precombat main': 'precombat main', combat: 'combat',
  'postcombat-main': 'postcombat main', 'postcombat main': 'postcombat main', beginning: 'beginning phase',
  upkeep: 'upkeep', draw: 'draw step', ending: 'end step', 'end step': 'end step'
});
const STEP = Object.freeze({
  untap: 'untap', upkeep: 'upkeep', draw: 'draw step',
  'beginning-of-combat': 'beginning of combat', 'beginning of combat': 'beginning of combat',
  'declare-attackers': 'declare attackers', 'declare attackers': 'declare attackers',
  'declare-blockers': 'declare blockers', 'declare blockers': 'declare blockers',
  'first-strike-combat-damage': 'first-strike combat damage', 'first strike damage': 'first-strike combat damage',
  'combat-damage': 'combat damage', 'combat damage': 'combat damage', 'end-of-combat': 'end of combat', 'end of combat': 'end of combat',
  'end-step': 'end step', 'end step': 'end step', cleanup: 'cleanup'
});
const PRIORITY = Object.freeze({ user: 'I have priority', player: 'I have priority', me: 'I have priority', opponent: 'opponent has priority', their: 'opponent has priority' });

function key(value) { return normalizeJudgeText(value).replace(/[^a-z0-9]+/g, ' ').trim(); }
function normalizeValue(map, value) { return value ? map[key(value)] || map[value] || null : null; }
function canonicalNameKey(value) { return normalizeJudgeText(value).replace(/[^a-z0-9]+/g, ''); }
function cardIdentity(card = {}) { return String(card.oracle_id || card.card_id || card.api_id || card.id || card.name || '').trim(); }

function normalizeCard(card, requestedName) {
  return {
    id: String(card.id || card.searchIdentity || card.name || '').trim(),
    name: String(card.name || requestedName).trim(), game: card.game || 'magic',
    typeLine: String(card.type_line || card.typeLine || card.type || card.raw?.type_line || '').trim(),
    oracleText: String(card.oracle_text || card.oracleText || card.rules_text || card.text || card.raw?.oracle_text || '').trim(),
    manaCost: String(card.mana_cost || card.manaCost || card.raw?.mana_cost || '').trim(),
    power: card.power ?? card.raw?.power ?? null, toughness: card.toughness ?? card.raw?.toughness ?? null,
    oracle_id: String(card.oracle_id || card.raw?.oracle_id || '').trim(), raw: card
  };
}

async function resolveCardReference(searchOwner, nameText) {
  const cleanName = stripConversationalPunctuation(nameText);
  const results = await searchOwner.searchPreviewByGame(cleanName, 'magic', 8, { includeInventory: false });
  const wanted = canonicalNameKey(cleanName);
  const exact = results.find((result) => canonicalNameKey(result?.name) === wanted);
  if (exact) return { card: normalizeCard(exact, cleanName), candidates: [] };
  const candidates = wanted.length >= 4
    ? results.filter((result) => String(result?.name || '').split(/\s+/).some((word) => canonicalNameKey(word).startsWith(wanted))).map((result) => normalizeCard(result, cleanName))
    : [];
  return { card: null, candidates };
}

function mentionedNames(interpretation) {
  const relational = new Set(['user', 'player', 'me', 'my', 'you', 'your', 'opponent', 'their', 'they', 'defending player', 'active player']);
  return [...new Set([
    ...interpretation.objects.map((item) => item.nameText),
    ...interpretation.actions.flatMap((item) => [item.sourceText, item.actionType === 'attack' ? null : item.targetText]),
    ...interpretation.stack.flatMap((item) => [item.sourceText, item.targetText]),
    ...interpretation.combat.attackers.map((item) => item.attackerText),
    ...interpretation.combat.blockers.flatMap((item) => [item.blockerText, item.blockedAttackerText])
  ].filter((value) => value && !relational.has(key(value))))];
}

function controllerPrefix(value, fallback) {
  const normalized = key(value);
  if (['opponent', 'their', 'they'].includes(normalized)) return "opponent's";
  if (['user', 'player', 'me', 'my', 'you', 'your'].includes(normalized)) return 'my';
  return fallback;
}

function canonicalController(value) {
  const normalized = key(value);
  if (['opponent', 'their', 'they'].includes(normalized)) return 'opponent';
  if (['user', 'player', 'me', 'my', 'you', 'your'].includes(normalized)) return 'player';
  return null;
}

function uniquelyMatchingStateObject(state, value) {
  const wanted = canonicalNameKey(value);
  if (!wanted) return null;
  const matches = (state.battlefield || []).filter((object) => {
    const name = canonicalNameKey(object.name);
    return name === wanted || name.endsWith(wanted) || String(object.name || '').split(/\s+/).some((word) => canonicalNameKey(word) === wanted);
  });
  return matches.length === 1 ? matches[0] : null;
}

function correctionCommand(correction, state) {
  if (!correction?.field || !correction.proposedValueText) return null;
  const field = key(correction.field);
  const value = key(correction.proposedValueText);
  if (field.includes('stack')) {
    if (['empty', 'nothing', 'stack empty'].includes(value)) return { field: 'stack', message: 'stack is empty', label: 'the stack to empty' };
    if (value && !['not empty', 'nonempty'].includes(value)) return { field: 'stack', message: `${correction.proposedValueText} is on the stack`, label: `the stack to ${correction.proposedValueText}` };
  }
  if (field.includes('turn')) {
    const message = normalizeValue(TURN, correction.proposedValueText);
    if (message) return { field: 'turn', message, label: `the turn to ${correction.proposedValueText}` };
  }
  if (field.includes('phase')) {
    const message = normalizeValue(PHASE, correction.proposedValueText);
    if (message) return { field: 'phase', message, label: `the phase to ${correction.proposedValueText}` };
  }
  if (field.includes('step')) {
    const message = normalizeValue(STEP, correction.proposedValueText);
    if (message) return { field: 'step', message, label: `the step to ${correction.proposedValueText}` };
  }
  if (field.includes('priority')) {
    const message = normalizeValue(PRIORITY, correction.proposedValueText);
    if (message) return { field: 'priority', message, label: `priority to ${correction.proposedValueText}` };
  }
  if (field.includes('target')) {
    const targetObject = uniquelyMatchingStateObject(state, correction.proposedValueText);
    return {
      field: 'target',
      previousTarget: correction.previousValueText,
      targetName: targetObject?.name || correction.proposedValueText,
      label: `the target to ${targetObject?.name || correction.proposedValueText}`
    };
  }
  return null;
}

function coherentStack(stack) {
  const positions = stack.map((item) => item.position).sort((left, right) => left - right);
  if (positions.some((position, index) => position !== index + 1)) return false;
  return stack.every((item) => item.sourceText.trim() && (item.responseToPosition === null || positions.includes(item.responseToPosition)));
}

function coherentCombat(combat) {
  const attackers = new Set(combat.attackers.map((item) => key(item.attackerText)));
  return combat.blockers.every((item) => attackers.has(key(item.blockedAttackerText)));
}

function correctionFieldExists(state, correction) {
  if (!correction) return false;
  if (correction.field === 'stack') return state.stack?.known === true;
  if (correction.field === 'turn') return Boolean(state.activePlayer);
  if (correction.field === 'phase') return Boolean(state.phase);
  if (correction.field === 'step') return Boolean(state.step);
  if (correction.field === 'priority') return state.priorityKnown === true;
  if (correction.field === 'target') return state.stack?.items?.some((item) => item.targets?.length > 0);
  return false;
}

export async function validateAndAdaptMagicInterpretation({ rawInterpretation, state, searchOwner, message = '' }) {
  const parsed = parseInstaJudgeInterpretation(rawInterpretation);
  const { interpretation, combatWindow, strippedFields } = normalizeMagicInterpretation({ message, interpretation: parsed });
  const unresolved = [];
  const candidateCards = {};
  const cards = [];
  for (const nameText of mentionedNames(interpretation)) {
    const { card, candidates } = await resolveCardReference(searchOwner, nameText);
    if (!card) {
      const cleanName = stripConversationalPunctuation(nameText);
      unresolved.push(cleanName);
      if (candidates.length > 0) candidateCards[cleanName] = candidates;
    }
    else if (!cards.some((candidate) => cardIdentity(candidate) === cardIdentity(card))) cards.push(card);
  }

  const invalidFacts = [];
  for (const [field, map] of [['turn', TURN], ['phase', PHASE], ['step', STEP], ['priorityHolder', PRIORITY]]) {
    if (interpretation.facts[field] && !normalizeValue(map, interpretation.facts[field])) invalidFacts.push(field);
  }
  if (!coherentStack(interpretation.stack)) invalidFacts.push('stack');
  if (!coherentCombat(interpretation.combat)) invalidFacts.push('combat');
  const requiresClarification = unresolved.length > 0
    || invalidFacts.length > 0
    || interpretation.ambiguities.length > 0
    || interpretation.confidence === 'low';
  const correction = interpretation.interpretationType === 'correction' && !requiresClarification ? correctionCommand(interpretation.correction, state) : null;
  const validCorrection = correctionFieldExists(state, correction) ? correction : null;
  if (validCorrection) return { interpretation, state, cards, candidateCards, unresolved, invalidFacts, strippedFields, requiresClarification, correction: validCorrection, safeToApply: false, applied: false };
  if (interpretation.interpretationType === 'correction' && !validCorrection) invalidFacts.push('correction');

  let nextState = state;
  const facts = [
    normalizeValue(TURN, interpretation.facts.turn), normalizeValue(PHASE, interpretation.facts.phase),
    normalizeValue(STEP, interpretation.facts.step), normalizeValue(PRIORITY, interpretation.facts.priorityHolder),
    interpretation.facts.stackEmpty === true ? 'stack is empty' : interpretation.facts.stackEmpty === false ? 'stack is not empty' : null
  ].filter(Boolean);
  if (facts.length > 0) nextState = collectMagicConversationState(nextState, facts.join(', '), []);

  if (interpretation.stack.length > 0 && unresolved.length === 0) {
    const orderedStack = interpretation.stack.slice().sort((left, right) => left.position - right.position);
    const stackText = orderedStack
      .map((item) => `${item.sourceText}${item.targetText ? ` targeting ${item.targetText}` : ''}`)
      .join(', below ');
    nextState = collectMagicConversationState(nextState, `top ${stackText} bottom; stack is not empty`, cards, 'stack-items');
    nextState = {
      ...nextState,
      stack: {
        ...nextState.stack,
        items: nextState.stack.items.map((item, index) => ({ ...item, controller: canonicalController(orderedStack[index]?.controller) }))
      }
    };
  }

  if (interpretation.combat.attackers.length > 0 && unresolved.length === 0) {
    const messages = interpretation.combat.attackers.map((attacker) => {
      const object = interpretation.objects.find((item) => key(item.nameText) === key(attacker.attackerText));
      return `${controllerPrefix(object?.controller, 'my')} ${attacker.attackerText}`;
    });
    const attackerNames = new Set(interpretation.combat.attackers.map((item) => key(item.attackerText)));
    nextState = collectMagicConversationState(nextState, messages.join(' and '), cards.filter((candidate) => attackerNames.has(key(candidate.name))), 'combat-attackers');
  }
  if (interpretation.combat.blockers.length > 0 && unresolved.length === 0) {
    const messages = interpretation.combat.blockers.map((blocker) => {
      const object = interpretation.objects.find((item) => key(item.nameText) === key(blocker.blockerText));
      return `${controllerPrefix(object?.controller, "opponent's")} ${blocker.blockerText}`;
    });
    const blockerNames = new Set(interpretation.combat.blockers.map((item) => key(item.blockerText)));
    nextState = collectMagicConversationState(nextState, messages.join(' and '), cards.filter((candidate) => blockerNames.has(key(candidate.name))), 'combat-blockers');
  }

  if (combatWindow && nextState.combat?.active) nextState = { ...nextState, combat: { ...nextState.combat, window: combatWindow } };

  const safeToApply = !requiresClarification && invalidFacts.length === 0 && interpretation.interpretationType !== 'correction';
  return { interpretation, state: nextState, cards, candidateCards, unresolved, invalidFacts, strippedFields, requiresClarification: requiresClarification || invalidFacts.length > 0, correction: null, safeToApply, applied: nextState !== state && safeToApply };
}

export function applyConfirmedMagicCorrection(state, proposed, cards = []) {
  if (proposed?.field === 'target') {
    const previousTarget = key(proposed.previousTarget);
    const targetName = String(proposed.targetName || '').trim();
    if (!targetName) return state;
    const targetObject = state.battlefield.find((object) => key(object.name) === key(targetName));
    const matchingItems = state.stack.items.filter((item) => (item.targets || []).some((target) => !previousTarget || key(target.descriptor) === previousTarget));
    if (matchingItems.length !== 1) return state;
    const matchingId = matchingItems[0].id;
    return {
      ...state,
      cards: [...state.cards, ...cards].filter((card, index, all) => all.findIndex((candidate) => cardIdentity(candidate) === cardIdentity(card)) === index),
      stack: {
        ...state.stack,
        items: state.stack.items.map((item) => item.id === matchingId ? {
          ...item,
          targets: [{ type: 'TargetChoice', descriptor: targetObject?.name || targetName, objectId: targetObject?.id || null }]
        } : item)
      }
    };
  }
  if (!proposed?.message) return state;
  const pendingKey = proposed.message.includes('on the stack') ? 'stack-items' : null;
  const corrected = collectMagicConversationState(state, proposed.message, cards, pendingKey);
  if (!['turn', 'phase', 'step'].includes(proposed.field) || !state.combat?.active) return corrected;
  return {
    ...corrected,
    battlefield: corrected.battlefield.filter((object) => !object.roles?.some((role) => ['attacker', 'blocker'].includes(role))),
    combat: {
      ...corrected.combat,
      attackingPlayer: corrected.activePlayer,
      defendingPlayer: corrected.activePlayer === 'player' ? 'opponent' : 'player',
      attackersKnown: false,
      blockersKnown: false,
      identityAmbiguity: null,
      attackers: [],
      blocks: []
    }
  };
}
