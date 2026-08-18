import { searchOwner } from './searchOwner';

export async function performShopCardSearch({ query, game, apiQuery = null, page = 0, limit = 36 }) {
  return searchOwner.searchShopCards({ query, game, apiQuery, page, limit });
}
