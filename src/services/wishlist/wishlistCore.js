export const WISHLIST_QUERY_KEY = ['wishlist'];

const toSafeString = (value) => String(value ?? '').trim().toLowerCase();

export const resolveWishlistProductId = (item = {}) => {
  return item.product_id
    || item.card_id
    || item.listing_id
    || item.inventory_id
    || item.id
    || '';
};

export const buildWishlistItemKey = (item = {}) => {
  const productId = resolveWishlistProductId(item);
  const parts = [
    ['product', productId],
    ['game', item.game || item.product_type],
    ['set', item.set_code || item.set],
    ['number', item.collector_number || item.number],
    ['finish', item.finish],
    ['condition', item.condition],
    ['language', item.language || item.lang],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => `${name}:${toSafeString(value)}`);

  return parts.length > 0 ? parts.join('|') : `unknown:${toSafeString(item.product_name || item.card_name || item.name || 'item')}`;
};

export const normalizeWishlistPrice = (item = {}) => {
  const price = Number(item.price ?? item.display_price ?? item.sell_price ?? item.market_price ?? 0);
  return Number.isFinite(price) && price > 0 ? price : 0;
};

export const normalizeWishlistItem = (item = {}) => {
  const productId = resolveWishlistProductId(item);
  const wishlistItemKey = item.wishlist_item_key || buildWishlistItemKey(item);

  return {
    ...item,
    id: item.id || `guest-${wishlistItemKey}`,
    wishlist_item_key: wishlistItemKey,
    product_id: productId,
    product_name: item.product_name || item.card_name || item.name || 'Item',
    product_image: item.product_image || item.card_image || item.image_url || item.image || '',
    price: normalizeWishlistPrice(item),
    product_type: item.product_type || item.game || '',
    game: item.game || item.product_type || '',
    set_code: item.set_code || item.set || '',
    set_name: item.set_name || '',
    collector_number: item.collector_number || item.number || '',
    finish: item.finish || '',
    condition: item.condition || '',
    language: item.language || item.lang || '',
  };
};

export const normalizeWishlistItems = (items = []) => {
  return Array.isArray(items)
    ? items.map((item) => normalizeWishlistItem(item)).filter((item) => item.product_id)
    : [];
};

export const findWishlistItemIndex = (items = [], identity) => {
  const normalizedItems = normalizeWishlistItems(items);
  const key = typeof identity === 'string' ? identity : identity?.wishlist_item_key || buildWishlistItemKey(identity || {});
  const id = typeof identity === 'string' ? identity : identity?.id;
  const productId = typeof identity === 'string' ? identity : resolveWishlistProductId(identity || {});

  return normalizedItems.findIndex((item) => {
    if (id && item.id === id) return true;
    if (key && item.wishlist_item_key === key) return true;
    return Boolean(productId && item.product_id === productId && buildWishlistItemKey(item) === key);
  });
};

export const containsWishlistItem = (items = [], identity) => {
  return findWishlistItemIndex(items, identity) >= 0;
};

export const addWishlistItem = (items = [], incoming) => {
  const normalizedItems = normalizeWishlistItems(items);
  const item = normalizeWishlistItem(incoming);
  if (containsWishlistItem(normalizedItems, item)) return normalizedItems;
  return [...normalizedItems, item];
};

export const removeWishlistItem = (items = [], identity) => {
  const normalizedItems = normalizeWishlistItems(items);
  const index = findWishlistItemIndex(normalizedItems, identity);
  if (index < 0) return normalizedItems;
  return normalizedItems.filter((_, itemIndex) => itemIndex !== index);
};

export const toggleWishlistItem = (items = [], item) => {
  return containsWishlistItem(items, item)
    ? removeWishlistItem(items, item)
    : addWishlistItem(items, item);
};

export const getWishlistCount = (items = []) => normalizeWishlistItems(items).length;
