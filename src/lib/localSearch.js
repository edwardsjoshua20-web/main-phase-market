/**
 * localSearch.js
 * Compatibility adapter for mobile components.
 * All active search requests delegate to the canonical Search Owner.
 */
import { searchOwner } from '@/services/search/searchOwner';

export async function searchGameLocal(query, game, limit = 40, options = {}) {
  const { preview = false, ...searchOptions } = options || {};
  return preview
    ? searchOwner.searchPreviewByGame(query, game, limit, searchOptions)
    : searchOwner.searchByGame(query, game, limit, searchOptions);
}

export async function searchAllGamesLocal(query, limit = 10, options = {}) {
  const { preview = false, perGameLimit = 2, ...searchOptions } = options || {};
  return preview
    ? searchOwner.searchPreviewAcrossGames(query, perGameLimit, limit, searchOptions)
    : searchOwner.searchAcrossGames(query, limit, searchOptions);
}


