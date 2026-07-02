import { buildCardIdentity } from './cardIdentity.js';
import { buildPriceSource, summarizePricing } from './pricePolicy.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeSourceSnapshotRow(row = {}, source) {
  const identity = buildCardIdentity(row);

  return {
    identity,
    source,
    name: row.name || row.product_name || '',
    game: identity.game,
    set_name: row.set_name || '',
    set_code: row.set_code || '',
    card_number: row.card_number || row.collector_number || '',
    finish: identity.finish,
    language: identity.language,
    price: row.price
  };
}

export function mergePricingSourceSnapshots(snapshotMap = {}, options = {}) {
  const merged = new Map();

  for (const [sourceName, rows] of Object.entries(snapshotMap)) {
    for (const row of safeArray(rows)) {
      const normalized = normalizeSourceSnapshotRow(row, sourceName);
      const key = normalized.identity.key;

      if (!merged.has(key)) {
        merged.set(key, {
          identity: normalized.identity,
          name: normalized.name,
          game: normalized.game,
          set_name: normalized.set_name,
          set_code: normalized.set_code,
          card_number: normalized.card_number,
          finish: normalized.finish,
          language: normalized.language,
          source_prices: []
        });
      }

      const current = merged.get(key);
      const sourcePrice = buildPriceSource(sourceName, normalized.price);
      if (sourcePrice) {
        current.source_prices.push(sourcePrice);
      }
    }
  }

  return [...merged.values()].map((entry) => {
    const summary = summarizePricing(entry.source_prices, {
      floor: options.floor ?? 1,
      strategy: options.strategy ?? 'median'
    });

    return {
      ...entry,
      market_price: summary.marketPrice,
      target_price: summary.targetPrice,
      source_count: summary.sourceCount
    };
  });
}
