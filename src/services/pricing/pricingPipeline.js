import { buildPriceSource, normalizePriceNumber, summarizePricing } from '@/services/pricing/pricePolicy';

export function resolveCardPricing(raw = {}, options = {}) {
  const fallbackPrice = normalizePriceNumber(
    raw.sell_price
    ?? raw.price
    ?? raw.market_price
    ?? raw.basePrice
    ?? raw.prices?.usd
    ?? null
  );

  const explicitSources = [
    buildPriceSource('cardkingdom', raw.cardkingdom_price),
    buildPriceSource('tcgplayer', raw.tcgplayer_price),
    buildPriceSource('starcitygames', raw.starcitygames_price),
    buildPriceSource('catalog_market', raw.market_price),
    buildPriceSource('catalog_usd', raw.prices?.usd),
    buildPriceSource('catalog_usd_foil', raw.finish === 'foil' ? raw.prices?.usd_foil : null),
    buildPriceSource('catalog_usd_etched', raw.finish === 'etched' ? raw.prices?.usd_etched : null)
  ].filter(Boolean);

  const summary = summarizePricing(explicitSources, {
    floor: options.floor ?? 1,
    strategy: options.strategy ?? 'median',
    fallbackPrice
  });

  const sellPrice = normalizePriceNumber(raw.sell_price ?? raw.price ?? summary.targetPrice ?? summary.marketPrice ?? fallbackPrice);
  const costBasis = normalizePriceNumber(raw.cost_basis ?? raw.cost ?? null);

  return {
    marketPrice: summary.marketPrice,
    targetPrice: summary.targetPrice,
    sellPrice,
    displayPrice: sellPrice ?? summary.marketPrice ?? summary.targetPrice ?? 0,
    costBasis,
    sourceCount: summary.sourceCount,
    sources: summary.sources
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
