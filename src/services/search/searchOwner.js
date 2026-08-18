import { getCatalogAssetUrl } from '@/config/publicAssetUrls';
import { searchFabCatalog, searchFabCatalogAdvanced } from '@/lib/fabLocalCatalog';
import { searchLorcanaCatalog, searchLorcanaCatalogAdvanced } from '@/lib/lorcanaLocalCatalog';
import { browseMtgCatalog, getMtgPrintingsByOracleId, searchMtgCatalog, searchMtgCatalogAdvanced, searchMtgCatalogSuggestions } from '@/lib/mtgLocalCatalog';
import { searchOnePieceCatalog, searchOnePieceCatalogAdvanced } from '@/lib/onePieceLocalCatalog';
import { searchPokemonCatalog, searchPokemonCatalogAdvanced } from '@/lib/pokemonLocalCatalog';
import { searchStarWarsCatalog, searchStarWarsCatalogAdvanced } from '@/lib/starwarsLocalCatalog';
import { searchYugiohCatalog, searchYugiohCatalogAdvanced } from '@/lib/yugiohLocalCatalog';
import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { listingOwner } from '@/services/listing/listingOwner';
import {
  SUPPORTED_SEARCH_GAMES,
  canonicalGame,
  enrichCatalogResultsWithInventory,
  normalizeSearchText,
  paginateSearchResults,
  rankCatalogResults
} from './searchCore';

const CATALOG_DEFAULT_LIMIT = 500;

function emptyMeta(limit = 36) {
  return { total: 0, page: 0, limit, hasMore: false };
}

function buildMeta(response, fallback = {}) {
  return {
    total: response?.total || 0,
    page: response?.page || fallback.page || 0,
    limit: response?.limit || fallback.limit || 36,
    hasMore: Boolean(response?.hasMore)
  };
}

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function withCommonCardFields(card, fields = {}) {
  const normalizedGame = canonicalGame(card.game || fields.game);
  return {
    ...card,
    set_code: card.set_code || card.set_id || fields.set_code || 'UNK',
    card_number: card.card_number || fields.card_number || '',
    collector_number: card.collector_number || card.card_number || card.number || fields.card_number || '',
    rarity: card.rarity || fields.rarity || '',
    game: normalizedGame
  };
}

async function loadInventoryListings(options = {}) {
  if (options.inventoryListings) return options.inventoryListings;
  if (options.includeInventory === false) return [];

  try {
    return await listingOwner.filterCardListings({ status: 'active' }, '-created_date', options.inventoryLimit || 1000);
  } catch {
    return [];
  }
}

function normalizeOwnerResults(results, query, options = {}) {
  const inventoryListings = options.inventoryListings || [];
  const enriched = enrichCatalogResultsWithInventory(results, inventoryListings);
  return rankCatalogResults(enriched, query);
}

function normalizeAdvancedOwnerResults(results, options = {}) {
  const inventoryListings = options.inventoryListings || [];
  const enriched = enrichCatalogResultsWithInventory(results, inventoryListings);
  return enriched
    .map((card, index) => ({
      ...card,
      searchScore: card.searchScore ?? 500,
      searchRankBucket: card.searchRankBucket ?? 1,
      searchStableIndex: card.searchStableIndex ?? index
    }))
    .sort((a, b) => {
      if (Boolean(b.inStock) !== Boolean(a.inStock)) return b.inStock ? 1 : -1;
      return (a.searchStableIndex || 0) - (b.searchStableIndex || 0);
    });
}

async function catalogSearchByGame(query, game, limit = CATALOG_DEFAULT_LIMIT) {
  const searchGame = canonicalGame(game);
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];

  if (searchGame === 'all') {
    const perGameLimit = Math.max(1, Math.ceil(limit / SUPPORTED_SEARCH_GAMES.length));
    const settled = await Promise.allSettled(
      SUPPORTED_SEARCH_GAMES.map((supportedGame) => catalogSearchByGame(normalizedQuery, supportedGame, perGameLimit))
    );
    return settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  }

  switch (searchGame) {
    case 'pokemon':
      return (await searchPokemonCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'pokemon', rarity: 'Common' })
      );
    case 'magic':
      return (await searchMtgCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'magic', rarity: 'Common' })
      );
    case 'yugioh':
      return (await searchYugiohCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'yugioh' })
      );
    case 'lorcana':
      return (await searchLorcanaCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'lorcana', rarity: 'Common' })
      );
    case 'onepiece':
      return (await searchOnePieceCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'onepiece', set_code: 'OP' })
      );
    case 'flesh_and_blood':
      return (await searchFabCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'flesh_and_blood' })
      );
    case 'starwars':
      return (await searchStarWarsCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'starwars', set_code: 'SWU' })
      );
    default:
      return [];
  }
}

