import { getCatalogAssetUrl, hasExternalCatalogAssetBase } from '@/config/publicAssetUrls';
import { postLocalJsonIfAvailable } from '@/lib/catalogApi';

const cardsUrl = getCatalogAssetUrl('pokemon', 'cards.json');
const setsUrl = getCatalogAssetUrl('pokemon', 'sets.json');

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

function getSetId(card) {
  if (card?.set?.id) return String(card.set.id);
  return String(card?.id || '').split('-')[0] || '';
}

function getLocalPokemonImageUrl(card, kind = 'large') {
  const sourceUrl = card?.images?.[kind];
  if (!sourceUrl) return null;

  if (hasExternalCatalogAssetBase) {
    return sourceUrl;
  }

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ? '.jpg' : pathExtension(pathname) || '.png';
  } catch {}

  const encodedId = encodeURIComponent(String(card.id || 'unknown'));
  const prefix = String(card.id || 'unknown').slice(0, 2).toLowerCase();
  return getCatalogAssetUrl('pokemon', `images/${kind}/${prefix}/${encodedId}${extension}`);
}

function pathExtension(pathname) {
  const match = String(pathname || '').match(/(\.[a-z0-9]+)$/i);
  return match ? match[1] : '';
}

async function loadCards() {
  if (cardsCache.value) return cardsCache.value;

  if (!cardsCache.promise) {
    cardsCache.promise = fetch(cardsUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load Pokemon cards: ${response.status}`);
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
          throw new Error(`Failed to load Pokemon sets: ${response.status}`);
        }

        const sets = await response.json();
        const byId = new Map((sets || []).map((set) => [String(set.id || ''), set]));
        setsCache.value = byId;
        return byId;
      })
      .catch(() => {
        const empty = new Map();
        setsCache.value = empty;
        return empty;
      });
  }

  return setsCache.promise;
}

function getSetMeta(card, setsById) {
  return card?.set || setsById.get(getSetId(card)) || null;
}

function scorePokemonCard(card, setsById, normalizedQuery) {
  const name = normalizeText(card.name || '');
  const setName = normalizeText(getSetMeta(card, setsById)?.name || '');

  if (name === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.split(' ').some((part) => part.startsWith(normalizedQuery))) return 500;
  if (name.includes(normalizedQuery)) return 350;
  if (setName.includes(normalizedQuery)) return 200;
  return 0;
}

function comparePokemonCards(a, b, setsById) {
  const aSet = getSetMeta(a, setsById);
  const bSet = getSetMeta(b, setsById);
  const dateCompare = String(bSet?.releaseDate || '').localeCompare(String(aSet?.releaseDate || ''));
  if (dateCompare !== 0) return dateCompare;

  const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
  if (nameCompare !== 0) return nameCompare;

  return String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function formatPokemonResult(card, setsById) {
  const setMeta = getSetMeta(card, setsById);
  const largeImage = getLocalPokemonImageUrl(card, 'large');
  const smallImage = getLocalPokemonImageUrl(card, 'small');

  return {
    id: card.id,
    api_id: card.id,
    name: card.name || '',
    set_name: setMeta?.name || getSetId(card).toUpperCase() || 'Unknown Set',
    set_code: getSetId(card).toUpperCase() || 'UNK',
    card_number: card.number || '',
    rarity: card.rarity || '',
    image_url: largeImage || smallImage,
    image_small: smallImage || largeImage,
    price: null,
    type: [card.supertype, ...(Array.isArray(card.types) ? card.types : [])].filter(Boolean).join(' • '),
    game: 'pokemon',
    supertype: card.supertype || '',
    types: Array.isArray(card.types) ? card.types : [],
    hp: card.hp || '',
    released_at: setMeta?.releaseDate || '',
    raw: card
  };
}

function formatPokemonDetail(card, setsById) {
  const setMeta = getSetMeta(card, setsById);
  const largeImage = getLocalPokemonImageUrl(card, 'large');
  const smallImage = getLocalPokemonImageUrl(card, 'small');

  return {
    id: card.id,
    api_id: card.id,
    name: card.name || '',
    set_id: getSetId(card),
    set_name: setMeta?.name || getSetId(card).toUpperCase() || 'Unknown Set',
    set_code: String(setMeta?.ptcgoCode || getSetId(card) || 'UNK').toUpperCase(),
    card_number: card.number || '',
    rarity: card.rarity || '',
    image_url: largeImage || smallImage,
    image_small: smallImage || largeImage,
    game: 'pokemon',
    supertype: card.supertype || '',
    subtypes: Array.isArray(card.subtypes) ? card.subtypes : [],
    types: Array.isArray(card.types) ? card.types : [],
    hp: card.hp || '',
    level: card.level || '',
    evolvesFrom: card.evolvesFrom || '',
    evolvesTo: Array.isArray(card.evolvesTo) ? card.evolvesTo : [],
    rules: Array.isArray(card.rules) ? card.rules : [],
    abilities: Array.isArray(card.abilities) ? card.abilities : [],
    attacks: Array.isArray(card.attacks) ? card.attacks : [],
    weaknesses: Array.isArray(card.weaknesses) ? card.weaknesses : [],
    resistances: Array.isArray(card.resistances) ? card.resistances : [],
    retreatCost: Array.isArray(card.retreatCost) ? card.retreatCost : [],
    convertedRetreatCost: card.convertedRetreatCost ?? null,
    artist: card.artist || '',
    flavorText: card.flavorText || '',
    regulationMark: card.regulationMark || '',
    legalities: card.legalities || {},
    nationalPokedexNumbers: Array.isArray(card.nationalPokedexNumbers) ? card.nationalPokedexNumbers : [],
    released_at: setMeta?.releaseDate || '',
    raw: card
  };
}

function matchesTextFilter(value, query) {
  if (!query) return true;
  return normalizeText(value).includes(normalizeText(query));
}

function matchesPokemonAdvancedFilters(card, setsById, filters) {
  const setMeta = getSetMeta(card, setsById);

  if (!matchesTextFilter(card.name || '', filters.name)) return false;
  if (filters.supertype && String(card.supertype || '') !== String(filters.supertype)) return false;
  if (filters.type && !(Array.isArray(card.types) && card.types.includes(filters.type))) return false;
  if (filters.rarity && String(card.rarity || '') !== String(filters.rarity)) return false;
  if (!matchesTextFilter(setMeta?.name || getSetId(card), filters.set)) return false;

  return true;
}

export async function searchPokemonCatalog(query, limit = 50) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/pokemon/search', { query, limit });
    if (Array.isArray(payload)) {
      return payload;
    }
  } catch {
    // Fall back to local file scan.
  }

  const [cards, setsById] = await Promise.all([loadCards(), loadSets()]);

  return cards
    .map((card) => ({ card, score: scorePokemonCard(card, setsById, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return comparePokemonCards(a.card, b.card, setsById);
    })
    .slice(0, limit)
    .map(({ card }) => formatPokemonResult(card, setsById));
}

export async function searchPokemonCatalogAdvanced(filters, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 250));
  const page = Math.max(0, options.page || 0);
  const hasFilters = Boolean(
    filters?.name ||
    filters?.supertype ||
    filters?.type ||
    filters?.rarity ||
    filters?.set
  );

  if (!hasFilters) {
    return { results: [], total: 0, page, limit, hasMore: false };
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/pokemon/advanced-search', { filters, limit, page });
    if (Array.isArray(payload?.results)) {
      return payload;
    }
  } catch {
    // Fall back to local file scan.
  }

  const [cards, setsById] = await Promise.all([loadCards(), loadSets()]);

  const matched = cards
    .filter((card) => matchesPokemonAdvancedFilters(card, setsById, filters || {}))
    .sort((a, b) => comparePokemonCards(a, b, setsById));

  const total = matched.length;
  const start = page * limit;
  const end = start + limit;

  return {
    results: matched.slice(start, end).map((card) => formatPokemonResult(card, setsById)),
    total,
    page,
    limit,
    hasMore: end < total
  };
}

export async function getPokemonCardById(cardId) {
  if (!cardId) return null;

  const [cards, setsById] = await Promise.all([loadCards(), loadSets()]);
  const card = cards.find((entry) => String(entry?.id || '') === String(cardId));
  if (!card) return null;
  return formatPokemonDetail(card, setsById);
}
