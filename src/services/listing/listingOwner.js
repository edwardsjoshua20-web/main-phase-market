import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { findInventoryMatch } from '@/services/inventory/inventoryCore';
import {
  LISTING_PERSISTENCE_TYPES,
  getListingIdentity,
  isCustomerFacingListing,
  isListingSellable,
  normalizeListing,
  normalizeListingStatus
} from './listingCore';

async function normalizeRows(promise, options = {}) {
  const rows = await promise;
  return (Array.isArray(rows) ? rows : []).map((row) => normalizeListing(row, options));
}

function matchesFilter(row = {}, filter = {}) {
  return Object.entries(filter || {}).every(([key, value]) => String(row?.[key] ?? '') === String(value ?? ''));
}

function compareSort(sort = '-created_date') {
  const desc = String(sort || '').startsWith('-');
  const field = desc ? String(sort).slice(1) : String(sort || 'created_date');
  return (left, right) => {
    const leftValue = left?.[field];
    const rightValue = right?.[field];
    if (typeof leftValue === 'number' || typeof rightValue === 'number') {
      return desc ? Number(rightValue || 0) - Number(leftValue || 0) : Number(leftValue || 0) - Number(rightValue || 0);
    }
    return desc
      ? String(rightValue || '').localeCompare(String(leftValue || ''))
      : String(leftValue || '').localeCompare(String(rightValue || ''));
  };
}

export const listingOwner = {
  persistenceTypes: LISTING_PERSISTENCE_TYPES,
  normalizeListing,
  normalizeStatus: normalizeListingStatus,
  getIdentity: getListingIdentity,
  isSellable: isListingSellable,
  isCustomerFacing: isCustomerFacingListing,

  async listCardListings(sort = '-created_date', limit) {
    return normalizeRows(inventoryOwner.listCardListings(sort, limit));
  },

  async filterCardListings(filter = {}, sort = '-created_date', limit) {
    return normalizeRows(inventoryOwner.filterCardListings(filter, sort, limit));
  },

  async getCardListingById(id) {
    const listing = await inventoryOwner.getCardListingById(id);
    return listing ? normalizeListing(listing) : null;
  },

  async listProductListings(sort = '-created_date', limit) {
    return normalizeRows(inventoryOwner.listProductListings(sort, limit));
  },

  async filterProductListings(filter = {}, sort = '-created_date', limit) {
    return normalizeRows(inventoryOwner.filterProductListings(filter, sort, limit));
  },

  async getProductListingById(id) {
    const listing = await inventoryOwner.getProductListingById(id);
    return listing ? normalizeListing(listing) : null;
  },

  async getListing(id, options = {}) {
    if (!id) return null;
    if (options.persistenceType === LISTING_PERSISTENCE_TYPES.PRODUCT) return this.getProductListingById(id);
    if (options.persistenceType === LISTING_PERSISTENCE_TYPES.CARD) return this.getCardListingById(id);
    return await this.getCardListingById(id) || await this.getProductListingById(id);
  },

  async listListings(options = {}) {
    const {
      filter = {},
      sort = '-created_date',
      limit,
      includeCards = true,
      includeProducts = true,
      sellableOnly = false,
      game = 'all'
    } = options;

    const [cards, products] = await Promise.all([
      includeCards ? this.listCardListings(sort, options.cardLimit || limit) : Promise.resolve([]),
      includeProducts ? this.listProductListings(sort, options.productLimit || limit) : Promise.resolve([])
    ]);

    const rows = [...cards, ...products]
      .filter((row) => matchesFilter(row, filter))
      .filter((row) => game === 'all' || row.game === game)
      .filter((row) => !sellableOnly || this.isSellable(row))
      .sort(compareSort(sort));

    return typeof limit === 'number' ? rows.slice(0, limit) : rows;
  },

  async listStorefrontListings(options = {}) {
    const rows = await this.listListings({
      includeCards: true,
      includeProducts: options.includeProducts ?? true,
      sellableOnly: options.sellableOnly ?? false,
      filter: { status: 'active' },
      sort: options.sort || '-created_date',
      limit: options.limit,
      cardLimit: options.cardLimit || 5000,
      productLimit: options.productLimit || 500,
      game: options.game || 'all'
    });
    return rows.filter((row) => this.isCustomerFacing(row));
  },

  async findListingForCatalogCard(catalogItem = {}, options = {}) {
    const inventoryRows = options.inventoryListings || await this.filterCardListings({ status: 'active' }, '-created_date', options.inventoryLimit || 1000);
    const match = findInventoryMatch(catalogItem, inventoryRows, catalogItem.game);
    return match ? normalizeListing(match) : null;
  },

  async createListing(data = {}, options = {}) {
    const persistenceType = options.persistenceType || getListingIdentity(data).persistenceType;
    if (persistenceType === LISTING_PERSISTENCE_TYPES.PRODUCT) {
      return normalizeListing(await inventoryOwner.createProductListing(data));
    }
    return normalizeListing(await inventoryOwner.createCardListing(data));
  },

  async updateListing(id, data = {}, options = {}) {
    const persistenceType = options.persistenceType || data.listing_persistence_type || data.persistence_type;
    if (persistenceType === LISTING_PERSISTENCE_TYPES.PRODUCT) {
      return normalizeListing(await inventoryOwner.updateProductListing(id, data));
    }
    if (persistenceType === LISTING_PERSISTENCE_TYPES.CARD) {
      return normalizeListing(await inventoryOwner.updateCardListing(id, data));
    }
    const existing = await this.getListing(id);
    const resolvedType = existing?.listing_persistence_type || LISTING_PERSISTENCE_TYPES.CARD;
    return this.updateListing(id, data, { persistenceType: resolvedType });
  },

  async archiveListing(id, options = {}) {
    return this.updateListing(id, { status: 'archived' }, options);
  },

  async deleteListing(id, options = {}) {
    const persistenceType = options.persistenceType;
    if (persistenceType === LISTING_PERSISTENCE_TYPES.PRODUCT) {
      return inventoryOwner.deleteProductListing(id);
    }
    if (persistenceType === LISTING_PERSISTENCE_TYPES.CARD) {
      return inventoryOwner.deleteCardListing(id);
    }
    const existing = await this.getListing(id);
    if (!existing) return null;
    return this.deleteListing(id, { persistenceType: existing.listing_persistence_type });
  },

  async getListingForCheckout(id) {
    const listing = await this.getListing(id);
    if (!listing) return null;
    return normalizeListing(listing);
  }
};

export default listingOwner;
