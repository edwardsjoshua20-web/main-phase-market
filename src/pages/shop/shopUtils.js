import { getInventoryCardLanguage } from '@/components/admin/cardInventorySnapshot';

export const GAME_OPTIONS = [
  { value: 'all', label: 'All Games' },
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'onepiece', label: 'One Piece TCG' },
  { value: 'lorcana', label: 'Disney Lorcana' },
  { value: 'flesh_and_blood', label: 'Flesh and Blood' },
  { value: 'starwars', label: 'Star Wars Unlimited' },
  { value: 'other', label: 'Other' }
];

export function normalizeOnePieceImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  if (url.includes('raw.githubusercontent.com/')) {
    return url.replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/');
  }
  return url;
}

export function findInventoryMatch(apiCard, cards, pokemonCards) {
  const inventory = apiCard.game === 'pokemon' ? pokemonCards : cards;

  return inventory.find((inventoryCard) => {
    if (inventoryCard.name !== apiCard.name) return false;
    if (apiCard.game && inventoryCard.game && inventoryCard.game !== apiCard.game) return false;

    if (apiCard.game === 'magic') {
      const inventoryLanguage = getInventoryCardLanguage(inventoryCard);
      const apiLanguage = String(apiCard.lang || 'en').toLowerCase();
      if (inventoryLanguage !== apiLanguage) return false;
    }

    if (inventoryCard.card_number && apiCard.card_number) {
      return inventoryCard.card_number === apiCard.card_number;
    }
    return inventoryCard.set_name === apiCard.set_name;
  });
}

export function enrichSearchResultsWithInventory(searchResults, cards, pokemonCards) {
  if (!searchResults.length) return searchResults;

  return searchResults.map((apiCard) => {
    const inventoryCard = findInventoryMatch(apiCard, cards, pokemonCards);
    const inStockCard = inventoryCard && inventoryCard.quantity > 0 ? inventoryCard : null;

    return {
      ...apiCard,
      inStock: !!inStockCard,
      stockCard: inStockCard
    };
  });
}

export function buildFilterParams(newFilters) {
  /** @type {Record<string, string>} */
  const params = {};

  if (newFilters.type !== 'all') params.type = newFilters.type;
  if (newFilters.game !== 'all') params.game = newFilters.game;
  if (newFilters.search) params.search = newFilters.search;
  if (newFilters.sort && newFilters.sort !== 'newest') params.sort = newFilters.sort;
  if (newFilters.rarity !== 'all') params.rarity = newFilters.rarity;
  if (newFilters.set !== 'all') params.set = newFilters.set;
  if (newFilters.priceMin) params.priceMin = newFilters.priceMin;
  if (newFilters.priceMax) params.priceMax = newFilters.priceMax;
  if (newFilters.inStock) params.inStock = 'true';
  if (newFilters.setType !== 'all') params.setType = newFilters.setType;

  return params;
}

export function hasActiveFilters(filters) {
  return (
    filters.type !== 'all' ||
    filters.game !== 'all' ||
    filters.search ||
    filters.rarity !== 'all' ||
    filters.set !== 'all' ||
    filters.inStock ||
    filters.priceMin ||
    filters.priceMax ||
    filters.sort !== 'newest' ||
    filters.setType !== 'all'
  );
}

export function isValidEmail(value) {
  return Boolean(value && value.includes('@'));
}
