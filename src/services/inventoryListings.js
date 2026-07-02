import { backend } from '@/services/backend';
import {
  buildInventoryCardPayload,
  getInventoryCardFinish,
  getInventoryCardLanguage
} from '@/components/admin/cardInventorySnapshot';
import { normalizeInventoryPricing } from '@/services/pricing/pricingPipeline';

function extractOracleId(card) {
  const match = String(card?.description || '').match(/Oracle ID:\s*([a-f0-9-]{8,})/i);
  return match?.[1] || null;
}

function normalizeInventoryListing(card) {
  const finish = getInventoryCardFinish(card) || 'nonfoil';
  const language = getInventoryCardLanguage(card);
  const oracleId = extractOracleId(card);
  const pricing = normalizeInventoryPricing(card);

  return {
    ...card,
    listing_id: card.id,
    inventory_type: 'single_card',
    finish,
    finish_label: finish === 'foil' ? 'Foil' : finish === 'etched' ? 'Etched Foil' : 'Normal',
    language,
    catalog_oracle_id: oracleId,
    catalog_lang: language,
    catalog_finish: finish,
    ...pricing,
    in_stock: Number(card.quantity || 0) > 0 && card.status === 'active'
  };
}

async function mapRows(promise) {
  const rows = await promise;
  return rows.map(normalizeInventoryListing);
}

export const inventoryListings = {
  normalize: normalizeInventoryListing,

  list(sort = '-created_date', limit) {
    return mapRows(backend.data.Card.list(sort, limit));
  },

  filter(filter = {}, sort = '-created_date', limit) {
    return mapRows(backend.data.Card.filter(filter, sort, limit));
  },

  async getById(id) {
    const rows = await backend.data.Card.filter({ id });
    return rows[0] ? normalizeInventoryListing(rows[0]) : null;
  },

  create(payload) {
    return backend.data.Card.create(payload);
  },

  update(id, data) {
    return backend.data.Card.update(id, data);
  },

  delete(id) {
    return backend.data.Card.delete(id);
  },

  buildPayload(input) {
    return buildInventoryCardPayload(input);
  }
};
