function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizePriceNumber(value) {
  const parsed = toNumber(value);
  if (parsed == null || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function buildPriceSource(name, value) {
  const normalized = normalizePriceNumber(value);
  if (normalized == null) return null;
  return {
    source: name,
    price: normalized
  };
}

export function getMedianPrice(values = []) {
  const normalized = values
    .map(normalizePriceNumber)
    .filter((value) => value != null)
    .sort((a, b) => a - b);

  if (normalized.length === 0) return null;
  const middle = Math.floor(normalized.length / 2);
  if (normalized.length % 2 === 1) return normalized[middle];
  return Math.round(((normalized[middle - 1] + normalized[middle]) / 2) * 100) / 100;
}

export function computeMpmTargetPrice(priceSources = [], options = {}) {
  const {
    floor = 1,
    strategy = 'median',
    fallbackPrice = null
  } = options;

  const values = priceSources
    .map((entry) => normalizePriceNumber(entry?.price))
    .filter((value) => value != null);

  let target = null;

  if (values.length === 1) {
    target = values[0];
  } else if (values.length >= 2) {
    if (strategy === 'midpoint') {
      target = (Math.min(...values) + Math.max(...values)) / 2;
    } else {
      target = getMedianPrice(values);
    }
  } else {
    target = normalizePriceNumber(fallbackPrice);
  }

  if (target == null) return normalizePriceNumber(fallbackPrice);
  return Math.max(Number(floor) || 0, Math.round(target * 100) / 100);
}

export function summarizePricing(priceSources = [], options = {}) {
  const cleanSources = priceSources.filter(Boolean);
  const marketPrice = getMedianPrice(cleanSources.map((entry) => entry.price));
  const targetPrice = computeMpmTargetPrice(cleanSources, {
    floor: options.floor ?? 1,
    strategy: options.strategy ?? 'median',
    fallbackPrice: options.fallbackPrice ?? marketPrice
  });

  return {
    sourceCount: cleanSources.length,
    marketPrice,
    targetPrice,
    sources: cleanSources
  };
}
