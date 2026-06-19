import { getCatalogAssetUrl, hasExternalCatalogAssetBase } from '@/config/publicAssetUrls';
import { postLocalJsonIfAvailable } from '@/lib/catalogApi';

const cardsUrl = getCatalogAssetUrl('lorcana', 'cards.json');
const setsUrl = getCatalogAssetUrl('lorcana', 'sets.json');

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

function getLocalLorcanaImageUrl(card, kind = 'large') {
  const sourceUrl = kind === 'normal'
    ? card?.image_uris?.digital?.normal
    : card?.image_uris?.digital?.large || card?.image_uris?.digital?.normal;
  if (!sourceUrl) return null;

  if (hasExternalCatalogAssetBase) {
    return sourceUrl;
  }

  let extension = '.avif';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.avif';
  } catch {}

  const cardId = String(card.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  const folder = kind === 'normal' ? 'normal' : 'large';
  return getCatalogAssetUrl('lorcana', `images/${folder}/${prefix}/${encodeURIComponent(cardId)}${extension}`);
}

async function loadCards() {
  if (cardsCache.value) return cardsCache.value;
  if (!cardsCache.promise) {
    cardsCache.promise = fetch(cardsUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load Lorcana cards: ${response.status}`);
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
        if (!response.ok) throw new Error(`Failed to load Lorcana sets: ${response.status}`);
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
  return setsByCode.get(String(card?.set?.code || '')) || card?.set || null;
}

function formatLorcanaResult(card, setsByCode) {
  const setMeta = getSetMeta(card, setsByCode);
  const largeImage = getLocalLorcanaImageUrl(card, 'large');
  const normalImage = getLocalLorcanaImageUrl(card, 'normal');

  return {
    id: card.id,
    api_id: card.id,
    name: card.name || '',
    set_name: setMeta?.name || '',
    set_code: setMeta?.code || 'LRC',
    card_number: card.collector_number || '',
    rarity: card.rarity || '',
    image_url: largeImage || normalImage,
    image_small: normalImage || largeImage,
    price: null,
    type: (Array.isArray(card.type) ? card.type : []).join(' • '),
    game: 'lorcana',
    ink: card.ink || '',
    cost: card.cost ?? null,
    lore: card.lore ?? null
  };
}

function formatLorcanaDetail(card, setsByCode) {
  const setMeta = getSetMeta(card, setsByCode);
  const largeImage = getLocalLorcanaImageUrl(card, 'large');
  const normalImage = getLocalLorcanaImageUrl(card, 'normal');

  return {
    id: card.id,
    api_id: card.id,
    name: card.name || '',
    version: card.version || '',
    ink: card.ink || '',
    types: Array.isArray(card.type) ? card.type : [],
    cost: card.cost ?? null,
    inkwell: Boolean(card.inkwell),
    strength: card.strength ?? null,
    willpower: card.willpower ?? null,
    lore: card.lore ?? null,
    rarity: card.rarity || '',
    set_code: setMeta?.code || '',
    set_name: setMeta?.name || '',
    collector_number: card.collector_number || '',
    text: card.text || '',
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    classifications: Array.isArray(card.classifications) ? card.classifications : [],
    image_url: largeImage || normalImage,
    image_small: normalImage || largeImage
  };
}

function scoreLorcanaCard(card, normalizedQuery) {
  const name = normalizeText(card.name || '');
  const version = normalizeText(card.version || '');
  const setName = normalizeText(card?.set?.name || '');

  if (name === normalizedQuery) return 1000;
  if (`${name} ${version}`.trim() === normalizedQuery) return 900;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.includes(normalizedQuery)) return 350;
  if (setName.includes(normalizedQuery)) return 200;
  return 0;
}

function compareLorcanaCards(a, b) {
  const setCompare = String(a?.set?.code || '').localeCompare(String(b?.set?.code || ''));
  if (setCompare !== 0) return setCompare;
  return String(a.collector_number || '').localeCompare(String(b.collector_number || ''), undefined, { numeric: true, sensitivity: 'base' });
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
  if (!matchesTextFilter(card.text || '', filters.bodyText)) return false;
  if (Array.isArray(filters.inks) && filters.inks.length > 0 && !filters.inks.includes(card.ink)) return false;
  if (filters.type && !(Array.isArray(card.type) && card.type.includes(filters.type))) return false;
  if (filters.rarity && String(card.rarity || '') !== String(filters.rarity)) return false;
  if (Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    const keywords = Array.isArray(card.keywords) ? card.keywords : [];
    if (!filters.keywords.some((keyword) => keywords.includes(keyword))) return false;
  }
  if (filters.cost !== '' && !compareNumeric(card.cost, filters.costOp || '=', filters.cost)) return false;
  if (filters.lore !== '' && !compareNumeric(card.lore, filters.loreOp || '=', filters.lore)) return false;
  return true;
}

export async function searchLorcanaCatalog(query, limit = 50) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/lorcana/search', { query, limit });
    if (Array.isArray(payload)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  return cards
    .map((card) => ({ card, score: scoreLorcanaCard(card, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareLorcanaCards(a.card, b.card);
    })
    .slice(0, limit)
    .map(({ card }) => formatLorcanaResult(card, setsByCode));
}

export async function searchLorcanaCatalogAdvanced(filters, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 250));
  const page = Math.max(0, options.page || 0);
  const hasFilters = Boolean(
    filters?.name || filters?.inks?.length || filters?.type || filters?.rarity ||
    filters?.cost || filters?.lore || filters?.keywords?.length || filters?.bodyText
  );

  if (!hasFilters) {
    return { results: [], total: 0, page, limit, hasMore: false };
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/lorcana/advanced-search', { filters, limit, page });
    if (Array.isArray(payload?.results)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const matched = cards.filter((card) => matchesAdvancedFilters(card, filters || {})).sort(compareLorcanaCards);
  const total = matched.length;
  const start = page * limit;
  const end = start + limit;

  return {
    results: matched.slice(start, end).map((card) => formatLorcanaResult(card, setsByCode)),
    total,
    page,
    limit,
    hasMore: end < total
  };
}

export async function getLorcanaCardById(cardId) {
  if (!cardId) return null;
  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const card = cards.find((entry) => String(entry?.id || '') === String(cardId));
  if (!card) return null;
  return formatLorcanaDetail(card, setsByCode);
}
