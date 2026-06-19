import { getCatalogAssetUrl, hasExternalCatalogAssetBase } from '@/config/publicAssetUrls';
import { postLocalJsonIfAvailable } from '@/lib/catalogApi';

const cardsUrl = getCatalogAssetUrl('fab', 'cards.json');
const setsUrl = getCatalogAssetUrl('fab', 'sets.json');

const cardsCache = { promise: null, value: null };
const setsCache = { promise: null, value: null };

const FAB_RARITY_MAP = {
  C: 'Common',
  R: 'Rare',
  S: 'Super Rare',
  M: 'Majestic',
  L: 'Legendary',
  F: 'Fabled',
  P: 'Promo',
  T: 'Token'
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pathExtension(pathname) {
  const match = String(pathname || '').match(/(\.[a-z0-9]+)$/i);
  return match ? match[1] : '';
}

function getPrimaryPrinting(card) {
  return Array.isArray(card?.printings) ? card.printings.find((printing) => printing?.image_url) || card.printings[0] : null;
}

function getFabRarityLabel(rarityCode) {
  return FAB_RARITY_MAP[String(rarityCode || '').toUpperCase()] || String(rarityCode || '');
}

function getLocalFabImageUrl(card) {
  const primaryPrinting = getPrimaryPrinting(card);
  const sourceUrl = primaryPrinting?.image_url;
  if (!sourceUrl) return null;

  if (hasExternalCatalogAssetBase) {
    return sourceUrl;
  }

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.png';
  } catch {}

  const cardId = String(card?.unique_id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  return getCatalogAssetUrl('fab', `images/${prefix}/${encodeURIComponent(cardId)}${extension}`);
}

async function loadCards() {
  if (cardsCache.value) return cardsCache.value;
  if (!cardsCache.promise) {
    cardsCache.promise = fetch(cardsUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load FAB cards: ${response.status}`);
      const cards = await response.json();
      cardsCache.value = cards;
      return cards;
    });
  }
  return cardsCache.promise;
}

async function loadSets() {
  if (setsCache.value) return setsCache.value;
  if (!setsCache.promise) {
    setsCache.promise = fetch(setsUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load FAB sets: ${response.status}`);
        const sets = await response.json();
        const byCode = new Map((sets || []).map((set) => [String(set.code || ''), set]));
        setsCache.value = byCode;
        return byCode;
      })
      .catch(() => {
        const empty = new Map();
        setsCache.value = empty;
        return empty;
      });
  }
  return setsCache.promise;
}

function getSetMeta(card, setsByCode) {
  const primaryPrinting = getPrimaryPrinting(card);
  const setCode = String(primaryPrinting?.set_id || '');
  return setsByCode.get(setCode) || { code: setCode, name: setCode };
}

function formatFabResult(card, setsByCode) {
  const primaryPrinting = getPrimaryPrinting(card);
  const setMeta = getSetMeta(card, setsByCode);
  return {
    id: card.unique_id,
    api_id: card.unique_id,
    name: card.name || '',
    set_name: setMeta?.name || '',
    set_code: setMeta?.code || primaryPrinting?.set_id || 'FAB',
    card_number: primaryPrinting?.id || card.unique_id || '',
    rarity: getFabRarityLabel(primaryPrinting?.rarity),
    image_url: getLocalFabImageUrl(card),
    price: null,
    type: card.type_text || (Array.isArray(card.types) ? card.types.join(' • ') : ''),
    game: 'flesh_and_blood',
    color: card.color || '',
    pitch: card.pitch || '',
    cost: card.cost ?? null,
    power: card.power ?? null,
    defense: card.defense ?? null
  };
}

function formatFabDetail(card, setsByCode) {
  const primaryPrinting = getPrimaryPrinting(card);
  const setMeta = getSetMeta(card, setsByCode);
  return {
    id: card.unique_id,
    api_id: card.unique_id,
    name: card.name || '',
    color: card.color || '',
    pitch: card.pitch || '',
    cost: card.cost || '',
    power: card.power || '',
    defense: card.defense || '',
    health: card.health || '',
    intelligence: card.intelligence || '',
    arcane: card.arcane || '',
    types: Array.isArray(card.types) ? card.types : [],
    traits: Array.isArray(card.traits) ? card.traits : [],
    keywords: Array.isArray(card.card_keywords) ? card.card_keywords : [],
    functional_text: card.functional_text_plain || card.functional_text || '',
    type_text: card.type_text || '',
    rarity: getFabRarityLabel(primaryPrinting?.rarity),
    artist: Array.isArray(primaryPrinting?.artists) ? primaryPrinting.artists.join(', ') : '',
    set_code: setMeta?.code || primaryPrinting?.set_id || '',
    set_name: setMeta?.name || '',
    card_number: primaryPrinting?.id || '',
    released_at: setMeta?.released_at || null,
    image_url: getLocalFabImageUrl(card),
    blitz_legal: Boolean(card.blitz_legal),
    cc_legal: Boolean(card.cc_legal),
    commoner_legal: Boolean(card.commoner_legal),
    ll_legal: Boolean(card.ll_legal)
  };
}

