import { getCatalogAssetUrl, hasExternalCatalogAssetBase } from '@/config/publicAssetUrls';
import { postLocalJsonIfAvailable } from '@/lib/catalogApi';

const cardsUrl = getCatalogAssetUrl('yugioh', 'cards.json');
const setsUrl = getCatalogAssetUrl('yugioh', 'sets.json');

const cardsCache = {
  promise: null,
  value: null
};

const setsCache = {
  promise: null,
  value: null
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

function getCardPrimaryImage(card) {
  return Array.isArray(card?.card_images) ? card.card_images[0] || null : null;
}

function getLocalYugiohImageUrl(card, kind = 'full') {
  const image = getCardPrimaryImage(card);
  const sourceUrl = kind === 'small' ? image?.image_url_small : kind === 'cropped' ? image?.image_url_cropped : image?.image_url;
  if (!sourceUrl) return null;

  if (hasExternalCatalogAssetBase) {
    return sourceUrl;
  }

  let extension = '.jpg';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathname.endsWith('.png') ? '.png' : pathExtension(pathname) || '.jpg';
  } catch {}

  const cardId = String(image?.id || card?.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  return getCatalogAssetUrl('yugioh', `images/${kind}/${prefix}/${encodeURIComponent(cardId)}${extension}`);
}

async function loadCards() {
  if (cardsCache.value) return cardsCache.value;

  if (!cardsCache.promise) {
    cardsCache.promise = fetch(cardsUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load Yu-Gi-Oh cards: ${response.status}`);
      }

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
        if (!response.ok) {
          throw new Error(`Failed to load Yu-Gi-Oh sets: ${response.status}`);
        }

        const sets = await response.json();
        const byCode = new Map((sets || []).map((set) => [String(set.set_code || ''), set]));
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

function getPrimarySet(card, setsByCode) {
  const sets = Array.isArray(card?.card_sets) ? card.card_sets : [];
  if (!sets.length) return null;

  return [...sets].sort((a, b) => {
    const aMeta = setsByCode.get(String(a.set_code || ''));
    const bMeta = setsByCode.get(String(b.set_code || ''));
    const aDate = aMeta?.tcg_date || '';
    const bDate = bMeta?.tcg_date || '';
    const dateCompare = String(bDate).localeCompare(String(aDate));
    if (dateCompare !== 0) return dateCompare;
    return String(a.set_name || '').localeCompare(String(b.set_name || ''));
  })[0];
}

function getPrice(card) {
  const prices = Array.isArray(card?.card_prices) ? card.card_prices[0] : null;
  const tcg = Number(prices?.tcgplayer_price);
  return Number.isFinite(tcg) ? tcg : null;
}

function formatYugiohResult(card, setsByCode) {
  const primarySet = getPrimarySet(card, setsByCode);
  const fullImage = getLocalYugiohImageUrl(card, 'full');
  const smallImage = getLocalYugiohImageUrl(card, 'small');

  return {
    id: String(card.id || ''),
    api_id: String(card.id || ''),
    name: card.name || '',
    set_name: primarySet?.set_name || 'Unknown Set',
    set_code: primarySet?.set_code || '',
    card_number: primarySet?.set_code || String(card.id || ''),
    rarity: primarySet?.set_rarity || '',
    image_url: fullImage || smallImage,
    image_small: smallImage || fullImage,
    price: getPrice(card),
    type: card.type || '',
    game: 'yugioh',
    atk: card.atk ?? null,
    def: card.def ?? null,
    level: card.level ?? null,
    raw: card
  };
}

function formatYugiohDetail(card, setsByCode) {
  const primarySet = getPrimarySet(card, setsByCode);
  const fullImage = getLocalYugiohImageUrl(card, 'full');
  const smallImage = getLocalYugiohImageUrl(card, 'small');

  return {
    id: String(card.id || ''),
    api_id: String(card.id || ''),
    name: card.name || '',
    type: card.type || '',
    frameType: card.frameType || '',
    desc: card.desc || '',
    race: card.race || '',
    archetype: card.archetype || '',
    atk: card.atk ?? null,
    def: card.def ?? null,
    level: card.level ?? null,
    attribute: card.attribute || '',
    scale: card.scale ?? null,
    linkval: card.linkval ?? null,
    linkmarkers: Array.isArray(card.linkmarkers) ? card.linkmarkers : [],
    ban_tcg: card?.banlist_info?.ban_tcg || '',
    card_sets: Array.isArray(card.card_sets) ? card.card_sets : [],
    card_prices: Array.isArray(card.card_prices) ? card.card_prices : [],
    image_url: fullImage || smallImage,
    image_small: smallImage || fullImage,
    set_name: primarySet?.set_name || 'Unknown Set',
    set_code: primarySet?.set_code || '',
    rarity: primarySet?.set_rarity || '',
    released_at: setsByCode.get(String(primarySet?.set_code || ''))?.tcg_date || '',
    raw: card
  };
}

function scoreYugiohCard(card, normalizedQuery) {
  const name = normalizeText(card.name || '');
  const searchText = normalizeText([
    card.name,
    card.desc,
    card.type,
    card.race,
    card.attribute,
    card.archetype
  ].filter(Boolean).join(' '));

  if (name === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.split(' ').some((part) => part.startsWith(normalizedQuery))) return 500;
  if (name.includes(normalizedQuery)) return 350;
  if (searchText.includes(normalizedQuery)) return 200;
  return 0;
}

function compareYugiohCards(a, b) {
  const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
  if (nameCompare !== 0) return nameCompare;
  return Number(a.id || 0) - Number(b.id || 0);
}

function parseAdvancedQuery(apiQuery = '') {
  const params = new URLSearchParams(String(apiQuery || ''));
  let numFilters = {};

  const numFiltersRaw = params.get('__numFilters');
  if (numFiltersRaw) {
    try {
      numFilters = JSON.parse(numFiltersRaw);
    } catch {}
  }

  return {
    query: params.get('fname') || '',
    type: params.get('type') || '',
    race: params.get('race') || '',
    attribute: params.get('attribute') || '',
    atk: numFilters.atk || params.get('atk') || '',
    atkOp: numFilters.atkOp || '=',
    def: numFilters.def || params.get('def') || '',
    defOp: numFilters.defOp || '=',
    level: numFilters.level || params.get('level') || '',
    levelOp: numFilters.levelOp || '=',
    desc: numFilters.desc || '',
    keywords: Array.isArray(numFilters.keywords) ? numFilters.keywords : []
  };
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
  if (!matchesTextFilter([card.name, card.desc, card.archetype].filter(Boolean).join(' '), filters.query)) return false;
  if (!matchesTextFilter(card.desc || '', filters.desc)) return false;
  if (filters.type && normalizeText(card.type || '') !== normalizeText(filters.type)) return false;
  if (filters.race && normalizeText(card.race || '') !== normalizeText(filters.race)) return false;
  if (filters.attribute && normalizeText(card.attribute || '') !== normalizeText(filters.attribute)) return false;
  if (filters.atk !== '' && !compareNumeric(card.atk, filters.atkOp || '=', filters.atk)) return false;
  if (filters.def !== '' && !compareNumeric(card.def, filters.defOp || '=', filters.def)) return false;
  if (filters.level !== '' && !compareNumeric(card.level, filters.levelOp || '=', filters.level)) return false;
  if (Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    const desc = normalizeText(card.desc || '');
    if (!filters.keywords.some((keyword) => desc.includes(normalizeText(keyword)))) {
      return false;
    }
  }
  return true;
}

export async function searchYugiohCatalog(query, limit = 50) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/yugioh/search', { query, limit });
    if (Array.isArray(payload)) {
      return payload;
    }
  } catch {
    // Fall back to local file scan.
  }

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);

  return cards
    .map((card) => ({ card, score: scoreYugiohCard(card, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareYugiohCards(a.card, b.card);
    })
    .slice(0, limit)
    .map(({ card }) => formatYugiohResult(card, setsByCode));
}

export async function searchYugiohCatalogAdvanced(apiQuery, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 250));
  const page = Math.max(0, options.page || 0);
  const filters = parseAdvancedQuery(apiQuery);
  const hasFilters = Boolean(
    filters.query ||
    filters.type ||
    filters.race ||
    filters.attribute ||
    filters.atk !== '' ||
    filters.def !== '' ||
    filters.level !== '' ||
    filters.desc ||
    filters.keywords.length
  );

  if (!hasFilters) {
    return { results: [], total: 0, page, limit, hasMore: false };
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/yugioh/advanced-search', { filters, limit, page });
    if (Array.isArray(payload?.results)) {
      return payload;
    }
  } catch {
    // Fall back to local file scan.
  }

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);

  const matched = cards
    .filter((card) => matchesAdvancedFilters(card, filters))
    .sort(compareYugiohCards);

  const total = matched.length;
  const start = page * limit;
  const end = start + limit;

  return {
    results: matched.slice(start, end).map((card) => formatYugiohResult(card, setsByCode)),
    total,
    page,
    limit,
    hasMore: end < total
  };
}

export async function getYugiohCardById(cardId) {
  if (!cardId) return null;

  const [cards, setsByCode] = await Promise.all([loadCards(), loadSets()]);
  const card = cards.find((entry) => String(entry?.id || '') === String(cardId));
  if (!card) return null;
  return formatYugiohDetail(card, setsByCode);
}

export async function searchYugiohSets(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  const setsByCode = await loadSets();
  return [...setsByCode.values()]
    .filter((set) => matchesTextFilter(`${set.set_name || ''} ${set.set_code || ''}`, normalizedQuery))
    .sort((a, b) => {
      const dateCompare = String(b.tcg_date || '').localeCompare(String(a.tcg_date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.set_name || '').localeCompare(String(b.set_name || ''));
    })
    .slice(0, limit)
    .map((set) => ({
      id: set.set_code || set.set_name,
      name: set.set_name || 'Unknown Set',
      set_code: set.set_code || '',
      image_url: null,
      release_date: set.tcg_date || null,
      game: 'yugioh'
    }));
}
