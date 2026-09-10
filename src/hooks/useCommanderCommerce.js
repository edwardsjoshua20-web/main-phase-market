import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { pricingOwner } from '@/services/pricing/pricingOwner';
import { searchOwner } from '@/services/search/searchOwner';

const PRINTING_LOOKUP_TIMEOUT_MS = 2500;

function commerceCatalogCard(card = {}) {
  return {
    ...card,
    name: card.name || card.card_name,
    game: card.game || 'magic'
  };
}

function withTimeout(promise, fallback, timeoutMs = PRINTING_LOOKUP_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    })
  ]).catch(() => fallback);
}

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
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const fallbackCatalogCards = uniqueCards.map(commerceCatalogCard);
      const [availabilityByOracleId, printings] = await Promise.all([
        inventoryOwner.getCatalogCardsAvailability(fallbackCatalogCards),
        withTimeout(searchOwner.getMagicPreferredPrintingsByOracleIds(uniqueCards.map((card) => card.oracle_id)), [])
      ]);
      const printingByOracleId = new Map(printings.map((printing) => [printing.oracle_id, printing]));
      const entries = uniqueCards.map((card) => {
        const catalogCard = printingByOracleId.get(card.oracle_id) || commerceCatalogCard(card);
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

  return {
    commerceByOracleId: query.data || {},
    loadingCommerce: query.isLoading,
    fetchingCommerce: query.isFetching
  };
}
