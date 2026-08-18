import { backend } from '@/services/backend';
import {
  addWishlistItem,
  buildWishlistItemKey,
  containsWishlistItem,
  getWishlistCount,
  normalizeWishlistItem,
  normalizeWishlistItems,
  removeWishlistItem,
} from '@/services/wishlist/wishlistCore';

const GUEST_WISHLIST_KEY = 'guestWishlist';
const GUEST_WISHLIST_EVENT = 'guestWishlistUpdated';

const hasBrowserStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const dispatchGuestWishlistUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(GUEST_WISHLIST_EVENT));
  }
};

const readGuestWishlist = () => {
  if (!hasBrowserStorage()) return [];
  try {
    const raw = window.localStorage.getItem(GUEST_WISHLIST_KEY);
    return normalizeWishlistItems(raw ? JSON.parse(raw) : []);
  } catch {
    window.localStorage.removeItem(GUEST_WISHLIST_KEY);
    return [];
  }
};

const writeGuestWishlist = (items) => {
  if (!hasBrowserStorage()) return normalizeWishlistItems(items);
  const normalized = normalizeWishlistItems(items);
  try {
    if (normalized.length > 0) {
      window.localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(normalized));
    } else {
      window.localStorage.removeItem(GUEST_WISHLIST_KEY);
    }
  } catch {
    window.localStorage.removeItem(GUEST_WISHLIST_KEY);
  }
  dispatchGuestWishlistUpdated();
  return normalized;
};

const getUserEmail = (user) => user?.email || '';

const listAuthenticatedWishlist = async (user) => {
  const userEmail = getUserEmail(user);
  if (!userEmail) return [];
  const items = await backend.data.Wishlist.filter({ user_email: userEmail });
  return normalizeWishlistItems(items);
};

const findPersistedWishlistItem = (items, identity) => {
  const key = typeof identity === 'string' ? identity : identity?.wishlist_item_key || buildWishlistItemKey(identity || {});
  const id = typeof identity === 'string' ? identity : identity?.id;
  const productId = typeof identity === 'string' ? identity : identity?.product_id || identity?.card_id || identity?.listing_id || identity?.id;
  return items.find((item) => (
    (id && item.id === id)
    || (key && item.wishlist_item_key === key)
    || (productId && item.product_id === productId && item.wishlist_item_key === key)
  ));
};

const createAuthenticatedWishlistItem = async (user, item) => {
  const userEmail = getUserEmail(user);
  if (!userEmail) throw new Error('Authenticated wishlist requires a user email.');
  const normalized = normalizeWishlistItem(item);
  const { id, ...persistableWishlistItem } = normalized;
  return backend.data.Wishlist.create({
    ...persistableWishlistItem,
    user_email: userEmail,
  });
};

export const wishlistOwner = {
  guestEventName: GUEST_WISHLIST_EVENT,
  getWishlist: async (user) => {
    if (getUserEmail(user)) return listAuthenticatedWishlist(user);
    return readGuestWishlist();
  },
  getGuestWishlist: readGuestWishlist,
  setGuestWishlist: writeGuestWishlist,
  addGuestItem: (item) => writeGuestWishlist(addWishlistItem(readGuestWishlist(), item)),
  removeGuestItem: (identity) => writeGuestWishlist(removeWishlistItem(readGuestWishlist(), identity)),
  clearGuestWishlist: () => writeGuestWishlist([]),
  addItem: async ({ user, item }) => {
    if (!getUserEmail(user)) return wishlistOwner.addGuestItem(item);

    const currentItems = await listAuthenticatedWishlist(user);
    const normalizedIncoming = normalizeWishlistItem(item);
    const existing = findPersistedWishlistItem(currentItems, normalizedIncoming);
    if (existing) return existing;
    return createAuthenticatedWishlistItem(user, normalizedIncoming);
  },
  removeItem: async ({ user, itemIdentity }) => {
    if (!getUserEmail(user)) return wishlistOwner.removeGuestItem(itemIdentity);

    const currentItems = await listAuthenticatedWishlist(user);
    const existing = findPersistedWishlistItem(currentItems, itemIdentity);
    if (!existing) return null;
    return backend.data.Wishlist.delete(existing.id);
  },
  toggleItem: async ({ user, item }) => {
    const currentItems = await wishlistOwner.getWishlist(user);
    const existing = findPersistedWishlistItem(currentItems, item);
    if (existing) {
      await wishlistOwner.removeItem({ user, itemIdentity: existing });
      return { action: 'removed', item: existing };
    }
    const added = await wishlistOwner.addItem({ user, item });
    return { action: 'added', item: added };
  },
  clearWishlist: async ({ user }) => {
    if (!getUserEmail(user)) {
      wishlistOwner.clearGuestWishlist();
      return;
    }
    const currentItems = await listAuthenticatedWishlist(user);
    await Promise.all(currentItems.map((item) => backend.data.Wishlist.delete(item.id)));
  },
  mergeGuestWishlist: async ({ user }) => {
    if (!getUserEmail(user) || !hasBrowserStorage()) return { merged: 0 };
    const guestItems = readGuestWishlist();
    if (guestItems.length === 0) return { merged: 0 };
    const signature = guestItems.map((item) => item.wishlist_item_key).join('|');
    const lockKey = `mainPhaseWishlistMerge:${user.email}`;
    if (window.localStorage.getItem(lockKey) === signature) return { merged: 0 };
    window.localStorage.setItem(lockKey, signature);
    try {
      let merged = 0;
      for (const item of guestItems) {
        const before = await listAuthenticatedWishlist(user);
        if (!findPersistedWishlistItem(before, item)) {
          await wishlistOwner.addItem({ user, item });
          merged += 1;
        }
      }
      wishlistOwner.clearGuestWishlist();
      return { merged };
    } finally {
      window.localStorage.removeItem(lockKey);
    }
  },
  contains: containsWishlistItem,
  getCount: getWishlistCount,
  normalizeWishlistItem,
};
