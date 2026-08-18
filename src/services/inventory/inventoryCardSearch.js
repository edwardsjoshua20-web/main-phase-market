import { searchOwner } from '@/services/search/searchOwner';

export async function searchInventoryCards(query, game) {
  if (!query || query.length < 2) {
    return [];
  }

  const results = await searchOwner.searchByGame(query, game, 100, { includeInventory: false });
  return results.map((card) => ({
    ...card,
    set_name: card.set_name || card.set || 'Unknown Set',
    set_code: String(card.set_code || card.set || 'UNK').toUpperCase(),
    card_number: card.card_number || card.collector_number || card.number || card.api_id || card.unique_id || card.id,
    rarity: card.rarity || 'Common',
    image_url: card.image_url || card.image || card.product_image,
    price: card.price || card.market_price || null,
    type: card.type || card.type_line || card.supertype || 'Card',
    game
  }));
}
