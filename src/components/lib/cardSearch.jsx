import { searchFabCatalog } from '@/lib/fabLocalCatalog';
import { searchLorcanaCatalog } from '@/lib/lorcanaLocalCatalog';
import { searchMtgCatalog } from '@/lib/mtgLocalCatalog';
import { searchOnePieceCatalog } from '@/lib/onePieceLocalCatalog';
import { searchPokemonCatalog } from '@/lib/pokemonLocalCatalog';
import { searchStarWarsCatalog } from '@/lib/starwarsLocalCatalog';
import { searchYugiohCatalog } from '@/lib/yugiohLocalCatalog';

const normalizeOnePieceImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  if (url.includes('raw.githubusercontent.com/')) {
    return url.replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/');
  }
  return url;
};

export const sortCardsByRelevance = (cards, query) => {
  const queryLower = query.toLowerCase();
  return cards.sort((a, b) => {
    const aNameLower = a.name.toLowerCase();
    const bNameLower = b.name.toLowerCase();

    if (aNameLower === queryLower) return -1;
    if (bNameLower === queryLower) return 1;

    if (aNameLower.startsWith(queryLower) && !bNameLower.startsWith(queryLower)) return -1;
    if (bNameLower.startsWith(queryLower) && !aNameLower.startsWith(queryLower)) return 1;

    return 0;
  });
};

const searchMagicCards = async (query, limit = 50) => searchMtgCatalog(query, limit);

const searchPokemonCards = async (query, limit = 500, skip = 0) => {
  const results = await searchPokemonCatalog(query, limit + skip);
  return results.slice(skip);
};

const searchYugiohCards = async (query, limit = 50) => searchYugiohCatalog(query, limit);

const searchLorcanaCards = async (query, limit = 50) => searchLorcanaCatalog(query, limit);

const searchOnePieceCards = async (query, limit = 50) => searchOnePieceCatalog(query, limit);

const searchFleshAndBloodCards = async (query, limit = 50) => {
  const cards = await searchFabCatalog(query, limit);
  return cards.map((card) => ({
    ...card,
    game: 'fab'
  }));
};

const searchStarWarsCards = async (query, limit = 50) => searchStarWarsCatalog(query, limit);

export const searchCards = async (query, game, limit = 50, skip = 0) => {
  if (!query || query.length < 2) return [];

  try {
    let results = [];

    if (game === 'magic') {
      results = await searchMagicCards(query, limit);
    } else if (game === 'pokemon') {
      results = await searchPokemonCards(query, limit, skip);
    } else if (game === 'yugioh') {
      results = await searchYugiohCards(query, limit);
    } else if (game === 'lorcana') {
      results = await searchLorcanaCards(query, limit);
    } else if (game === 'onepiece') {
      results = await searchOnePieceCards(query, limit);
    } else if (game === 'fab' || game === 'flesh_and_blood') {
      results = await searchFleshAndBloodCards(query, limit);
    } else if (game === 'starwars') {
      results = await searchStarWarsCards(query, limit);
    }

    return sortCardsByRelevance(results, query);
  } catch (error) {
    console.error('Card search failed:', error);
    return [];
  }
};
