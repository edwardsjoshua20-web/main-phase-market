const ANY_NUMBER_CARD_NAMES = new Set([
  'dragons approach',
  'hare apparent',
  'persistent petitioners',
  'rat colony',
  'relentless rats',
  'shadowborn apostle',
  'slime against humanity',
  'templar knight',
]);

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/['’]/g, '');
}

function normalizeGame(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function getTypeLine(card) {
  return String(card?.type_line || card?.type || card?.product_type || '').toLowerCase();
}

export function allowsAnyNumberOfCopies(card) {
  const oracleText = String(card?.oracle_text || '').toLowerCase();
  return ANY_NUMBER_CARD_NAMES.has(normalizeName(card?.product_name || card?.name))
    || oracleText.includes('a deck can have any number of cards named');
}

export function getEffectiveDeckCopyLimit(card, { game, formatConfig } = {}) {
  if (allowsAnyNumberOfCopies(card)) return Infinity;

  const normalizedGame = normalizeGame(game || card?.game || card?.product_type);
  const typeLine = getTypeLine(card);

  if (normalizedGame === 'magic' && typeLine.includes('basic') && typeLine.includes('land')) return Infinity;
  if (normalizedGame === 'pokemon' && typeLine.includes('basic energy')) return Infinity;
  if (normalizedGame === 'onepiece' && (typeLine.includes('leader') || typeLine.includes('don'))) return Infinity;
  if (normalizedGame === 'flesh_and_blood' && (typeLine.includes('hero') || typeLine.includes('weapon') || typeLine.includes('equipment'))) return Infinity;
  if (normalizedGame === 'starwars' && (typeLine.includes('leader') || typeLine.includes('base'))) return Infinity;

  return Number.isFinite(formatConfig?.maxCopies) ? formatConfig.maxCopies : Infinity;
}
