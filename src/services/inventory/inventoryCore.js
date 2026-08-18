export const INVENTORY_ENTITY_TYPES = Object.freeze({
  CARD: 'card',
  PRODUCT: 'product'
});

const GAME_ALIASES = new Map([
  ['mtg', 'magic'],
  ['magic: the gathering', 'magic'],
  ['magic the gathering', 'magic'],
  ['pokemon tcg', 'pokemon'],
  ['pokémon', 'pokemon'],
  ['yu-gi-oh!', 'yugioh'],
  ['yu-gi-oh', 'yugioh'],
  ['yugioh', 'yugioh'],
  ['one piece tcg', 'onepiece'],
  ['one piece', 'onepiece'],
  ['flesh and blood', 'flesh_and_blood'],
  ['fab', 'flesh_and_blood'],
  ['star wars unlimited', 'starwars'],
  ['star wars', 'starwars']
]);

export function normalizeInventoryText(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeInventoryGame(value) {
  const normalized = normalizeInventoryText(value);
  return GAME_ALIASES.get(normalized) || normalized;
}

export function normalizeInventoryQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeInventoryStatus(record = {}) {
  return normalizeInventoryText(record.status || 'active') || 'active';
}

export function normalizeInventoryFinish(record = {}) {
  const candidate = normalizeInventoryText(record.finish || record.catalog_finish || record.printing || record.foil_type);
  if (!candidate || candidate === 'normal' || candidate === 'nonfoil' || candidate === 'non-foil') return 'nonfoil';
  if (candidate.includes('etched')) return 'etched';
  if (candidate.includes('foil')) return 'foil';
  return candidate;
}

export function normalizeInventoryLanguage(record = {}) {
  return normalizeInventoryText(record.language || record.catalog_lang || record.lang || 'en') || 'en';
}

export function normalizeInventoryEntityType(record = {}) {
  const explicit = normalizeInventoryText(record.inventory_entity_type || record.inventory_type || record.entity_type);
  if (explicit === INVENTORY_ENTITY_TYPES.CARD || explicit === 'single_card') return INVENTORY_ENTITY_TYPES.CARD;
  if (explicit === INVENTORY_ENTITY_TYPES.PRODUCT) return INVENTORY_ENTITY_TYPES.PRODUCT;
  const productType = normalizeInventoryText(record.product_type);
  return productType && productType !== 'single_card' ? INVENTORY_ENTITY_TYPES.PRODUCT : INVENTORY_ENTITY_TYPES.CARD;
}

export function normalizeInventoryIdentity(record = {}) {
  return {
    entityType: normalizeInventoryEntityType(record),
    game: normalizeInventoryGame(record.game),
    canonicalCardId: normalizeInventoryText(record.oracle_id || record.catalog_oracle_id || record.card_id || record.cardId || ''),
    name: normalizeInventoryText(record.name || record.product_name),
    setName: normalizeInventoryText(record.set_name || record.setName),
    setCode: normalizeInventoryText(record.set_code || record.setCode),
    collectorNumber: normalizeInventoryText(record.card_number || record.collector_number || record.number),
    finish: normalizeInventoryFinish(record),
    condition: normalizeInventoryText(record.condition || 'near_mint') || 'near_mint',
    language: normalizeInventoryLanguage(record)
  };
}

export function buildInventoryIdentityKey(record = {}) {
  const identity = record.entityType && record.collectorNumber !== undefined ? record : normalizeInventoryIdentity(record);
  return [
    identity.entityType,
    identity.game,
    identity.canonicalCardId || identity.name,
    identity.setCode || identity.setName,
    identity.collectorNumber,
    identity.finish,
    identity.condition,
    identity.language
  ].map((part) => normalizeInventoryText(part) || '-').join('::');
}

export function getInventoryStockState(record = {}, requestedQuantity = 1) {
  const quantity = normalizeInventoryQuantity(record.quantity);
  const status = normalizeInventoryStatus(record);
  const requested = Math.max(1, normalizeInventoryQuantity(requestedQuantity));
  const availableQuantity = status === 'active' ? quantity : 0;
  return {
    quantity,
    availableQuantity,
    status,
    inStock: availableQuantity > 0,
    canFulfill: availableQuantity >= requested
  };
}

export function assertInventoryAvailable(record = {}, requestedQuantity = 1) {
  const state = getInventoryStockState(record, requestedQuantity);
  if (!state.canFulfill) {
    const name = record.name || record.product_name || record.id || 'item';
    throw new Error(`Insufficient inventory for ${name}. Requested ${requestedQuantity}, available ${state.availableQuantity}.`);
  }
  return state;
}

export function applyInventoryDecrease(record = {}, requestedQuantity = 1, options = {}) {
  const requested = Math.max(1, normalizeInventoryQuantity(requestedQuantity));
  const operationId = String(options.operationId || '').trim();
  const appliedOperationIds = new Set(Array.isArray(options.appliedOperationIds) ? options.appliedOperationIds : []);

  if (operationId && appliedOperationIds.has(operationId)) {
    return {
      ...record,
      quantity: normalizeInventoryQuantity(record.quantity),
      inventory_operation_duplicate: true
    };
  }

  assertInventoryAvailable(record, requested);
  return {
    ...record,
    quantity: normalizeInventoryQuantity(record.quantity) - requested,
    inventory_operation_duplicate: false
  };
}

export function applyInventoryIncrease(record = {}, incrementQuantity = 1) {
  return {
    ...record,
    quantity: normalizeInventoryQuantity(record.quantity) + normalizeInventoryQuantity(incrementQuantity)
  };
}

function hasSameKnownValue(left, right, fields) {
  return fields.every((field) => {
    const leftValue = normalizeInventoryText(left[field]);
    const rightValue = normalizeInventoryText(right[field]);
    return !leftValue || !rightValue || leftValue === rightValue;
  });
}

function hasExplicitInventoryValue(record = {}, fields = []) {
  return fields.some((field) => normalizeInventoryText(record[field]));
}

export function findInventoryMatch(catalogItem = {}, inventoryRows = [], game = catalogItem.game) {
  const target = normalizeInventoryIdentity({ ...catalogItem, game });
  const fieldsToMatch = ['collectorNumber', 'setCode', 'setName', 'language', 'finish'];
  if (hasExplicitInventoryValue(catalogItem, ['condition'])) {
    fieldsToMatch.push('condition');
  }

  return (Array.isArray(inventoryRows) ? inventoryRows : []).find((inventoryRow) => {
    const row = normalizeInventoryIdentity(inventoryRow);
    if (target.game && row.game && target.game !== row.game) return false;
    if (target.name && row.name && target.name !== row.name) return false;
    if (target.canonicalCardId && row.canonicalCardId && target.canonicalCardId !== row.canonicalCardId) return false;
    if (!hasSameKnownValue(row, target, fieldsToMatch)) return false;
    return getInventoryStockState(inventoryRow).inStock;
  }) || null;
}

export function findStoreStockMatch(cardLike = {}, inventoryRows = []) {
  const exactMatch = findInventoryMatch(cardLike, inventoryRows, cardLike.game);
  if (exactMatch) return exactMatch;

  const cardName = normalizeInventoryText(cardLike.product_name || cardLike.name);
  if (!cardName) return null;

  return (Array.isArray(inventoryRows) ? inventoryRows : []).find((row) => {
    const rowName = normalizeInventoryText(row.name || row.product_name);
    if (!rowName || !getInventoryStockState(row).inStock) return false;
    return rowName === cardName || rowName.includes(cardName) || cardName.includes(rowName);
  }) || null;
}
