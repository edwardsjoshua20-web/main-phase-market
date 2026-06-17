/**
 * localSearch.js
 * All search functions query the local file-backed catalogs only.
 * No external API calls. Used by mobile components.
 */
import { searchFabCatalog } from '@/lib/fabLocalCatalog';
import { searchLorcanaCatalog } from '@/lib/lorcanaLocalCatalog';
import { searchMtgCatalog } from '@/lib/mtgLocalCatalog';
import { searchOnePieceCatalog } from '@/lib/onePieceLocalCatalog';
import { searchPokemonCatalog } from '@/lib/pokemonLocalCatalog';
import { searchStarWarsCatalog } from '@/lib/starwarsLocalCatalog';
import { searchYugiohCatalog } from '@/lib/yugiohLocalCatalog';

export async function searchGameLocal(query, game, limit = 40) {
  if (game === 'pokemon') {
    return searchPokemonCatalog(query, limit);
  }

  if (game === 'magic') {
    return searchMtgCatalog(query, limit);
  }

  if (game === 'yugioh') {
    return searchYugiohCatalog(query, limit);
  }

  if (game === 'lorcana') {
    return searchLorcanaCatalog(query, limit);
  }

  if (game === 'onepiece') {
    return searchOnePieceCatalog(query, limit);
  }

  if (game === 'flesh_and_blood') {
    return searchFabCatalog(query, limit);
  }

  if (game === 'starwars') {
    return searchStarWarsCatalog(query, limit);
  }

  return [];
}

export async function searchAllGamesLocal(query, limit = 10) {
  const perGame = Math.ceil(limit / 7);
  const games = ['pokemon', 'magic', 'yugioh', 'lorcana', 'onepiece', 'flesh_and_blood', 'starwars'];
  
  const results = await Promise.allSettled(
    games.map(game => searchGameLocal(query, game, perGame))
  );

  let all = [];
  results.forEach(r => {
    if (r.status === 'fulfilled') all = [...all, ...r.value];
  });

  return all.slice(0, limit);
}


