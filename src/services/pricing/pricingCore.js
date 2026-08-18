import { buildCardIdentity } from './cardIdentity.js';
import { buildPriceSource, normalizePriceNumber, summarizePricing } from './pricePolicy.js';

const CANONICAL_SELL_PRICE_FIELDS = ['sell_price', 'target_price'];
const MARKET_PRICE_FIELDS = ['market_price', 'cardkingdom_price', 'tcgplayer_price', 'starcitygames_price'];
const LISTING_AUTHORITY_FIELDS = [
  'listing_id',
  'inventory_entity_type',
  'inventory_type',
  'sku',
  'quantity',
  'stock',
  'available_quantity',
  'status'
];

function nestedValue(raw = {}, field = '') {
  return field.split('.').reduce((current, key) => current?.[key], raw);
}

function firstPrice(raw = {}, fields = []) {
  for (const field of fields) {
    const normalized = normalizePriceNumber(nestedValue(raw, field));
    if (normalized != null && normalized > 0) return normalized;
  }
  return null;
}

function buildPositivePriceSource(source, value) {
  const normalized = buildPriceSource(source, value);
  return normalized?.price > 0 ? normalized : null;
}

function positivePrice(value) {
  const normalized = normalizePriceNumber(value);
  return normalized != null && normalized > 0 ? normalized : null;
}

function hasField(raw = {}, field = '') {
  return nestedValue(raw, field) != null;
}

function isListingPriceAuthority(raw = {}) {
  if (hasField(raw, 'sell_price')) return true;
  return LISTING_AUTHORITY_FIELDS.some((field) => hasField(raw, field));
}

export function resolvePricingState(raw = {}, options = {}) {
  const identity = buildCardIdentity(raw);
  const listingPriceAuthority = options.listingPriceAuthority ?? isListingPriceAuthority(raw);
  const explicitSellFields = listingPriceAuthority
    ? [...CANONICAL_SELL_PRICE_FIELDS, 'price']
    : CANONICAL_SELL_PRICE_FIELDS;
  const explicitSellPrice = firstPrice(raw, explicitSellFields);
  const fallbackPrice = positivePrice(options.fallbackPrice ?? raw.basePrice ?? raw.prices?.usd ?? null);
  const priceSources = [
    buildPositivePriceSource('cardkingdom', raw.cardkingdom_price),
    buildPositivePriceSource('tcgplayer', raw.tcgplayer_price),
    buildPositivePriceSource('starcitygames', raw.starcitygames_price),
    buildPositivePriceSource('catalog_market', raw.market_price),
    buildPositivePriceSource('catalog_price', listingPriceAuthority ? null : raw.price),
    buildPositivePriceSource('catalog_usd', raw.prices?.usd),
    buildPositivePriceSource('catalog_usd_foil', raw.finish === 'foil' ? raw.prices?.usd_foil : null),
    buildPositivePriceSource('catalog_usd_etched', raw.finish === 'etched' ? raw.prices?.usd_etched : null)
  ].filter(Boolean);
  const summary = priceSources.length > 0
    ? summarizePricing(priceSources, {
      floor: options.floor ?? 1,
      strategy: options.strategy ?? 'median',
      fallbackPrice: explicitSellPrice ?? fallbackPrice
    })
    : {
      marketPrice: null,
      targetPrice: fallbackPrice,
      sourceCount: 0,
      sources: []
    };

  const marketPrice = summary.marketPrice ?? firstPrice(raw, MARKET_PRICE_FIELDS);
  const targetPrice = summary.targetPrice ?? marketPrice ?? fallbackPrice;
  const sellPrice = positivePrice(explicitSellPrice ?? targetPrice);
  const updatedAt = raw.pricing_updated_at || raw.updated_date || raw.updated_at || raw.created_date || null;

  return {
    identity,
    identity_key: identity.key,
    sell_price: sellPrice,
    market_price: marketPrice,
    target_price: targetPrice,
    display_price: sellPrice ?? marketPrice ?? targetPrice ?? null,
    source_count: summary.sourceCount,
    sources: summary.sources,
    status: sellPrice != null ? 'priced' : 'unavailable',
    stale: false,
    updated_at: updatedAt,
    fallback_reason: sellPrice == null ? 'No positive canonical sell price is available.' : null
  };
}

export function applyPricingProjection(raw = {}, options = {}) {
  const pricing = resolvePricingState(raw, options);
  return {
    ...raw,
    price: pricing.sell_price,
    sell_price: pricing.sell_price,
    market_price: pricing.market_price,
    target_price: pricing.target_price,
    display_price: pricing.display_price,
    pricing_identity_key: pricing.identity_key,
    pricing_state: pricing,
    pricing_source_count: pricing.source_count,
    pricing_sources: pricing.sources
  };
}

export function assertSellPriceAvailable(raw = {}, options = {}) {
  const pricing = resolvePricingState(raw, options);
  if (pricing.sell_price == null || pricing.sell_price <= 0) {
    throw new Error(`No canonical sell price is available for ${raw.name || raw.product_name || raw.id || 'item'}.`);
  }
  return pricing;
}