async function catalogSuggestionsByGame(query, game, limit = 5) {
  const searchGame = canonicalGame(game);
  if (searchGame === 'magic') {
    return (await searchMtgCatalogSuggestions(query, limit)).map((card) =>
      withCommonCardFields(card, { game: 'magic', rarity: 'Common' })
    );
  }
  return catalogSearchByGame(query, searchGame, limit);
}

async function catalogBrowseByGame(game, limit = 100) {
  const searchGame = canonicalGame(game);

  switch (searchGame) {
    case 'magic':
      return (await browseMtgCatalog(limit)).map((card) =>
        withCommonCardFields(card, { game: 'magic', rarity: 'Common' })
      );
    default:
      return catalogSearchByGame('', searchGame, limit);
  }
}

async function advancedCatalogSearch({ game, apiQuery = null, page = 0, limit = 36 }) {
  const searchGame = canonicalGame(game);
  switch (searchGame) {
    case 'pokemon':
      return searchPokemonCatalogAdvanced(safeJsonParse(apiQuery, {}), { page, limit });
    case 'magic':
      return searchMtgCatalogAdvanced(safeJsonParse(apiQuery, {}), { page, limit });
    case 'yugioh':
      return searchYugiohCatalogAdvanced(apiQuery, { page, limit });
    case 'onepiece':
      return searchOnePieceCatalogAdvanced(safeJsonParse(apiQuery, {}), { page, limit });
    case 'lorcana':
      return searchLorcanaCatalogAdvanced(safeJsonParse(apiQuery, {}), { page, limit });
    case 'flesh_and_blood':
      return searchFabCatalogAdvanced(safeJsonParse(apiQuery, {}), { page, limit });
    case 'starwars':
      return searchStarWarsCatalogAdvanced(safeJsonParse(apiQuery, {}), { page, limit });
    default:
      return { results: [], ...emptyMeta(limit) };
  }
}

