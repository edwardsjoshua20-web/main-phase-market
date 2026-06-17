import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Badge } from "@/components/ui/badge";
import { Heart } from 'lucide-react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const conditionLabels = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  excellent: 'Excellent',
  good: 'Good',
  light_played: 'Light Played',
  played: 'Played',
  poor: 'Poor'
};

const gameLabels = {
  magic: 'Magic',
  pokemon: 'Pokémon',
  yugioh: 'Yu-Gi-Oh!'
};

export default function CardGrid({ cards, user }) {
  const [savePopup, setSavePopup] = useState(null); // card id
  const [saving, setSaving] = useState(null);
  const queryClient = useQueryClient();

  const { data: wishlistItems = [] } = useQuery({
    queryKey: ['wishlist', user?.email],
    queryFn: () => backend.data.Wishlist.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  const { data: userLists = [] } = useQuery({
    queryKey: ['cardlists', user?.email],
    queryFn: () => backend.data.CardList.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  const isWishlisted = (cardId) => wishlistItems.some(w => w.product_id === cardId);

  const addToWishlist = async (e, card) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { backend.auth.redirectToLogin(window.location.href); return; }
    if (isWishlisted(card.id)) { setSavePopup(null); return; }
    setSaving(card.id);
    await backend.data.Wishlist.create({
      user_email: user.email,
      product_id: card.id,
      product_name: card.name,
      product_image: card.image_url,
      price: card.price || 0,
      product_type: 'card'
    });
    queryClient.invalidateQueries(['wishlist']);
    setSaving(null);
    setSavePopup(null);
  };

  const addToList = async (e, card, list) => {
    e.preventDefault();
    e.stopPropagation();
    setSaving(card.id);
    const existing = list.items?.find(i => i.product_id === card.id);
    const updatedItems = existing
      ? list.items.map(i => i.product_id === card.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i)
      : [...(list.items || []), {
          product_id: card.id,
          product_name: card.name,
          product_image: card.image_url,
          price: card.price || 0,
          product_type: 'card',
          quantity: 1
        }];
    await backend.data.CardList.update(list.id, { items: updatedItems });
    queryClient.invalidateQueries(['cardlists']);
    setSaving(null);
    setSavePopup(null);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div key={card.id} className="relative group">
          <Link
            to={createPageUrl('CardDetail') + `?id=${card.id}`}
            className="block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-200"
          >
            {/* Card Image */}
            <div className="aspect-[3/4] bg-gray-100 relative overflow-hidden">
              {card.image_url ? (
                <img
                  src={card.image_url}
                  alt={card.name}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No Image
                </div>
              )}

              {card.quantity === 0 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">SOLD OUT</span>
                </div>
              )}

              {card.quantity > 0 && card.quantity <= 2 && (
                <Badge className="absolute top-2 left-2 bg-red-500 text-white text-xs">
                  Only {card.quantity} left
                </Badge>
              )}

              {/* Heart button */}
              <div className="absolute top-2 right-2">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSavePopup(savePopup === card.id ? null : card.id); }}
                  className={`p-1.5 rounded-full shadow transition-colors ${isWishlisted(card.id) ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-500 hover:text-red-500'}`}
                  title="Save to wishlist or list"
                >
                  <Heart className="w-4 h-4" fill={isWishlisted(card.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>

            {/* Card Info */}
            <div className="p-3">
              <p className="text-xs text-gray-500 mb-1">{gameLabels[card.game]}</p>
              <h3 className="font-medium text-gray-900 text-sm line-clamp-2 group-hover:text-gray-600 transition-colors">
                {card.name}
              </h3>
              {card.set_name && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{card.set_name}</p>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-lg font-bold text-gray-900">
                  ${card.price?.toFixed(2)}
                </span>
                <span className="text-xs text-gray-500">
                  {conditionLabels[card.condition]}
                </span>
              </div>
            </div>
          </Link>

          {/* Save popup */}
          {savePopup === card.id && (
            <div className="absolute top-12 right-2 bg-white border border-gray-200 rounded-lg shadow-xl z-30 w-44 py-1">
              <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Save to...</p>
              <button
                onClick={(e) => addToWishlist(e, card)}
                disabled={saving === card.id || isWishlisted(card.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                <Heart className="w-3.5 h-3.5" /> {isWishlisted(card.id) ? 'In Wishlist ✓' : 'Wishlist'}
              </button>
              {user && userLists.length > 0 && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <p className="px-3 py-1 text-xs text-gray-400">My Lists</p>
                  {userLists.map(list => (
                    <button
                      key={list.id}
                      onClick={(e) => addToList(e, card, list)}
                      disabled={saving === card.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors truncate"
                    >
                      <span className="text-xs">📋</span> {list.name}
                    </button>
                  ))}
                </>
              )}
              {!user && (
                <p className="px-3 py-2 text-xs text-gray-400 italic">Sign in to save</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


