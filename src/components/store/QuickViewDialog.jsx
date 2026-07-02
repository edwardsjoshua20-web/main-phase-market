import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Heart } from 'lucide-react';
import { backend } from '@/services/backend';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { addToGuestCart, addToGuestWishlist } from '@/components/utils/guestStorage';

export default function QuickViewDialog({ item, open, onClose, user }) {
  const queryClient = useQueryClient();

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (user) {
        await backend.data.CartItem.create({
          card_id: item.id,
          card_name: item.name,
          card_image: getCardImageUrl(item),
          price: item.price,
          quantity: 1,
          user_email: user.email
        });
      } else {
        addToGuestCart({
          card_id: item.id,
          card_name: item.name,
          card_image: getCardImageUrl(item),
          price: item.price,
          quantity: 1
        });
      }
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries(['cart']);
      toast.success('Added to cart');
      onClose();
    }
  });

  const addToWishlistMutation = useMutation({
    mutationFn: async () => {
      if (user) {
        await backend.data.Wishlist.create({
          user_email: user.email,
          product_id: item.id,
          product_name: item.name,
          product_image: getCardImageUrl(item),
          price: item.price,
          product_type: item.game ? 'card' : 'product'
        });
      } else {
        addToGuestWishlist({
          product_id: item.id,
          product_name: item.name,
          product_image: getCardImageUrl(item),
          price: item.price,
          product_type: item.game ? 'card' : 'product'
        });
      }
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries(['wishlist']);
      toast.success('Added to wishlist');
      onClose();
    }
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-3xl">
        <DialogHeader>
          <DialogTitle>Quick View</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-100 rounded-lg overflow-hidden">
            {getCardImageUrl(item) ? (
              <img 
                src={getCardImageUrl(item)} 
                alt={item.name}
                className="w-full h-full object-contain p-4"
                onError={(event) => handleCardImageError(event, item)}
              />
            ) : (
              <div className="w-full h-64 flex items-center justify-center text-gray-400">
                No Image
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{item.name}</h2>
              {item.set_name && (
                <p className="text-gray-600 mt-1">{item.set_name}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {item.game && (
                <Badge className="capitalize">{item.game}</Badge>
              )}
              {item.rarity && (
                <Badge variant="outline" className="capitalize">{item.rarity}</Badge>
              )}
              {item.condition && (
                <Badge variant="secondary" className="capitalize">{item.condition.replace('_', ' ')}</Badge>
              )}
            </div>

            <div className="border-t border-b py-4">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-blue-600">
                  ${item.price?.toFixed(2)}
                </span>
                <span className="text-sm text-gray-500">
                  {item.quantity} in stock
                </span>
              </div>
            </div>

            {item.description && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={() => addToCartMutation.mutate()}
                disabled={addToCartMutation.isPending || item.quantity === 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Add to Cart
              </Button>
              <Button 
                variant="outline"
                onClick={() => addToWishlistMutation.mutate()}
                disabled={addToWishlistMutation.isPending}
              >
                <Heart className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


