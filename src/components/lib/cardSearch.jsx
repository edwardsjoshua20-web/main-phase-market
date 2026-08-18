import { searchOwner } from '@/services/search/searchOwner';

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

export const searchCards = async (query, game, limit = 50, skip = 0) => {
  if (!query || query.length < 2) return [];

  try {
    return searchOwner.searchByGame(query, game, limit + skip).then((results) => results.slice(skip));
  } catch (error) {
    console.error('Card search failed:', error);
    return [];
  }
};
