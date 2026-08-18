import { searchOwner } from './searchOwner';

export async function searchCatalogByGame(query, game, limit = 5) {
  return searchOwner.searchPreviewByGame(query, game, limit);
}

export async function searchCatalogAcrossGames(query, perGameLimit = 2, totalLimit = 10) {
  return searchOwner.searchPreviewAcrossGames(query, perGameLimit, totalLimit);
}
