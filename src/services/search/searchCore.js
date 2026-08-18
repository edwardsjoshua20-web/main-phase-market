export const SUPPORTED_SEARCH_GAMES = [
  'pokemon',
  'magic',
  'yugioh',
  'lorcana',
  'onepiece',
  'flesh_and_blood',
  'starwars'
];

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function canonicalGame(value) {
  const normalized = normalizeSearchText(value);
  const aliases = {
    all: 'all',
    mtg: 'magic',
    magic: 'magic',
    'magic_the_gathering': 'magic',
    'magic gathering': 'magic',
    'magic the gathering': 'magic',
    pokemon: 'pokemon',
    pokémon: 'pokemon',
    'pokemon_tcg': 'pokemon',
    yugioh: 'yugioh',
    'yu_gi_oh': 'yugioh',
    'yu gi oh': 'yugioh',
    'yu-gi-oh': 'yugioh',
    onepiece: 'onepiece',
    'one_piece': 'onepiece',
    'one piece': 'onepiece',
    'one piece tcg': 'onepiece',
    lorcana: 'lorcana',
    'disney_lorcana': 'lorcana',
    'disney lorcana': 'lorcana',
    fab: 'flesh_and_blood',
    'flesh_and_blood': 'flesh_and_blood',
    'flesh and blood': 'flesh_and_blood',
    starwars: 'starwars',
    'star_wars': 'starwars',
    'star wars': 'starwars',
    'star wars unlimited': 'starwars'
  };
  return aliases[normalized] || normalized.replace(/\s+/g, '_') || 'magic';
}

export function getSearchIdentity(card = {}) {
  const game = canonicalGame(card.game || card.product_type);
  return [
    game,
    card.id || card.api_id || card.oracle_id || card.product_id || normalizeSearchText(card.name || card.product_name),
    card.set_code || card.set_id || card.set_name || '',
    card.collector_number || card.card_number || card.number || '',
    card.finish || '',
    card.language || card.lang || ''
  ].map((part) => String(part || '').trim().toLowerCase()).join('::');
}

function stockQuantity(listing = {}) {
  const direct = Number(listing.stock_quantity ?? listing.quantity_available ?? listing.quantity ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const inventory = Number(listing.inventory_quantity ?? listing.stock ?? 0);
  return Number.isFinite(inventory) && inventory > 0 ? inventory : 0;
}

function textFields(card = {}) {
  return [
    card.name,
    card.product_name,
    card.set_name,
    card.set_code,
    card.collector_number,
    card.card_number,
    card.number,
    card.type_line,
    card.type,
    card.oracle_text,
    card.description,
    card.text,
    card.functional_text,
    card.rarity
  ];
}

export function scoreCatalogCard(card, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 500;

  const rawName = String(card.name || card.product_name || '');
  const name = normalizeSearchText(rawName);
  const printedName = normalizeSearchText(card.printed_name);
  const faceNames = rawName.split(/\s*\/\/\s*/).map((faceName) => normalizeSearchText(faceName));
  const setCode = normalizeSearchText(card.set_code || card.set_id);
  const collectorNumber = normalizeSearchText(card.collector_number || card.card_number || card.number);
  const haystack = normalizeSearchText(textFields(card).filter(Boolean).join(' '));

  if (name === normalizedQuery || printedName === normalizedQuery) return 1000;
  if (faceNames.some((faceName) => faceName === normalizedQuery)) return 980;
  if (name.startsWith(normalizedQuery) || printedName.startsWith(normalizedQuery)) return 850;
  if (name.includes(normalizedQuery) || printedName.includes(normalizedQuery)) return 700;
  if (setCode === normalizedQuery || collectorNumber === normalizedQuery) return 625;
  if (haystack.includes(normalizedQuery)) return 350;
  return 0;
}

function resultBucket(score) {
  if (score >= 950) return 4;
  if (score >= 700) return 3;
  if (score >= 625) return 2;
  if (score > 0) return 1;
  return 0;
}

export function rankCatalogResults(results = [], query = '') {
  return [...results]
    .map((card, index) => {
      const score = card.searchScore ?? scoreCatalogCard(card, query);
      return {
        ...card,
        searchScore: score,
        searchRankBucket: resultBucket(score),
        searchStableIndex: index
      };
    })
    .filter((card) => !query || card.searchScore > 0)
    .sort((a, b) => {
      if (b.searchRankBucket !== a.searchRankBucket) return b.searchRankBucket - a.searchRankBucket;
      if (Boolean(b.inStock) !== Boolean(a.inStock)) return b.inStock ? 1 : -1;
      if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
      if (nameCompare !== 0) return nameCompare;
      return (a.searchStableIndex || 0) - (b.searchStableIndex || 0);
    });
}

export function paginateSearchResults(results = [], page = 0, limit = 36) {
  const safePage = Math.max(0, Number(page) || 0);
  const safeLimit = Math.max(1, Number(limit) || 36);
  const start = safePage * safeLimit;
  const end = start + safeLimit;
  return {
    results: results.slice(start, end),
    meta: {
      total: results.length,
      page: safePage,
      limit: safeLimit,
      hasMore: end < results.length
    }
  };
}

function listingMatchesCard(card = {}, listing = {}) {
  const cardGame = canonicalGame(card.game || card.product_type);
  const listingGame = canonicalGame(listing.game || listing.product_type);
  if (cardGame && listingGame && cardGame !== listingGame) return false;

  const listingId = String(listing.card_id || listing.product_id || listing.api_id || listing.id || '').toLowerCase();
  const cardIds = [card.id, card.api_id, card.product_id, card.oracle_id].map((value) => String(value || '').toLowerCase()).filter(Boolean);
  if (listingId && cardIds.includes(listingId)) return true;

  const listingName = normalizeSearchText(listing.card_name || listing.product_name || listing.name);
  const cardName = normalizeSearchText(card.name || card.product_name);
  if (!listingName || !cardName || listingName !== cardName) return false;

  const listingSet = normalizeSearchText(listing.set_code || listing.set_name || '');
  const cardSet = normalizeSearchText(card.set_code || card.set_id || card.set_name || '');
  if (listingSet && cardSet && listingSet !== cardSet) return false;

  const listingNumber = normalizeSearchText(listing.collector_number || listing.card_number || listing.number || '');
  const cardNumber = normalizeSearchText(card.collector_number || card.card_number || card.number || '');
  if (listingNumber && cardNumber && listingNumber !== cardNumber) return false;

  return true;
}

export function enrichCatalogResultsWithInventory(catalogResults = [], inventoryListings = []) {
  return catalogResults.map((card) => {
    const listing = inventoryListings.find((candidate) => listingMatchesCard(card, candidate));
    const quantity = listing ? stockQuantity(listing) : 0;
    return {
      ...card,
      inStock: quantity > 0,
      stockCard: quantity > 0 ? listing : null,
      inventoryQuantity: quantity,
      searchIdentity: getSearchIdentity(card)
    };
  });
}
