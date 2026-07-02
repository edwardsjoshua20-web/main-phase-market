import { searchFabCatalog, searchFabCatalogAdvanced } from '@/lib/fabLocalCatalog';
import { searchLorcanaCatalog, searchLorcanaCatalogAdvanced } from '@/lib/lorcanaLocalCatalog';
import { searchMtgCatalog, searchMtgCatalogAdvanced } from '@/lib/mtgLocalCatalog';
import { searchOnePieceCatalog, searchOnePieceCatalogAdvanced } from '@/lib/onePieceLocalCatalog';
import { searchPokemonCatalog, searchPokemonCatalogAdvanced } from '@/lib/pokemonLocalCatalog';
import { searchStarWarsCatalog, searchStarWarsCatalogAdvanced } from '@/lib/starwarsLocalCatalog';
import { searchYugiohCatalog, searchYugiohCatalogAdvanced } from '@/lib/yugiohLocalCatalog';

function emptyMeta() {
  return { total: 0, page: 0, limit: 36, hasMore: false };
}

function buildMeta(response) {
  return {
    total: response.total || 0,
    page: response.page || 0,
    limit: response.limit || 36,
    hasMore: Boolean(response.hasMore)
  };
}

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function performShopCardSearch({ query, game, apiQuery = null, page = 0, limit = 36 }) {
  if (!apiQuery && (!query || query.length < 2)) {
    return { results: [], meta: emptyMeta() };
  }

  if (game === 'pokemon') {
    const params = safeJsonParse(apiQuery, null);
    if (params) {
      const response = await searchPokemonCatalogAdvanced(params, { page, limit });
      return { results: response.results || [], meta: buildMeta(response) };
    }
    return { results: await searchPokemonCatalog(query, 500), meta: emptyMeta() };
  }

  if (game === 'magic') {
    const params = safeJsonParse(apiQuery, null);
    if (params) {
      const response = await searchMtgCatalogAdvanced(params, { page, limit });
      return { results: response.results || [], meta: buildMeta(response) };
    }
    return { results: await searchMtgCatalog(query, 500), meta: emptyMeta() };
  }

  if (game === 'yugioh') {
    if (apiQuery) {
      const response = await searchYugiohCatalogAdvanced(apiQuery, { page, limit });
      return { results: response.results || [], meta: buildMeta(response) };
    }
    return { results: await searchYugiohCatalog(query, 500), meta: emptyMeta() };
  }

  if (game === 'onepiece') {
    const params = safeJsonParse(apiQuery, {});
    if (apiQuery) {
      const response = await searchOnePieceCatalogAdvanced(params, { page, limit });
      return { results: response.results || [], meta: buildMeta(response) };
    }
    return { results: await searchOnePieceCatalog(query, 500), meta: emptyMeta() };
  }

  if (game === 'lorcana') {
    const params = safeJsonParse(apiQuery, {});
    if (apiQuery) {
      const response = await searchLorcanaCatalogAdvanced(params, { page, limit });
      return { results: response.results || [], meta: buildMeta(response) };
    }
    return { results: await searchLorcanaCatalog(query, 500), meta: emptyMeta() };
  }

  if (game === 'flesh_and_blood') {
    const params = safeJsonParse(apiQuery, {});
    if (apiQuery) {
      const response = await searchFabCatalogAdvanced(params, { page, limit });
      return { results: response.results || [], meta: buildMeta(response) };
    }
    return { results: await searchFabCatalog(query, 500), meta: emptyMeta() };
  }

  if (game === 'starwars') {
    const params = safeJsonParse(apiQuery, {});
    if (apiQuery) {
      const response = await searchStarWarsCatalogAdvanced(params, { page, limit });
      return { results: response.results || [], meta: buildMeta(response) };
    }
    return { results: await searchStarWarsCatalog(query, 500), meta: emptyMeta() };
  }

  return { results: [], meta: emptyMeta() };
}
