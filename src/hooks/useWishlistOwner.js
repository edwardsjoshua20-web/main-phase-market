import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WISHLIST_QUERY_KEY } from '@/services/wishlist/wishlistCore';
import { wishlistOwner } from '@/services/wishlist/wishlistOwner';

export function useWishlistOwner(user) {
  const queryClient = useQueryClient();
  const queryKey = [...WISHLIST_QUERY_KEY, user?.email || 'guest'];

  const query = useQuery({
    queryKey,
    queryFn: () => wishlistOwner.getWishlist(user),
    enabled: user !== undefined,
    staleTime: 0,
  });

  useEffect(() => {
    const handleGuestUpdate = () => {
      queryClient.invalidateQueries({ queryKey: WISHLIST_QUERY_KEY });
    };
    window.addEventListener(wishlistOwner.guestEventName, handleGuestUpdate);
    return () => window.removeEventListener(wishlistOwner.guestEventName, handleGuestUpdate);
  }, [queryClient]);

  useEffect(() => {
    if (!user?.email) return;
    wishlistOwner.mergeGuestWishlist({ user }).then(() => {
      queryClient.invalidateQueries({ queryKey: WISHLIST_QUERY_KEY });
    });
  }, [queryClient, user?.email]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: WISHLIST_QUERY_KEY });

  const addMutation = useMutation({
    mutationFn: (item) => wishlistOwner.addItem({ user, item }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (itemIdentity) => wishlistOwner.removeItem({ user, itemIdentity }),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: (item) => wishlistOwner.toggleItem({ user, item }),
    onSuccess: invalidate,
  });

  const clearMutation = useMutation({
    mutationFn: () => wishlistOwner.clearWishlist({ user }),
    onSuccess: invalidate,
  });

  const items = query.data || [];

  return {
    items,
    count: wishlistOwner.getCount(items),
    isLoading: query.isLoading,
    contains: (itemIdentity) => wishlistOwner.contains(items, itemIdentity),
    addItem: (item) => addMutation.mutateAsync(item),
    removeItem: (itemIdentity) => removeMutation.mutateAsync(itemIdentity),
    toggleItem: (item) => toggleMutation.mutateAsync(item),
    clearWishlist: () => clearMutation.mutateAsync(),
    isMutating: addMutation.isPending || removeMutation.isPending || toggleMutation.isPending || clearMutation.isPending,
  };
}
