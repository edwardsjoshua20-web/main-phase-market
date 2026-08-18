import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartOwner } from '@/services/cart/cartOwner';
import { CART_QUERY_KEY } from '@/services/cart/cartCore';

const cartQueryKeyFor = (user) => [...CART_QUERY_KEY, user?.email || 'guest'];

export function useCartOwner(user) {
  const queryClient = useQueryClient();
  const queryKey = cartQueryKeyFor(user);

  const invalidateCart = () => {
    queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
  };

  const cartQuery = useQuery({
    queryKey,
    queryFn: () => cartOwner.getCart(user),
    enabled: user !== undefined,
    staleTime: 0,
  });

  useEffect(() => {
    const handleGuestCartUpdated = () => invalidateCart();
    window.addEventListener(cartOwner.guestEventName, handleGuestCartUpdated);
    return () => window.removeEventListener(cartOwner.guestEventName, handleGuestCartUpdated);
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    cartOwner.mergeGuestCart({ user })
      .then(() => {
        if (!cancelled) invalidateCart();
      })
      .catch(() => {
        if (!cancelled) invalidateCart();
      });
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const addMutation = useMutation({
    mutationFn: ({ item, quantity = 1 }) => cartOwner.addItem({ user, item, quantity }),
    onSuccess: invalidateCart,
  });

  const setQuantityMutation = useMutation({
    mutationFn: ({ itemIdentity, quantity }) => cartOwner.setQuantity({ user, itemIdentity, quantity }),
    onSuccess: invalidateCart,
  });

  const removeMutation = useMutation({
    mutationFn: (itemIdentity) => cartOwner.removeItem({ user, itemIdentity }),
    onSuccess: invalidateCart,
  });

  const clearMutation = useMutation({
    mutationFn: () => cartOwner.clearCart({ user }),
    onSuccess: invalidateCart,
  });

  const items = cartQuery.data || [];

  return {
    items,
    isLoading: cartQuery.isLoading,
    itemCount: cartOwner.getItemCount(items),
    subtotal: cartOwner.getSubtotal(items),
    addItem: (item, quantity = 1) => addMutation.mutateAsync({ item, quantity }),
    setQuantity: (itemIdentity, quantity) => setQuantityMutation.mutateAsync({ itemIdentity, quantity }),
    removeItem: (itemIdentity) => removeMutation.mutateAsync(itemIdentity),
    clearCart: () => clearMutation.mutateAsync(),
    buildCheckoutPayload: () => cartOwner.buildCheckoutPayload(items),
    isMutating: addMutation.isPending || setQuantityMutation.isPending || removeMutation.isPending || clearMutation.isPending,
  };
}
