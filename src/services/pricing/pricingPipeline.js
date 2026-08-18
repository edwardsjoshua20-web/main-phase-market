import { normalizePriceNumber } from '@/services/pricing/pricePolicy';
import { resolvePricingState } from '@/services/pricing/pricingCore';

export function resolveCardPricing(raw = {}, options = {}) {
  const pricing = resolvePricingState(raw, options);
  const costBasis = normalizePriceNumber(raw.cost_basis ?? raw.cost ?? null);

  return {
    marketPrice: pricing.market_price,
    targetPrice: pricing.target_price,
    sellPrice: pricing.sell_price,
    displayPrice: pricing.display_price ?? 0,
    costBasis,
    sourceCount: pricing.source_count,
    sources: pricing.sources,
    identityKey: pricing.identity_key,
    status: pricing.status,
    stale: pricing.stale,
    fallbackReason: pricing.fallback_reason
  };
}

export function resolveDeckItemUnitPrice(item = {}) {
  const pricing = resolveCardPricing(item);
  return normalizePriceNumber(
    pricing.sellPrice
    ?? pricing.marketPrice
    ?? pricing.targetPrice
    ?? item.price
    ?? 0
  ) || 0;
}

export function calculateDeckValue(items = []) {
  return items.reduce((sum, item) => {
    const quantity = Number(item?.quantity || 1) || 1;
    return sum + (resolveDeckItemUnitPrice(item) * quantity);
  }, 0);
}

export function normalizeInventoryPricing(card = {}) {
  const pricing = resolveCardPricing(card);

  return {
    market_price: pricing.marketPrice,
    target_price: pricing.targetPrice,
    sell_price: pricing.sellPrice,
    display_price: pricing.displayPrice,
    cost_basis: pricing.costBasis,
    pricing_source_count: pricing.sourceCount,
    pricing_sources: pricing.sources
  };
}
