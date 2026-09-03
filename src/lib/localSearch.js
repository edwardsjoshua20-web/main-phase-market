/**
 * localSearch.js
 * Compatibility adapter for mobile components.
 * All active search requests delegate to the canonical Search Owner.
 */
import { searchOwner } from '@/services/search/searchOwner';

export async function searchGameLocal(query, game, limit = 40, options = {}) {
  return searchOwner.searchByGame(query, game, limit, options);
}

export async function searchAllGamesLocal(query, limit = 10, options = {}) {
  return searchOwner.searchAcrossGames(query, limit, options);
}


