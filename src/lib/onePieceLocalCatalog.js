import { getCatalogAssetUrl, hasExternalCatalogAssetBase } from '@/config/publicAssetUrls';
import { postLocalJsonIfAvailable } from '@/lib/catalogApi';

const cardsUrl = getCatalogAssetUrl('onepiece', 'cards.json');
const setsUrl = getCatalogAssetUrl('onepiece', 'sets.json');
const ONE_PIECE_IMAGE_VERSION = 'clean-20260408';

const cardsCache = { promise: null, value: null };
const setsCache = { promise: null, value: null };

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

function getLocalOnePieceImageUrl(card) {
  const sourceUrl = card?.image_url;
  if (!sourceUrl) return null;

  if (hasExternalCatalogAssetBase) {
    return sourceUrl;
  }

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.png';
  } catch {}

  const cardId = String(card.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  return `${getCatalogAssetUrl('onepiece', `images/${prefix}/${encodeURIComponent(cardId)}${extension}`)}?v=${ONE_PIECE_IMAGE_VERSION}`;
}

async function loadCards() {
  if (cardsCache.value) return cardsCache.value;
  if (!cardsCache.promise) {
    cardsCache.promise = fetch(cardsUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load One Piece cards: ${response.status}`);
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
    setsCache.promise = fetch(setsUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load One Piece sets: ${response.status}`);
      const sets = await response.json();
      const byCode = new Map((sets || []).map((set) => [String(set.code || ''), set]));
      setsCache.value = byCode;
      return byCode;
    }).catch(() => {
      const empty = new Map();
      setsCache.value = empty;
      return empty;
    });
  }
  return setsCache.promise;
}

function getSetMeta(card, setsByCode) {
  const setCode = String(card?.set_code || String(card?.id || '').split('-')[0] || '');
  return setsByCode.get(setCode) || { code: setCode, name: setCode, pack_id: card?.pack_id || '' };
}

function formatOnePieceResult(card, setsByCode) {
  const setMeta = getSetMeta(card, setsByCode);
  return {
    id: card.id,
    api_id: card.id,
    name: card.name || '',
    set_name: setMeta?.name || '',
    set_code: setMeta?.code || 'OP',
    card_number: card.id || '',
    rarity: card.rarity || '',
    image_url: getLocalOnePieceImageUrl(card),
    fallback_image_url: card.image_url || null,
    price: null,
    type: card.category || '',
    game: 'onepiece',
    colors: Array.isArray(card.colors) ? card.colors : [],
    cost: card.cost ?? null,
    power: card.power ?? null
  };
}

function formatOnePieceDetail(card, setsByCode) {
  const setMeta = getSetMeta(card, setsByCode);
  return {
    id: card.id,
    api_id: card.id,
    name: card.name || '',
    category: card.category || '',
    colors: Array.isArray(card.colors) ? card.colors : [],
    cost: card.cost ?? null,
    power: card.power ?? null,
    counter: card.counter ?? null,
    rarity: card.rarity || '',
    types: Array.isArray(card.types) ? card.types : [],
    effect: card.effect || '',
    trigger: card.trigger || '',
    pack_id: card.pack_id || '',
    set_code: setMeta?.code || '',
    set_name: setMeta?.name || '',
    image_url: getLocalOnePieceImageUrl(card),
    fallback_image_url: card.image_url || null
  };
}

function scoreOnePieceCard(card, normalizedQuery) {
  const name = normalizeText(card.name || '');
  const effect = normalizeText(card.effect || '');
  if (name === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.includes(normalizedQuery)) return 350;
  if (effect.includes(normalizedQuery)) return 200;
  return 0;
}

function compareOnePieceCards(a, b) {
  const setCompare = String(a.set_code || '').localeCompare(String(b.set_code || ''));
  if (setCompare !== 0) return setCompare;
  return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true, sensitivity: 'base' });
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
  if (!matchesTextFilter(card.name || '', filters.name)) return false;
  if (!matchesTextFilter([card.effect, card.trigger].filter(Boolean).join(' '), filters.effect)) return false;
  if (Array.isArray(filters.colors) && filters.colors.length > 0) {
    const colors = Array.isArray(card.colors) ? card.colors : [];
    if (!filters.colors.every((color) => colors.includes(color))) return false;
  }
  if (filters.category && String(card.category || '') !== String(filters.category)) return false;
  if (filters.rarity && String(card.rarity || '') !== String(filters.rarity)) return false;
  if (filters.cost !== '' && !compareNumeric(card.cost, filters.costOp || '=', filters.cost)) return false;
  if (filters.power !== '' && !compareNumeric(card.power, filters.powerOp || '=', filters.power)) return false;
  return true;
}

export async function searchOnePieceCatalog(query, limit = 50) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/onepiece/search', { query, limit });
    if (Array.isArray(payload)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  return cards
    .map((card) => ({ card, score: scoreOnePieceCard(card, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareOnePieceCards(a.card, b.card);
    })
    .slice(0, limit)
    .map(({ card }) => formatOnePieceResult(card, setsByCode));
}

export async function searchOnePieceCatalogAdvanced(filters, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 250));
  const page = Math.max(0, options.page || 0);
  const hasFilters = Boolean(filters?.name || filters?.effect || filters?.colors?.length || filters?.category || filters?.rarity || filters?.cost || filters?.power);
  if (!hasFilters) return { results: [], total: 0, page, limit, hasMore: false };

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/onepiece/advanced-search', { filters, limit, page });
    if (Array.isArray(payload?.results)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const matched = cards.filter((card) => matchesAdvancedFilters(card, filters || {})).sort(compareOnePieceCards);
  const total = matched.length;
  const start = page * limit;
  const end = start + limit;
  return {
    results: matched.slice(start, end).map((card) => formatOnePieceResult(card, setsByCode)),
    total,
    page,
    limit,
    hasMore: end < total
  };
}

export async function getOnePieceCardById(cardId) {
  if (!cardId) return null;
  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const card = cards.find((entry) => String(entry?.id || '') === String(cardId));
  if (!card) return null;
  return formatOnePieceDetail(card, setsByCode);
}
