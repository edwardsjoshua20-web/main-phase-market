import { INVENTORY_ENTITY_TYPES, buildInventoryIdentityKey, getInventoryStockState, normalizeInventoryIdentity } from '../inventory/inventoryCore.js';
import { applyPricingProjection, resolvePricingState } from '../pricing/pricingCore.js';

export const LISTING_PERSISTENCE_TYPES = Object.freeze({
  CARD: 'Card',
  PRODUCT: 'Product'
});

export const LISTING_STATUS = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DRAFT: 'draft',
  INACTIVE: 'inactive'
});

export function normalizeListingText(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeListingStatus(record = {}) {
  const normalized = normalizeListingText(record.status || LISTING_STATUS.ACTIVE);
  return normalized || LISTING_STATUS.ACTIVE;
}

export function getListingPersistenceType(record = {}) {
  const explicit = String(record.listing_persistence_type || record.persistence_type || '').trim();
  if (explicit === LISTING_PERSISTENCE_TYPES.CARD || explicit === LISTING_PERSISTENCE_TYPES.PRODUCT) {
    return explicit;
  }

  const entityType = normalizeListingText(record.inventory_entity_type || record.inventory_type || record.entity_type);
  if (entityType === INVENTORY_ENTITY_TYPES.PRODUCT || entityType === 'product') {
    return LISTING_PERSISTENCE_TYPES.PRODUCT;
  }

  const productType = normalizeListingText(record.product_type);
  if (productType && productType !== 'single_card' && productType !== 'card') {
    return LISTING_PERSISTENCE_TYPES.PRODUCT;
  }

  return LISTING_PERSISTENCE_TYPES.CARD;
}

export function normalizeProductType(record = {}) {
  const persistenceType = getListingPersistenceType(record);
  const productType = normalizeListingText(record.product_type || record.inventory_type);
  if (persistenceType === LISTING_PERSISTENCE_TYPES.CARD) return 'single_card';
  return productType || 'product';
}

export function getListingIdentity(record = {}) {
  const persistenceType = getListingPersistenceType(record);
  const inventoryEntityType = persistenceType === LISTING_PERSISTENCE_TYPES.PRODUCT
    ? INVENTORY_ENTITY_TYPES.PRODUCT
    : INVENTORY_ENTITY_TYPES.CARD;
  const inventoryIdentity = normalizeInventoryIdentity({
    ...record,
    inventory_entity_type: inventoryEntityType
  });

  return {
    listingId: String(record.listing_id || record.id || record.card_id || record.product_id || '').trim(),
    persistenceType,
    productType: normalizeProductType(record),
    game: inventoryIdentity.game,
    canonicalCardId: inventoryIdentity.canonicalCardId,
    name: inventoryIdentity.name,
    setName: inventoryIdentity.setName,
    setCode: inventoryIdentity.setCode,
    collectorNumber: inventoryIdentity.collectorNumber,
    finish: inventoryIdentity.finish,
    condition: inventoryIdentity.condition,
    language: inventoryIdentity.language,
    inventoryEntityType,
    inventoryIdentity,
    inventoryIdentityKey: buildInventoryIdentityKey(inventoryIdentity)
  };
}

export function getListingStockState(record = {}, requestedQuantity = 1) {
  return getInventoryStockState(record, requestedQuantity);
}

export function isListingSellable(record = {}, options = {}) {
  const status = normalizeListingStatus(record);
  if (status !== LISTING_STATUS.ACTIVE) return false;
  if (record.archived === true || record.deleted === true) return false;
  if (options.requirePrice === false) return true;

  try {
    resolvePricingState(record, { floor: options.priceFloor ?? 0 });
    return true;
  } catch {
    return false;
  }
}

export function normalizeListing(record = {}, options = {}) {
  const identity = getListingIdentity(record);
  const priced = applyPricingProjection(record);
  const stockState = getListingStockState(priced);
  const status = normalizeListingStatus(record);
  const sellable = isListingSellable(priced, options);

  return {
    ...priced,
    id: identity.listingId || priced.id,
    listing_id: identity.listingId || priced.id,
    listing_persistence_type: identity.persistenceType,
    listing_product_type: identity.productType,
    product_type: identity.productType,
    listing_identity: identity,
    listing_identity_key: [
      identity.persistenceType,
      identity.productType,
      identity.game,
      identity.canonicalCardId || identity.name,
      identity.setCode || identity.setName,
      identity.collectorNumber,
      identity.finish,
      identity.condition,
      identity.language
    ].map((part) => normalizeListingText(part) || '-').join('::'),
    inventory_entity_type: identity.inventoryEntityType,
    inventory_identity: identity.inventoryIdentity,
    inventory_identity_key: identity.inventoryIdentityKey,
    status,
    listing_status: status,
    quantity: stockState.quantity,
    in_stock: stockState.inStock,
    is_sellable: sellable,
    can_sell: sellable && (stockState.inStock || Boolean(record.is_preorder))
  };
}
