// Guest cart/wishlist localStorage management
const CART_KEY = 'guestCart';
const WISHLIST_KEY = 'guestWishlist';

export const getGuestCart = () => {
  try {
    const stored = localStorage.getItem(CART_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const setGuestCart = (cart) => {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('guestCartUpdated'));
};

export const addToGuestCart = (item) => {
  const cart = getGuestCart();
  const existing = cart.find(c => c.card_id === item.card_id);
  if (existing) {
    existing.quantity += item.quantity || 1;
  } else {
    cart.push({ ...item, id: `guest-${item.card_id}-${Date.now()}` });
  }
  setGuestCart(cart);
};

export const removeFromGuestCart = (itemId) => {
  const cart = getGuestCart().filter(item => item.id !== itemId);
  setGuestCart(cart);
};

export const updateGuestCartQuantity = (itemId, quantity) => {
  const cart = getGuestCart();
  if (quantity <= 0) {
    removeFromGuestCart(itemId);
  } else {
    const item = cart.find(c => c.id === itemId);
    if (item) {
      item.quantity = quantity;
      setGuestCart(cart);
    }
  }
};

export const getGuestWishlist = () => {
  try {
    const stored = localStorage.getItem(WISHLIST_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const setGuestWishlist = (wishlist) => {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  window.dispatchEvent(new Event('guestWishlistUpdated'));
};

export const addToGuestWishlist = (item) => {
  const wishlist = getGuestWishlist();
  if (!wishlist.find(w => w.product_id === item.product_id)) {
    wishlist.push({ ...item, id: `guest-${item.product_id}-${Date.now()}` });
    setGuestWishlist(wishlist);
  }
};

export const removeFromGuestWishlist = (itemId) => {
  const wishlist = getGuestWishlist().filter(w => w.id !== itemId);
  setGuestWishlist(wishlist);
};

export const clearGuestStorage = () => {
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(WISHLIST_KEY);
  window.dispatchEvent(new Event('guestCartUpdated'));
  window.dispatchEvent(new Event('guestWishlistUpdated'));
};