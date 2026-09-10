import { backend } from '@/services/backend';
import { inventoryListings } from '@/services/inventoryListings';
import { getInventoryCardMergeKey } from '@/components/admin/cardInventorySnapshot';
import { pricingOwner } from '@/services/pricing/pricingOwner';
import {
  INVENTORY_ENTITY_TYPES,
  applyInventoryDecrease,
  applyInventoryIncrease,
  assertInventoryAvailable,
  buildInventoryIdentityKey,
  findInventoryMatch,
  findStoreStockMatch,
  getInventoryStockState,
  normalizeInventoryIdentity,
  normalizeInventoryQuantity
} from '@/services/inventory/inventoryCore';

function normalizeProductListing(product) {
  const state = getInventoryStockState(product);
  const priced = pricingOwner.applyPricingProjection(product);
  return {
    ...priced,
    listing_id: product.id,
    inventory_entity_type: INVENTORY_ENTITY_TYPES.PRODUCT,
    inventory_type: product.product_type || 'product',
    inventory_identity: normalizeInventoryIdentity({ ...priced, inventory_entity_type: INVENTORY_ENTITY_TYPES.PRODUCT }),
    inventory_identity_key: buildInventoryIdentityKey({ ...priced, inventory_entity_type: INVENTORY_ENTITY_TYPES.PRODUCT }),
    quantity: state.quantity,
    in_stock: state.inStock
  };
}

function normalizeCardListing(card) {
  const normalized = inventoryListings.normalize(card);
  const priced = pricingOwner.applyPricingProjection(normalized);
  return {
    ...priced,
    inventory_entity_type: INVENTORY_ENTITY_TYPES.CARD,
    inventory_identity: normalizeInventoryIdentity({ ...priced, inventory_entity_type: INVENTORY_ENTITY_TYPES.CARD }),
    inventory_identity_key: buildInventoryIdentityKey({ ...priced, inventory_entity_type: INVENTORY_ENTITY_TYPES.CARD }),
    quantity: getInventoryStockState(priced).quantity,
    in_stock: getInventoryStockState(priced).inStock
  };
}

function sanitizeQuantityPayload(data = {}) {
  if (!Object.prototype.hasOwnProperty.call(data, 'quantity')) return data;
  return {
    ...data,
    quantity: normalizeInventoryQuantity(data.quantity)
  };
}

async function mapProductRows(promise) {
  const rows = await promise;
  return rows.map(normalizeProductListing);
}

