export const CART_QUERY_KEY = ['cart'];

export const CART_IDENTITY_FIELDS = [
  'listing_id',
  'card_id',
  'product_id',
  'id',
  'game',
  'set_code',
  'set_name',
  'collector_number',
  'number',
  'finish',
  'condition',
  'language',
  'lang',
];

const toSafeString = (value) => String(value ?? '').trim().toLowerCase();

export const normalizeQuantity = (quantity, fallback = 1) => {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

export const normalizeQuantityAllowZero = (quantity) => {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export const resolveSellableId = (item = {}) => {
  return item.listing_id || item.card_id || item.product_id || item.inventory_id || item.id || '';
};

export const buildCartItemKey = (item = {}) => {
  const stableId = resolveSellableId(item);
  const parts = [
    ['sellable', stableId],
    ['game', item.game],
    ['set', item.set_code || item.set],
    ['number', item.collector_number || item.number],
    ['finish', item.finish],
    ['condition', item.condition],
    ['language', item.language || item.lang],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => `${name}:${toSafeString(value)}`);

  return parts.length > 0 ? parts.join('|') : `unknown:${toSafeString(item.card_name || item.name || 'item')}`;
};

export const normalizeDisplayPrice = (item = {}) => {
  const price = Number(item.sell_price ?? item.price ?? item.display_price ?? item.market_price ?? 0);
  return Number.isFinite(price) && price > 0 ? price : 0;
};

export const normalizeCartItem = (item = {}, quantityOverride) => {
  const quantity = normalizeQuantity(quantityOverride ?? item.quantity ?? 1);
  const cardId = resolveSellableId(item);
  const cartItemKey = item.cart_item_key || buildCartItemKey(item);

  return {
    ...item,
    id: item.id || `guest-${cartItemKey}`,
    cart_item_key: cartItemKey,
    card_id: cardId,
    card_name: item.card_name || item.product_name || item.name || 'Item',
    card_image: item.card_image || item.product_image || item.image_url || item.image || '',
    price: normalizeDisplayPrice(item),
    quantity,
    listing_id: item.listing_id || item.inventory_id || cardId,
    game: item.game || '',
    set_code: item.set_code || item.set || '',
    set_name: item.set_name || '',
    collector_number: item.collector_number || item.number || '',
    finish: item.finish || '',
    condition: item.condition || '',
    language: item.language || item.lang || '',
  };
};

export const normalizeCartItems = (items = []) => {
  return Array.isArray(items)
    ? items.map((item) => normalizeCartItem(item)).filter((item) => item.card_id)
    : [];
};

export const findCartItemIndex = (items = [], identity) => {
  const key = typeof identity === 'string' ? identity : identity?.cart_item_key || buildCartItemKey(identity || {});
  const id = typeof identity === 'string' ? identity : identity?.id;
  const cardId = typeof identity === 'string' ? identity : identity?.card_id || resolveSellableId(identity || {});

  return items.findIndex((item) => {
    if (id && item.id === id) return true;
    if (key && item.cart_item_key === key) return true;
    return Boolean(cardId && item.card_id === cardId && buildCartItemKey(item) === key);
  });
};

export const addOrMergeCartItem = (items = [], incoming, quantity = 1) => {
  const normalizedItems = normalizeCartItems(items);
  const item = normalizeCartItem(incoming, quantity);
  const existingIndex = findCartItemIndex(normalizedItems, item);
  if (existingIndex >= 0) {
    const next = [...normalizedItems];
    next[existingIndex] = {
      ...next[existingIndex],
      quantity: normalizeQuantity(next[existingIndex].quantity + item.quantity),
    };
    return next;
  }

  return [...normalizedItems, item];
};

export const setCartItemQuantity = (items = [], identity, quantity) => {
  const normalizedItems = normalizeCartItems(items);
  const nextQuantity = normalizeQuantityAllowZero(quantity);
  const itemIndex = findCartItemIndex(normalizedItems, identity);
  if (itemIndex < 0) return normalizedItems;
  if (nextQuantity <= 0) {
    return normalizedItems.filter((_, index) => index !== itemIndex);
  }
  return normalizedItems.map((item, index) => (
    index === itemIndex ? { ...item, quantity: nextQuantity } : item
  ));
};

export const removeCartItem = (items = [], identity) => {
  const normalizedItems = normalizeCartItems(items);
  const itemIndex = findCartItemIndex(normalizedItems, identity);
  if (itemIndex < 0) return normalizedItems;
  return normalizedItems.filter((_, index) => index !== itemIndex);
};

export const getCartItemCount = (items = []) => {
  return normalizeCartItems(items).reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0);
};

export const getCartSubtotal = (items = []) => {
  return normalizeCartItems(items).reduce((sum, item) => sum + normalizeDisplayPrice(item) * normalizeQuantity(item.quantity), 0);
};

export const buildCheckoutPayload = (items = []) => {
  return normalizeCartItems(items).map((item) => ({
    card_id: item.card_id,
    cart_item_key: item.cart_item_key,
    quantity: normalizeQuantity(item.quantity),
  }));
};
