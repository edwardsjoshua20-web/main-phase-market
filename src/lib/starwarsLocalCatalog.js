import { getCatalogAssetUrl, hasExternalCatalogAssetBase } from '@/config/publicAssetUrls';
import { postLocalJsonIfAvailable } from '@/lib/catalogApi';

const cardsUrl = getCatalogAssetUrl('starwars', 'cards.json');
const setsUrl = getCatalogAssetUrl('starwars', 'sets.json');

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

function getLocalStarWarsImageUrl(card, side = 'front') {
  const sourceUrl = side === 'back' ? card?.backImageUrl : card?.frontImageUrl;
  if (!sourceUrl) return null;

  if (hasExternalCatalogAssetBase) {
    return sourceUrl;
  }

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.png';
  } catch {}

  const cardId = String(card?.uuid || card?.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  const suffix = side === 'back' ? '-back' : '';
  return getCatalogAssetUrl('starwars', `images/${prefix}/${encodeURIComponent(cardId)}${suffix}${extension}`);
}

async function loadCards() {
  if (cardsCache.value) return cardsCache.value;
  if (!cardsCache.promise) {
    cardsCache.promise = fetch(cardsUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load Star Wars cards: ${response.status}`);
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
      if (!response.ok) throw new Error(`Failed to load Star Wars sets: ${response.status}`);
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
  const setCode = String(card?.setCode || '');
  return setsByCode.get(setCode) || { code: setCode, name: setCode };
}

function formatStarWarsResult(card, setsByCode) {
  const setMeta = getSetMeta(card, setsByCode);
  return {
    id: card.uuid,
    api_id: card.uuid,
    name: card.name || '',
    set_name: setMeta?.name || '',
    set_code: setMeta?.code || '',
    card_number: card.cardNumber || '',
    rarity: card.rarity || '',
    image_url: getLocalStarWarsImageUrl(card),
    image_back_url: getLocalStarWarsImageUrl(card, 'back'),
    price: null,
    type: card.type || '',
    game: 'starwars',
    aspects: Array.isArray(card.aspects) ? card.aspects : [],
    traits: Array.isArray(card.traits) ? card.traits : [],
    cost: card.cost ?? null,
    power: card.power ?? null,
    hp: card.hp ?? null,
    arena: card.arena || ''
  };
}

function formatStarWarsDetail(card, setsByCode) {
  const setMeta = getSetMeta(card, setsByCode);
  return {
    id: card.uuid,
    api_id: card.uuid,
    card_id: card.id || '',
    external_id: card.externalId || '',
    name: card.name || '',
    subtitle: card.subtitle || '',
    set_name: setMeta?.name || '',
    set_code: setMeta?.code || '',
    card_number: card.cardNumber || '',
    type: card.type || '',
    rarity: card.rarity || '',
    cost: card.cost ?? null,
    power: card.power ?? null,
    hp: card.hp ?? null,
    arena: card.arena || '',
    aspects: Array.isArray(card.aspects) ? card.aspects : [],
    traits: Array.isArray(card.traits) ? card.traits : [],
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    text: card.text || '',
    back_text: card.backText || '',
    artist: card.artist || '',
    variant_type: card.variantType || '',
    is_unique: Boolean(card.isUnique),
    is_leader: Boolean(card.isLeader),
    is_base: Boolean(card.isBase),
    double_sided: Boolean(card.doubleSided),
    epic_action: card.epicAction || '',
    image_url: getLocalStarWarsImageUrl(card),
    image_back_url: getLocalStarWarsImageUrl(card, 'back'),
    released_at: setMeta?.release_date || null
  };
}

function scoreStarWarsCard(card, normalizedQuery) {
  const name = normalizeText(card.name || '');
  const subtitle = normalizeText(card.subtitle || '');
  const text = normalizeText(card.text || '');
  if (name === normalizedQuery) return 1000;
  if (`${name} ${subtitle}`.trim() === normalizedQuery) return 950;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.includes(normalizedQuery)) return 350;
  if (subtitle.includes(normalizedQuery)) return 250;
  if (text.includes(normalizedQuery)) return 180;
  return 0;
}

function compareStarWarsCards(a, b) {
  const setCompare = String(a.setCode || '').localeCompare(String(b.setCode || ''));
  if (setCompare !== 0) return setCompare;
  return String(a.cardNumber || '').localeCompare(String(b.cardNumber || ''), undefined, { numeric: true, sensitivity: 'base' });
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
  if (!matchesTextFilter(`${card.name || ''} ${card.subtitle || ''}`, filters.name)) return false;
  if (!matchesTextFilter(`${card.text || ''} ${card.backText || ''}`, filters.text)) return false;
  if (filters.type && String(card.type || '') !== String(filters.type)) return false;
  if (filters.arena && String(card.arena || '') !== String(filters.arena)) return false;
  if (filters.rarity && String(card.rarity || '') !== String(filters.rarity)) return false;
  if (Array.isArray(filters.aspects) && filters.aspects.length > 0) {
    const aspects = Array.isArray(card.aspects) ? card.aspects : [];
    if (!filters.aspects.every((aspect) => aspects.includes(aspect))) return false;
  }
  if (Array.isArray(filters.traits) && filters.traits.length > 0) {
    const traits = Array.isArray(card.traits) ? card.traits : [];
    if (!filters.traits.every((trait) => traits.includes(trait))) return false;
  }
  if (Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    const keywords = Array.isArray(card.keywords) ? card.keywords : [];
    if (!filters.keywords.every((keyword) => keywords.includes(keyword))) return false;
  }
  if (filters.cost !== '' && !compareNumeric(card.cost, filters.costOp || '=', filters.cost)) return false;
  if (filters.power !== '' && !compareNumeric(card.power, filters.powerOp || '=', filters.power)) return false;
  if (filters.hp !== '' && !compareNumeric(card.hp, filters.hpOp || '=', filters.hp)) return false;
  return true;
}

export async function searchStarWarsCatalog(query, limit = 50) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/starwars/search', { query, limit });
    if (Array.isArray(payload)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  return cards
    .map((card) => ({ card, score: scoreStarWarsCard(card, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareStarWarsCards(a.card, b.card);
    })
    .slice(0, limit)
    .map(({ card }) => formatStarWarsResult(card, setsByCode));
}

export async function searchStarWarsCatalogAdvanced(filters, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 250));
  const page = Math.max(0, options.page || 0);
  const hasFilters = Boolean(
    filters?.name || filters?.text || filters?.type || filters?.arena || filters?.rarity
    || filters?.aspects?.length || filters?.traits?.length || filters?.keywords?.length
    || filters?.cost || filters?.power || filters?.hp
  );
  if (!hasFilters) return { results: [], total: 0, page, limit, hasMore: false };

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/starwars/advanced-search', { filters, limit, page });
    if (Array.isArray(payload?.results)) return payload;
  } catch {}

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const matched = cards.filter((card) => matchesAdvancedFilters(card, filters || {})).sort(compareStarWarsCards);
  const total = matched.length;
  const start = page * limit;
  const end = start + limit;

  return {
    results: matched.slice(start, end).map((card) => formatStarWarsResult(card, setsByCode)),
    total,
    page,
    limit,
    hasMore: end < total
  };
}

export async function getStarWarsCardById(cardId) {
  if (!cardId) return null;
  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const card = cards.find((entry) => String(entry?.uuid || '') === String(cardId));
  if (!card) return null;
  return formatStarWarsDetail(card, setsByCode);
}