function scoreFabCard(card, normalizedQuery) {
  const name = normalizeText(card.name || '');
  const typeText = normalizeText(card.type_text || '');
  const rulesText = normalizeText(card.functional_text_plain || card.functional_text || '');
  if (name === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.includes(normalizedQuery)) return 350;
  if (typeText.includes(normalizedQuery)) return 220;
  if (rulesText.includes(normalizedQuery)) return 180;
  return 0;
}

function compareFabCards(a, b) {
  const aPrinting = getPrimaryPrinting(a);
  const bPrinting = getPrimaryPrinting(b);
  const setCompare = String(aPrinting?.set_id || '').localeCompare(String(bPrinting?.set_id || ''));
  if (setCompare !== 0) return setCompare;
  return String(aPrinting?.id || a.unique_id || '').localeCompare(String(bPrinting?.id || b.unique_id || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function matchesTextFilter(value, query) {
  if (!query) return true;
  return normalizeText(value).includes(normalizeText(query));
}

function compareNumeric(actualValue, op, expectedValue) {
  const actual = Number(actualValue);
  const expected = Number(expectedValue);
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  if (op === '=') return actual === expected;
  if (op === '>=') return actual >= expected;
  if (op === '<=') return actual <= expected;
  if (op === '>') return actual > expected;
  if (op === '<') return actual < expected;
  return false;
}

function matchesAdvancedFilters(card, filters = {}) {
  const primaryPrinting = getPrimaryPrinting(card);
  if (!matchesTextFilter(card.name || '', filters.name)) return false;
  if (!matchesTextFilter(card.functional_text_plain || card.functional_text || '', filters.text)) return false;
  if (Array.isArray(filters.colors) && filters.colors.length > 0 && !filters.colors.includes(card.color)) return false;
  if (filters.type) {
    const types = Array.isArray(card.types) ? card.types : [];
    const typeText = String(card.type_text || '');
    if (!types.includes(filters.type) && !typeText.includes(filters.type)) return false;
  }
  if (Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    const keywords = Array.isArray(card.card_keywords) ? card.card_keywords : [];
    if (!filters.keywords.every((keyword) => keywords.includes(keyword))) return false;
  }
  if (filters.rarity && getFabRarityLabel(primaryPrinting?.rarity) !== filters.rarity) return false;
  if (filters.cost !== '' && !compareNumeric(card.cost, filters.costOp || '=', filters.cost)) return false;
  if (filters.power !== '' && !compareNumeric(card.power, filters.powerOp || '=', filters.power)) return false;
  if (filters.defense !== '' && !compareNumeric(card.defense, filters.defenseOp || '=', filters.defense)) return false;
  return true;
}

export async function searchFabCatalog(query, limit = 50) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/fab/search', { query, limit });
    if (Array.isArray(payload)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  return cards
    .map((card) => ({ card, score: scoreFabCard(card, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareFabCards(a.card, b.card);
    })
    .slice(0, limit)
    .map(({ card }) => formatFabResult(card, setsByCode));
}

export async function searchFabCatalogAdvanced(filters, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 250));
  const page = Math.max(0, options.page || 0);
  const hasFilters = Boolean(
    filters?.name || filters?.text || filters?.colors?.length || filters?.type ||
    filters?.keywords?.length || filters?.rarity || filters?.cost || filters?.power || filters?.defense
  );

  if (!hasFilters) {
    return { results: [], total: 0, page, limit, hasMore: false };
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/fab/advanced-search', { filters, limit, page });
    if (Array.isArray(payload?.results)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const matched = cards.filter((card) => matchesAdvancedFilters(card, filters || {})).sort(compareFabCards);
  const total = matched.length;
  const start = page * limit;
  const end = start + limit;

  return {
    results: matched.slice(start, end).map((card) => formatFabResult(card, setsByCode)),
    total,
    page,
    limit,
    hasMore: end < total
  };
}

export async function getFabCardById(cardId) {
  if (!cardId) return null;
  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const card = cards.find((entry) => String(entry?.unique_id || '') === String(cardId));
  if (!card) return null;
  return formatFabDetail(card, setsByCode);
}
