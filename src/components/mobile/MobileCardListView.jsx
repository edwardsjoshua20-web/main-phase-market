import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Mail, Heart } from 'lucide-react';

export default function MobileCardListView({ 
  cards, 
  isLoading,
  onAddToCart,
  onRequest,
  onAddToWishlist,
  user
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 px-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3 bg-gray-100 rounded-lg p-3 h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <p className="text-gray-500">No cards found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-20">
      {cards.map((card) => (
        <div key={card.id} className="flex gap-3 bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
          {/* Card Image */}
          <div className="w-24 h-32 bg-gray-100 flex-shrink-0 overflow-hidden">
            {card.image_url ? (
              <img 
                src={card.image_url} 
                alt={card.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>
            )}
          </div>

          {/* Card Details */}
          <div className="flex-1 flex flex-col py-3 pr-3">
            <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{card.name}</h3>
            
            {card.set_name && (
              <p className="text-xs text-gray-500 mt-1">{card.set_name}</p>
            )}
            
            {card.rarity && (
              <Badge variant="outline" className="w-fit mt-1 text-xs">
                {card.rarity}
              </Badge>
            )}

            {/* Price & Actions */}
            <div className="flex items-end justify-between mt-auto">
              <div>
                {card.stockCard ? (
                  <>
                    <p className="text-lg font-bold text-blue-600">${card.stockCard.price?.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{card.stockCard.quantity} in stock</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Out of Stock</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-1">
                {card.stockCard ? (
                  <Button
                    onClick={() => onAddToCart(card.stockCard)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-2"
                  >
                    <ShoppingCart className="w-3 h-3" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => onRequest(card)}
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                  >
                    <Mail className="w-3 h-3" />
                  </Button>
                )}
                {user && (
                  <Button
                    onClick={() => onAddToWishlist(card)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 h-8 px-2"
                  >
                    <Heart className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}