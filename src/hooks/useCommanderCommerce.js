import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { pricingOwner } from '@/services/pricing/pricingOwner';
import { searchOwner } from '@/services/search/searchOwner';

export function useCommanderCommerce(cards = []) {
  const uniqueCards = useMemo(() => {
    const byOracleId = new Map();
    for (const card of cards) {
      if (card?.oracle_id && !byOracleId.has(card.oracle_id)) byOracleId.set(card.oracle_id, card);
    }
    return [...byOracleId.values()];
  }, [cards]);
  const identityKey = uniqueCards.map((card) => card.oracle_id).sort().join(',');

  const query = useQuery({
    queryKey: ['commander-card-commerce', identityKey],
    enabled: uniqueCards.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const printings = await searchOwner.getMagicPreferredPrintingsByOracleIds(uniqueCards.map((card) => card.oracle_id));
      const printingByOracleId = new Map(printings.map((printing) => [printing.oracle_id, printing]));
      const catalogCards = uniqueCards.map((card) => (
        printingByOracleId.get(card.oracle_id) || { ...card, name: card.card_name, game: 'magic' }
      ));
      const availabilityByOracleId = await inventoryOwner.getCatalogCardsAvailability(catalogCards);
      const entries = uniqueCards.map((card) => {
        const catalogCard = printingByOracleId.get(card.oracle_id) || { ...card, name: card.card_name, game: 'magic' };
        const availability = availabilityByOracleId[card.oracle_id] || {
          inStock: false,
          quantity: 0,
          matchingListingCount: 0,
          listing: null,
          pricing: null
        };
        const pricing = availability.pricing || pricingOwner.resolvePricingState(catalogCard);
        return [card.oracle_id, { card: catalogCard, availability, pricing }];
      });
      return Object.fromEntries(entries);
    }
  });

  return { commerceByOracleId: query.data || {}, loadingCommerce: query.isLoading };
}