async function readCatalogSets(game) {
  try {
    const response = await fetch(getCatalogAssetUrl(game, 'sets.json'));
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function normalizeSetResult(set, game, products = []) {
  const searchGame = canonicalGame(game);
  const setCode = set.code || set.set_code || set.ptcgoCode || set.id || '';
  const setName = set.name || set.set_name || 'Unknown Set';
  const listedProduct = products.find((product) =>
    product.product_type === 'booster_box' &&
    String(product.set_name || '').toLowerCase() === String(setName || '').toLowerCase()
  );
  const stockState = listedProduct ? inventoryOwner.getStockState(listedProduct) : { inStock: false };

  return {
    id: set.id || setCode || setName,
    name: setName,
    set_code: String(setCode || '').toUpperCase(),
    image_url: set.images?.logo || set.logo || set.image_url || null,
    release_date: set.releaseDate || set.released_at || set.tcg_date || null,
    game: searchGame,
    inStock: Boolean(listedProduct && stockState.inStock),
    stockProduct: listedProduct || null
  };
}

export const searchOwner = {
  normalizeQuery: normalizeSearchText,
  supportedGames: SUPPORTED_SEARCH_GAMES,

  async searchByGame(query, game, limit = 40, options = {}) {
    const inventoryListings = await loadInventoryListings(options);
    const catalogResults = await catalogSearchByGame(query, game, limit);
    return normalizeOwnerResults(catalogResults, query, { inventoryListings }).slice(0, limit);
  },

  async searchAcrossGames(query, limit = 10, options = {}) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return [];

    const inventoryListings = await loadInventoryListings(options);
    const perGame = Math.max(1, Math.ceil(limit / SUPPORTED_SEARCH_GAMES.length));
    const settled = await Promise.allSettled(
      SUPPORTED_SEARCH_GAMES.map((game) => catalogSearchByGame(normalizedQuery, game, perGame * 3))
    );

    const flat = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    return normalizeOwnerResults(flat, normalizedQuery, { inventoryListings }).slice(0, limit);
  },

  async searchPreviewByGame(query, game, limit = 5, options = {}) {
    const inventoryListings = await loadInventoryListings(options);
    const catalogResults = await catalogSuggestionsByGame(query, game, limit * 3);
    return normalizeOwnerResults(catalogResults, query, { inventoryListings }).slice(0, limit);
  },

  async searchPreviewAcrossGames(query, perGameLimit = 2, totalLimit = 10, options = {}) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return [];

    const inventoryListings = await loadInventoryListings(options);
    const settled = await Promise.allSettled(
      SUPPORTED_SEARCH_GAMES.map((game) => catalogSuggestionsByGame(normalizedQuery, game, perGameLimit * 3))
    );
    const flat = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    return normalizeOwnerResults(flat, normalizedQuery, { inventoryListings }).slice(0, totalLimit);
  },

  async browseByGame(game, limit = 100, options = {}) {
    const inventoryListings = await loadInventoryListings(options);
    const catalogResults = await catalogBrowseByGame(game, limit);
    return normalizeOwnerResults(catalogResults, '', { inventoryListings }).slice(0, limit);
  },

  async searchShopCards({ query, game, apiQuery = null, page = 0, limit = 36, inventoryListings = null } = {}) {
    if (!apiQuery && (!query || query.length < 2)) {
      return { results: [], meta: emptyMeta(limit) };
    }

    const searchGame = canonicalGame(game);
    const listings = await loadInventoryListings({ inventoryListings });

    if (apiQuery) {
      const response = await advancedCatalogSearch({ game: searchGame, apiQuery, page, limit });
      const normalized = normalizeAdvancedOwnerResults(response.results || [], { inventoryListings: listings });
      return { results: normalized, meta: buildMeta(response, { page, limit }) };
    }

    const catalogResults = await catalogSearchByGame(query, searchGame, CATALOG_DEFAULT_LIMIT);
    const ranked = normalizeOwnerResults(catalogResults, query, { inventoryListings: listings });
    const pageResult = paginateSearchResults(ranked, page, limit);
    return { results: pageResult.results, meta: pageResult.meta };
  },

  async getMagicPrintingsByOracleId(oracleId) {
    return getMtgPrintingsByOracleId(oracleId);
  },

  async searchSets({ query, game, products = [], limit = 100 } = {}) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return this.listSets({ game, products, limit: 0 });

    const sets = await readCatalogSets(canonicalGame(game));
    return sets
      .map((set) => normalizeSetResult(set, game, products))
      .filter((set) => normalizeSearchText(`${set.name} ${set.set_code}`).includes(normalizedQuery))
      .sort((a, b) => {
        if (Boolean(b.inStock) !== Boolean(a.inStock)) return b.inStock ? 1 : -1;
        return String(b.release_date || '').localeCompare(String(a.release_date || ''));
      })
      .slice(0, limit);
  },

  async listSets({ game, products = [], limit = 100 } = {}) {
    const sets = await readCatalogSets(canonicalGame(game));
    const normalized = sets
      .map((set) => normalizeSetResult(set, game, products))
      .sort((a, b) => {
        if (Boolean(b.inStock) !== Boolean(a.inStock)) return b.inStock ? 1 : -1;
        return String(b.release_date || '').localeCompare(String(a.release_date || ''));
      });
    return limit > 0 ? normalized.slice(0, limit) : normalized;
  }
};

export async function searchCards(query, game, limit = 50, skip = 0) {
  const results = await searchOwner.searchByGame(query, game, limit + skip);
  return results.slice(skip);
}

export async function searchAdvancedCards(game, apiQuery, options = {}) {
  return searchOwner.searchShopCards({
    query: options.displayQuery || 'Advanced Search',
    game,
    apiQuery,
    page: options.page || 0,
    limit: options.limit || 36
  });
}
