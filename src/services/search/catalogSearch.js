import { searchCards as searchLegacyCards } from '@/components/lib/cardSearch';
import { searchFabCatalog } from '@/lib/fabLocalCatalog';
import { searchLorcanaCatalog } from '@/lib/lorcanaLocalCatalog';
import { searchMtgCatalogSuggestions } from '@/lib/mtgLocalCatalog';
import { searchOnePieceCatalog } from '@/lib/onePieceLocalCatalog';
import { searchPokemonCatalog } from '@/lib/pokemonLocalCatalog';
import { searchStarWarsCatalog } from '@/lib/starwarsLocalCatalog';
import { searchYugiohCatalog } from '@/lib/yugiohLocalCatalog';

function withCommonCardFields(card, fields = {}) {
  return {
    ...card,
    set_code: card.set_code || card.set_id || fields.set_code || 'UNK',
    card_number: card.card_number || fields.card_number || '',
    rarity: card.rarity || fields.rarity || '',
    game: card.game || fields.game
  };
}

export async function searchCatalogByGame(query, game, limit = 5) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];

  switch (game) {
    case 'pokemon':
      return (await searchPokemonCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'pokemon', rarity: 'Common' })
      );
    case 'magic':
      return (await searchMtgCatalogSuggestions(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'magic', rarity: 'Common' })
      );
    case 'yugioh':
      return (await searchYugiohCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'yugioh' })
      );
    case 'lorcana':
      return (await searchLorcanaCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'lorcana', rarity: 'Common' })
      );
    case 'onepiece':
      return (await searchOnePieceCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'onepiece', set_code: 'OP' })
      );
    case 'flesh_and_blood':
    case 'fab':
      return (await searchFabCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'flesh_and_blood' })
      );
    case 'starwars':
      return (await searchStarWarsCatalog(normalizedQuery, limit)).map((card) =>
        withCommonCardFields(card, { game: 'starwars', set_code: 'SWU' })
      );
    default:
      return (await searchLegacyCards(normalizedQuery, game, limit)).map((card) =>
        withCommonCardFields(card, { game })
      );
  }
}

export async function searchCatalogAcrossGames(query, perGameLimit = 2, totalLimit = 10) {
  const searches = await Promise.all([
    searchCatalogByGame(query, 'pokemon', perGameLimit),
    searchCatalogByGame(query, 'magic', perGameLimit),
    searchCatalogByGame(query, 'yugioh', perGameLimit),
    searchCatalogByGame(query, 'lorcana', perGameLimit),
    searchCatalogByGame(query, 'onepiece', perGameLimit),
    searchCatalogByGame(query, 'flesh_and_blood', perGameLimit),
    searchCatalogByGame(query, 'starwars', perGameLimit)
  ]);

  return searches.flat().slice(0, totalLimit);
}
