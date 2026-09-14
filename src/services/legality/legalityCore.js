import { canonicalGame } from '../search/searchCore.js';

export const LEGALITY_STATUSES = Object.freeze([
  'legal',
  'banned',
  'restricted',
  'limited',
  'semi_limited',
  'suspended',
  'rotated',
  'not_legal',
  'unknown'
]);

const STATUS_SET = new Set(LEGALITY_STATUSES);

const FORMAT_ALIASES = {
  standard: 'standard',
  pioneer: 'pioneer',
  modern: 'modern',
  legacy: 'legacy',
  vintage: 'vintage',
  pauper: 'pauper',
  commander: 'commander',
  edh: 'commander',
  expanded: 'expanded',
  unlimited: 'unlimited',
  advanced: 'advanced_tcg',
  advanced_tcg: 'advanced_tcg',
  tcg_advanced: 'advanced_tcg',
  tcg: 'advanced_tcg',
  classic_constructed: 'classic_constructed',
  cc: 'classic_constructed',
  blitz: 'blitz',
  commoner: 'commoner',
  living_legend: 'living_legend',
  ll: 'living_legend',
  upf: 'upf',
  silver_age: 'silver_age',
  core_constructed: 'core_constructed',
  infinity_constructed: 'infinity_constructed',
  constructed: 'constructed',
  premier: 'premier',
  twin_suns: 'twin_suns',
  trilogy: 'trilogy',
  limited: 'limited'
};

export function normalizeLegalityGame(value) {
  const game = canonicalGame(value);
  return game === 'fab' ? 'flesh_and_blood' : game;
}

export function normalizeLegalityFormat(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\s-]+/g, '_');
  return FORMAT_ALIASES[key] || key;
}

export function normalizeLegalityStatus(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const aliases = {
    legal: 'legal',
    unlimited: 'legal',
    forbidden: 'banned',
    banned: 'banned',
    restricted: 'restricted',
    limited: 'limited',
    semi_limited: 'semi_limited',
    semilimited: 'semi_limited',
    suspended: 'suspended',
    rotated: 'rotated',
    not_legal: 'not_legal',
    illegal: 'not_legal',
    unknown: 'unknown'
  };
  return aliases[key] && STATUS_SET.has(aliases[key]) ? aliases[key] : 'unknown';
}

export function resolveCanonicalCardId(card = {}, input = {}) {
  return String(
    input.canonicalCardId
    || input.cardId
    || card.oracle_id
    || card.card_id
    || card.api_id
    || card.id
    || card.unique_id
    || card.uuid
    || ''
  ).trim();
}

export function resolvePrintingId(card = {}, input = {}) {
  return String(
    input.printingId
    || card.printing_id
    || card.id
    || card.api_id
    || card.unique_id
    || card.uuid
    || ''
  ).trim() || null;
}

export function createLegalityResult(input = {}, overrides = {}) {
  const game = normalizeLegalityGame(input.game || overrides.game);
  const format = normalizeLegalityFormat(input.format || overrides.format);
  const card = overrides.card || {};
  const status = normalizeLegalityStatus(overrides.status);
  const printingId = resolvePrintingId(card, input);
  return {
    game,
    canonicalCardId: resolveCanonicalCardId(card, input),
    ...(printingId ? { printingId } : {}),
    format,
    status,
    ...(Number.isFinite(overrides.restrictionLimit) ? { restrictionLimit: overrides.restrictionLimit } : {}),
    ...(overrides.effectiveDate ? { effectiveDate: overrides.effectiveDate } : {}),
    source: overrides.source || null,
    sourceVersion: overrides.sourceVersion || null,
    lastVerified: overrides.lastVerified || null,
    ...(overrides.region ? { region: overrides.region } : {}),
    ...(overrides.reason ? { reason: overrides.reason } : {})
  };
}

export function unknownLegality(input = {}, card = {}, metadata = {}, reason = 'No authoritative legality data is available for this game/format.') {
  return createLegalityResult(input, {
    card,
    status: 'unknown',
    source: metadata.source || null,
    sourceVersion: metadata.sourceVersion || null,
    lastVerified: metadata.lastVerified || null,
    effectiveDate: metadata.effectiveDate || null,
    region: metadata.region || null,
    reason
  });
}
