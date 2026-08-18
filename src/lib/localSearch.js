/**
 * localSearch.js
 * Compatibility adapter for mobile components.
 * All active search requests delegate to the canonical Search Owner.
 */
import { searchOwner } from '@/services/search/searchOwner';

export async function searchGameLocal(query, game, limit = 40) {
  return searchOwner.searchByGame(query, game, limit);
}

export async function searchAllGamesLocal(query, limit = 10) {
  return searchOwner.searchAcrossGames(query, limit);
}


