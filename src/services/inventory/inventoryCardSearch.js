import { backend } from '@/services/backend';
import { searchMtgCatalog } from '@/lib/mtgLocalCatalog';

function sortInventorySearchResults(results, query) {
  const searchLower = String(query || '').toLowerCase();

  return [...results].sort((a, b) => {
    const aName = String(a.name || '').toLowerCase();
    const bName = String(b.name || '').toLowerCase();

    const aExact = aName === searchLower ? 0 : 1;
    const bExact = bName === searchLower ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    const aStarts = aName.startsWith(searchLower) ? 0 : 1;
    const bStarts = bName.startsWith(searchLower) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    return aName.localeCompare(bName);
  });
}

async function searchYugiohInventoryCards(query) {
  const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`);
  const data = await response.json();

  if (!data.data) return [];

  return data.data.map((card) => {
    const cardSet = card.card_sets?.[0];
    return {
      id: card.id,
      name: card.name,
      set_name: cardSet?.set_name || 'Unknown Set',
      set_code: cardSet?.set_code || '',
      card_number: cardSet?.set_code || card.id,
      rarity: cardSet?.set_rarity || 'common',
      image_url: card.card_images?.[0]?.image_url,
      price: card.card_prices?.[0]?.tcgplayer_price ? parseFloat(card.card_prices[0].tcgplayer_price) : null,
      type: card.type,
      game: 'yugioh'
    };
  });
}

async function searchPokemonInventoryCards(query) {
  const apiResponse = await backend.actions.invoke('searchPokemonCards', { query, page: 1, pageSize: 100 });
  const pokemonCards = apiResponse.data?.data || [];

  return pokemonCards.map((card) => ({
    id: card.id,
    name: card.name,
    set_name: card.set?.name || 'Unknown Set',
    set_code: card.set?.id ? card.set.id.toUpperCase() : 'UNK',
    card_number: card.number || '',
    rarity: card.rarity || 'Common',
    image_url: card.images?.small,
    price: null,
    type: 'Pokemon',
    game: 'pokemon',
    finish: 'normal',
    finishLabel: 'Normal',
    availableFinishes: [],
    allPrices: {}
  }));
}

export async function searchInventoryCards(query, game) {
  if (!query || query.length < 2) {
    return [];
  }

  let formattedResults = [];

  if (game === 'magic') {
    formattedResults = await searchMtgCatalog(query, 100);
  } else if (game === 'yugioh') {
    formattedResults = await searchYugiohInventoryCards(query);
  } else if (game === 'pokemon') {
    formattedResults = await searchPokemonInventoryCards(query);
  }

  return sortInventorySearchResults(formattedResults, query);
}
