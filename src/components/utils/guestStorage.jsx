// Legacy guest storage adapter. Guest cart is owned by Cart Owner; guest wishlist
// is owned by Wishlist Owner. Keep this file as a compatibility boundary only.
import { cartOwner } from '@/services/cart/cartOwner';
import { wishlistOwner } from '@/services/wishlist/wishlistOwner';

export const getGuestCart = () => {
  return cartOwner.getGuestCart();
};

export const setGuestCart = (cart) => {
  return cartOwner.setGuestCart(cart);
};

export const addToGuestCart = (item) => {
  return cartOwner.addGuestItem(item, item.quantity || 1);
};

export const removeFromGuestCart = (itemId) => {
  return cartOwner.removeGuestItem(itemId);
};

export const updateGuestCartQuantity = (itemId, quantity) => {
  return cartOwner.setGuestQuantity(itemId, quantity);
};

export const getGuestWishlist = () => {
  return wishlistOwner.getGuestWishlist();
};

export const setGuestWishlist = (wishlist) => {
  return wishlistOwner.setGuestWishlist(wishlist);
};

export const addToGuestWishlist = (item) => {
  return wishlistOwner.addGuestItem(item);
};

export const removeFromGuestWishlist = (itemId) => {
  return wishlistOwner.removeGuestItem(itemId);
};

export const clearGuestStorage = () => {
  cartOwner.clearGuestCart();
  wishlistOwner.clearGuestWishlist();
};
