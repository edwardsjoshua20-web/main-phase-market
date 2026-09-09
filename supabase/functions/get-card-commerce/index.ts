import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { restRequest } from '../_shared/rest.ts';
import { resolvePricingState } from '../../../src/services/pricing/pricingCore.js';

const MAX_ORACLE_IDS = 200;
const ORACLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEntityRow(row: Record<string, unknown>) {
  const data = row?.data && typeof row.data === 'object'
    ? row.data as Record<string, unknown>
    : {};
  return { ...data, id: String(data.id || row.id || '') };
}

function listingOracleId(listing: Record<string, unknown>, requestedIds: string[]) {
  const direct = String(
    listing.oracle_id || listing.catalog_oracle_id || listing.scryfall_oracle_id || ''
  ).trim().toLowerCase();
  if (requestedIds.includes(direct)) return direct;

  const description = String(listing.description || '').toLowerCase();
  return requestedIds.find((id) => description.includes(id)) || '';
}

function availableQuantity(listing: Record<string, unknown>) {
  const quantity = Number(listing.quantity ?? listing.stock_quantity ?? 0);
  const reserved = Number(listing.reserved_quantity ?? 0);
  return Math.max(0, Number.isFinite(quantity) ? quantity - (Number.isFinite(reserved) ? reserved : 0) : 0);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const payload = await req.json();
    const oracleIds = [...new Set(
      (Array.isArray(payload?.oracleIds) ? payload.oracleIds : [])
        .map((value: unknown) => String(value || '').trim().toLowerCase())
        .filter((value: string) => ORACLE_ID_PATTERN.test(value))
    )].slice(0, MAX_ORACLE_IDS);

    if (oracleIds.length === 0) return jsonResponse({ availabilityByOracleId: {} });

    const identityFilters = oracleIds.flatMap((id) => [
      `data->>oracle_id.eq.${id}`,
      `data->>catalog_oracle_id.eq.${id}`,
      `data->>scryfall_oracle_id.eq.${id}`,
      `data->>description.ilike.*${id}*`
    ]);
    const params = new URLSearchParams({
      select: 'data,id',
      entity_name: 'eq.Card',
      'data->>status': 'eq.active',
      or: `(${identityFilters.join(',')})`
    });
    const rows = await restRequest(`/rest/v1/app_entities?${params.toString()}`);
    const grouped = new Map<string, Record<string, unknown>[]>();

    for (const rawRow of Array.isArray(rows) ? rows : []) {
      const listing = normalizeEntityRow(rawRow as Record<string, unknown>);
      const oracleId = listingOracleId(listing, oracleIds);
      if (!oracleId) continue;
      grouped.set(oracleId, [...(grouped.get(oracleId) || []), listing]);
    }

    const availabilityByOracleId = Object.fromEntries(oracleIds.map((oracleId) => {
      const listings = grouped.get(oracleId) || [];
      const quantity = listings.reduce((sum, listing) => sum + availableQuantity(listing), 0);
      const priced = listings
        .map((listing) => ({ listing, pricing: resolvePricingState(listing) }))
        .find(({ listing, pricing }) => availableQuantity(listing) > 0 && pricing.display_price != null)
        || listings
          .map((listing) => ({ listing, pricing: resolvePricingState(listing) }))
          .find(({ pricing }) => pricing.display_price != null);

      return [oracleId, {
        inStock: quantity > 0,
        quantity,
        matchingListingCount: listings.length,
        pricing: priced ? {
          display_price: priced.pricing.display_price,
          sell_price: priced.pricing.sell_price,
          market_price: priced.pricing.market_price,
          target_price: priced.pricing.target_price,
          source_count: priced.pricing.source_count,
          status: priced.pricing.status,
          stale: priced.pricing.stale,
          updated_at: priced.pricing.updated_at
        } : null
      }];
    }));

    return jsonResponse({ availabilityByOracleId });
  } catch (error) {
    console.error('get-card-commerce error:', error);
    return errorResponse(error);
  }
});
