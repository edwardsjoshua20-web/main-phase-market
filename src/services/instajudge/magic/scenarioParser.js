import { isInstant, isPermanentType, isSorcery, normalizeMagicCard, normalizeMagicText } from './magicCards.js';

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMentions(message, cards) {
  const normalized = normalizeMagicText(message);
  return cards
    .map((card) => {
      const index = normalized.indexOf(card.normalizedName);
      return index >= 0 ? { card, index } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);
}

function inferController(message, card, index) {
  const before = normalizeMagicText(message).slice(Math.max(0, index - 80), index);
  const opponentAction = Math.max(before.lastIndexOf('opponent casts'), before.lastIndexOf('opponent cast'), before.lastIndexOf('opponent activates'), before.lastIndexOf('opponent controls'));
  const playerAction = Math.max(
    before.lastIndexOf('player casts'),
    before.lastIndexOf('player cast'),
    before.lastIndexOf('player responds'),
    before.lastIndexOf('you cast'),
    before.lastIndexOf('i cast'),
    before.lastIndexOf('you respond'),
    before.lastIndexOf('i respond')
  );
  if (playerAction >= 0 || opponentAction >= 0) return playerAction > opponentAction ? 'player' : 'opponent';
  if (/\brespond|responds|response\b/.test(before)) return 'player';
  if (/\bopponent\b/.test(before) && !/\byou\b|\bi\b/.test(before)) return 'opponent';
  if (/you control|i control|player controls/.test(normalizeMagicText(message)) && isPermanentType(card)) return 'player';
  return 'player';
}

function inferTarget(message, source, cards, sourceIndex) {
  const normalized = normalizeMagicText(message);
  const afterSource = normalized.slice(sourceIndex, Math.min(normalized.length, sourceIndex + 220));

  for (const card of cards) {
    if (card.name === source.name) continue;
    const targetPattern = new RegExp(`\\b(target|targeting|targets)\\s+(?:the\\s+)?${escapeRegExp(card.normalizedName)}\\b`);
    if (targetPattern.test(afterSource)) return [card];
  }

  if (/\btarget spell\b/.test(source.normalizedText)) {
    const priorSpell = cards.find((card) => card.name !== source.name && (isInstant(card) || isSorcery(card) || !isPermanentType(card)));
    return priorSpell ? [priorSpell] : [];
  }

  if (/\btarget creature\b/.test(source.normalizedText)) {
    const creature = cards.find((card) => card.name !== source.name && /\bcreature\b/.test(card.normalizedType));
    return creature ? [creature] : [];
  }

  if (/\bany target\b|\btarget permanent\b/.test(source.normalizedText)) {
    const other = cards.find((card) => card.name !== source.name);
    return other ? [other] : [];
  }

  return [];
}

function isStackCandidate(card, message) {
  if (isInstant(card) || isSorcery(card)) return true;
  if (/\btarget\b|\bdestroy\b|\bdeals\b|\bcounter target spell\b/.test(card.normalizedText)) return true;
  const text = normalizeMagicText(message);
  const scopedAction = new RegExp(`\\b(cast|casts|activate|activates|respond|responds)\\s+(?:with\\s+)?${escapeRegExp(card.normalizedName)}\\b`);
  return scopedAction.test(text);
}

function relationToResponse(message, mentionIndex) {
  const before = normalizeMagicText(message).slice(Math.max(0, mentionIndex - 120), mentionIndex);
  if (/\brespond|responds|in response|response with\b/.test(before)) return 'response';
  return 'primary';
}

export function parseMagicScenario({ message = '', cards = [] } = {}) {
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const mentions = findMentions(message, normalizedCards);
  const stackObjects = [];

  for (const mention of mentions) {
    if (!isStackCandidate(mention.card, message)) continue;
    if (stackObjects.some((object) => object.card.name === mention.card.name)) continue;
    stackObjects.push({
      id: `${mention.card.name}:${mention.index}`,
      card: mention.card,
      controller: inferController(message, mention.card, mention.index),
      relation: relationToResponse(message, mention.index),
      targets: inferTarget(message, mention.card, normalizedCards, mention.index),
      modes: [],
      choices: {},
      index: mention.index
    });
  }

  stackObjects.sort((left, right) => left.index - right.index);

  const permanentCards = normalizedCards.filter((card) =>
    !stackObjects.some((object) => object.card.name === card.name)
    || new RegExp(`\\b(control|controls|battlefield|in play)\\b.*\\b${escapeRegExp(card.normalizedName)}\\b|\\b${escapeRegExp(card.normalizedName)}\\b.*\\b(control|controls|battlefield|in play)\\b`).test(normalizeMagicText(message))
  );

  return {
    message,
    normalizedText: normalizeMagicText(message),
    cards: normalizedCards,
    mentions,
    stackObjects,
    permanentCards,
    missing: []
  };
}