export const inventoryOwner = {
  entityTypes: INVENTORY_ENTITY_TYPES,
  normalizeIdentity: normalizeInventoryIdentity,
  buildIdentityKey: buildInventoryIdentityKey,
  getStockState: getInventoryStockState,
  assertAvailable: assertInventoryAvailable,
  findInventoryMatch,
  findStoreStockMatch,

  summarizeCatalogCardAvailability(catalogItem = {}, inventoryRows = []) {
    const target = normalizeInventoryIdentity({ ...catalogItem, game: catalogItem.game || 'magic' });
    const matches = (Array.isArray(inventoryRows) ? inventoryRows : []).filter((row) => {
      const identity = normalizeInventoryIdentity(row);
      if (target.game && identity.game && target.game !== identity.game) return false;
      if (target.canonicalCardId && identity.canonicalCardId) return target.canonicalCardId === identity.canonicalCardId;
      return Boolean(target.name && identity.name === target.name);
    });
    const sellable = matches.filter((row) => getInventoryStockState(row).status === 'active');
    const quantity = sellable.reduce((sum, row) => sum + getInventoryStockState(row).availableQuantity, 0);
    const pricedListing = sellable.find((row) => getInventoryStockState(row).inStock && row.display_price != null)
      || sellable.find((row) => row.display_price != null)
      || null;
    return { inStock: quantity > 0, quantity, listing: pricedListing, matchingListingCount: sellable.length };
  },

  async getCatalogCardAvailability(catalogItem = {}) {
    const oracleId = String(catalogItem.oracle_id || catalogItem.catalog_oracle_id || '').trim();
    const name = String(catalogItem.name || catalogItem.product_name || catalogItem.card_name || '').trim();
    const filter = oracleId
      ? { description: { $regex: `Oracle ID:\\s*${oracleId}`, $options: 'i' }, status: 'active' }
      : { name, status: 'active' };
    const rows = await this.filterCardListings(filter, '-created_date', 100);
    return this.summarizeCatalogCardAvailability(catalogItem, rows);
  },

  async getCatalogCardsAvailability(catalogItems = []) {
    const items = Array.isArray(catalogItems) ? catalogItems : [];
    const byOracleId = new Map(items
      .map((item) => [String(item?.oracle_id || item?.catalog_oracle_id || '').trim().toLowerCase(), item])
      .filter(([oracleId]) => oracleId));
    if (byOracleId.size === 0) return {};

    try {
      const response = await backend.actions.invoke('getCardCommerce', {
        oracleIds: [...byOracleId.keys()],
        cards: [...byOracleId.entries()].map(([oracleId, item]) => ({
          oracleId,
          name: item?.name || item?.product_name || item?.card_name || ''
        }))
      });
      const summaries = response?.data?.availabilityByOracleId || response?.availabilityByOracleId || {};
      return Object.fromEntries([...byOracleId.keys()].map((oracleId) => {
        const summary = summaries[oracleId] || {};
        return [oracleId, {
          inStock: Boolean(summary.inStock),
          quantity: normalizeInventoryQuantity(summary.quantity),
          matchingListingCount: normalizeInventoryQuantity(summary.matchingListingCount),
          listing: null,
          pricing: summary.pricing || null
        }];
      }));
    } catch (error) {
      if (import.meta.env?.PROD) throw error;
      const entries = await Promise.all([...byOracleId.entries()].map(async ([oracleId, item]) => [
        oracleId,
        await this.getCatalogCardAvailability(item)
      ]));
      return Object.fromEntries(entries);
    }
  },

  normalizeCardListing,
  normalizeProductListing,

  listCardListings(sort = '-created_date', limit) {
    return inventoryListings.list(sort, limit).then((rows) => rows.map(normalizeCardListing));
  },

  filterCardListings(filter = {}, sort = '-created_date', limit) {
    return inventoryListings.filter(filter, sort, limit).then((rows) => rows.map(normalizeCardListing));
  },

  async getCardListingById(id) {
    const row = await inventoryListings.getById(id);
    return row ? normalizeCardListing(row) : null;
  },

  createCardListing(payload) {
    return inventoryListings.create(sanitizeQuantityPayload(payload));
  },

  updateCardListing(id, data) {
    return inventoryListings.update(id, sanitizeQuantityPayload(data));
  },

  deleteCardListing(id) {
    return inventoryListings.delete(id);
  },

  listProductListings(sort = '-created_date', limit) {
    return mapProductRows(backend.data.Product.list(sort, limit));
  },

  filterProductListings(filter = {}, sort = '-created_date', limit) {
    return mapProductRows(backend.data.Product.filter(filter, sort, limit));
  },

  async getProductListingById(id) {
    const rows = await backend.data.Product.filter({ id });
    return rows[0] ? normalizeProductListing(rows[0]) : null;
  },

  createProductListing(payload) {
    return backend.data.Product.create(sanitizeQuantityPayload(payload));
  },

  updateProductListing(id, data) {
    return backend.data.Product.update(id, sanitizeQuantityPayload(data));
  },

  deleteProductListing(id) {
    return backend.data.Product.delete(id);
  },

  async listStorefrontInventory({ game = 'all', includeProducts = true, cardLimit = 5000, productLimit = 500 } = {}) {
    const [cards, products] = await Promise.all([
      this.listCardListings('-created_date', cardLimit),
      includeProducts ? this.listProductListings('-created_date', productLimit) : Promise.resolve([])
    ]);

    const matchesGame = (item) => game === 'all' || item.game === game;
    return [...cards, ...products].filter((item) => item.status === 'active' && matchesGame(item));
  },

  async upsertCardListings(cardsToAdd, existingCards = []) {
    const normalizedCards = Array.isArray(cardsToAdd) ? cardsToAdd : [cardsToAdd];

    for (const cardData of normalizedCards) {
      const mergeKey = getInventoryCardMergeKey(cardData);
      const existingCard = existingCards.find((card) => getInventoryCardMergeKey(card) === mergeKey);

      if (existingCard) {
        const next = applyInventoryIncrease(existingCard, cardData.quantity || 0);
        await this.updateCardListing(existingCard.id, {
          quantity: next.quantity,
          location: cardData.location || existingCard.location
        });
        continue;
      }

      await this.createCardListing(cardData);
    }

    return normalizedCards.length;
  },

  async decrementListingQuantity(entityType, id, quantity, options = {}) {
    const listing = entityType === INVENTORY_ENTITY_TYPES.PRODUCT
      ? await this.getProductListingById(id)
      : await this.getCardListingById(id);
    if (!listing) throw new Error(`Inventory listing not found for ${entityType}:${id}`);
    const next = applyInventoryDecrease(listing, quantity, options);
    const updates = { quantity: next.quantity };
    return entityType === INVENTORY_ENTITY_TYPES.PRODUCT
      ? this.updateProductListing(id, updates)
      : this.updateCardListing(id, updates);
  }
};

export default inventoryOwner;
