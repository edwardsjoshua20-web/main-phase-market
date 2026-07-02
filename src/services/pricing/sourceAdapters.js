import { buildPriceSource } from '@/services/pricing/pricePolicy';

export function normalizeCompetitorPriceRow({
  cardkingdom,
  tcgplayer,
  starcitygames
} = {}) {
  return [
    buildPriceSource('cardkingdom', cardkingdom),
    buildPriceSource('tcgplayer', tcgplayer),
    buildPriceSource('starcitygames', starcitygames)
  ].filter(Boolean);
}

export const pricingAdapterRegistry = [
  {
    id: 'cardkingdom',
    status: 'planned',
    purpose: 'Normalize Card Kingdom market references into the pricing pipeline.'
  },
  {
    id: 'tcgplayer',
    status: 'planned',
    purpose: 'Normalize TCGplayer market references into the pricing pipeline.'
  },
  {
    id: 'starcitygames',
    status: 'planned',
    purpose: 'Normalize Star City Games market references into the pricing pipeline.'
  }
];
