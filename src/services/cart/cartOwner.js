import { backend } from '@/services/backend';
import {
  addOrMergeCartItem,
  buildCartItemKey,
  buildCheckoutPayload,
  getCartItemCount,
  getCartSubtotal,
  normalizeCartItem,
  normalizeCartItems,
  normalizeQuantityAllowZero,
  removeCartItem,
  setCartItemQuantity,
} from '@/services/cart/cartCore';

const GUEST_CART_KEY = 'guestCart';
const GUEST_CART_EVENT = 'guestCartUpdated';

const hasBrowserStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const dispatchGuestCartUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(GUEST_CART_EVENT));
  }
};

const readGuestCart = () => {
  if (!hasBrowserStorage()) return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    return normalizeCartItems(raw ? JSON.parse(raw) : []);
  } catch {
    window.localStorage.removeItem(GUEST_CART_KEY);
    return [];
  }
};

const writeGuestCart = (items) => {
  if (!hasBrowserStorage()) return normalizeCartItems(items);
  const normalized = normalizeCartItems(items);
  try {
    if (normalized.length > 0) {
      window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(normalized));
    } else {
      window.localStorage.removeItem(GUEST_CART_KEY);
    }
  } catch {
    window.localStorage.removeItem(GUEST_CART_KEY);
  }
  dispatchGuestCartUpdated();
  return normalized;
};

const getUserEmail = (user) => user?.email || '';

const listAuthenticatedCart = async (user) => {
  const userEmail = getUserEmail(user);
  if (!userEmail) return [];
  const items = await backend.data.CartItem.filter({ user_email: userEmail });
  return normalizeCartItems(items);
};

const createAuthenticatedCartItem = async (user, item) => {
  const userEmail = getUserEmail(user);
  if (!userEmail) throw new Error('Authenticated cart requires a user email.');
  const normalized = normalizeCartItem(item);
  const { id, ...persistableCartItem } = normalized;
  return backend.data.CartItem.create({
    ...persistableCartItem,
    user_email: userEmail,
  });
};

const findPersistedCartItem = (items, identity) => {
  const key = typeof identity === 'string' ? identity : identity?.cart_item_key || buildCartItemKey(identity || {});
  const id = typeof identity === 'string' ? identity : identity?.id;
  const cardId = typeof identity === 'string' ? identity : identity?.card_id || identity?.listing_id || identity?.id;
  return items.find((item) => (
    (id && item.id === id)
    || (key && item.cart_item_key === key)
    || (cardId && item.card_id === cardId && item.cart_item_key === key)
  ));
};

export const cartOwner = {
  guestEventName: GUEST_CART_EVENT,
  getCart: async (user) => {
    if (getUserEmail(user)) return listAuthenticatedCart(user);
    return readGuestCart();
  },
  getGuestCart: readGuestCart,
  setGuestCart: writeGuestCart,
  addGuestItem: (item, quantity = 1) => writeGuestCart(addOrMergeCartItem(readGuestCart(), item, quantity)),
  removeGuestItem: (identity) => writeGuestCart(removeCartItem(readGuestCart(), identity)),
  setGuestQuantity: (identity, quantity) => writeGuestCart(setCartItemQuantity(readGuestCart(), identity, quantity)),
  clearGuestCart: () => writeGuestCart([]),
  addItem: async ({ user, item, quantity = 1 }) => {
    if (!getUserEmail(user)) {
      return cartOwner.addGuestItem(item, quantity);
    }

    const currentItems = await listAuthenticatedCart(user);
    const normalizedIncoming = normalizeCartItem(item, quantity);
    const existing = findPersistedCartItem(currentItems, normalizedIncoming);
    if (existing) {
      return backend.data.CartItem.update(existing.id, {
        quantity: existing.quantity + normalizedIncoming.quantity,
        cart_item_key: existing.cart_item_key || normalizedIncoming.cart_item_key,
      });
    }
    return createAuthenticatedCartItem(user, normalizedIncoming);
  },
  setQuantity: async ({ user, itemIdentity, quantity }) => {
    if (!getUserEmail(user)) {
      return cartOwner.setGuestQuantity(itemIdentity, quantity);
    }

    const currentItems = await listAuthenticatedCart(user);
    const existing = findPersistedCartItem(currentItems, itemIdentity);
    if (!existing) return null;
    const nextQuantity = normalizeQuantityAllowZero(quantity);
    if (nextQuantity <= 0) {
      return backend.data.CartItem.delete(existing.id);
    }
    return backend.data.CartItem.update(existing.id, { quantity: nextQuantity });
  },
  incrementItem: async ({ user, itemIdentity }) => {
    const currentItems = await cartOwner.getCart(user);
    const existing = findPersistedCartItem(currentItems, itemIdentity);
    if (!existing) return null;
    return cartOwner.setQuantity({ user, itemIdentity: existing, quantity: existing.quantity + 1 });
  },
  decrementItem: async ({ user, itemIdentity }) => {
    const currentItems = await cartOwner.getCart(user);
    const existing = findPersistedCartItem(currentItems, itemIdentity);
    if (!existing) return null;
    return cartOwner.setQuantity({ user, itemIdentity: existing, quantity: existing.quantity - 1 });
  },
  removeItem: async ({ user, itemIdentity }) => {
    if (!getUserEmail(user)) {
      return cartOwner.removeGuestItem(itemIdentity);
    }
    const currentItems = await listAuthenticatedCart(user);
    const existing = findPersistedCartItem(currentItems, itemIdentity);
    if (!existing) return null;
    return backend.data.CartItem.delete(existing.id);
  },
  clearCart: async ({ user }) => {
    if (!getUserEmail(user)) {
      cartOwner.clearGuestCart();
      return;
    }
    const currentItems = await listAuthenticatedCart(user);
    await Promise.all(currentItems.map((item) => backend.data.CartItem.delete(item.id)));
  },
  mergeGuestCart: async ({ user }) => {
    if (!getUserEmail(user) || !hasBrowserStorage()) return { merged: 0 };
    const guestItems = readGuestCart();
    if (guestItems.length === 0) return { merged: 0 };
    const signature = guestItems.map((item) => `${item.cart_item_key}:${item.quantity}`).join('|');
    const lockKey = `mainPhaseCartMerge:${user.email}`;
    if (window.localStorage.getItem(lockKey) === signature) return { merged: 0 };
    window.localStorage.setItem(lockKey, signature);
    try {
      for (const item of guestItems) {
        await cartOwner.addItem({ user, item, quantity: item.quantity });
      }
      cartOwner.clearGuestCart();
      return { merged: guestItems.length };
    } finally {
      window.localStorage.removeItem(lockKey);
    }
  },
  getItemCount: getCartItemCount,
  getSubtotal: getCartSubtotal,
  buildCheckoutPayload,
  normalizeCartItem,
};
