import React, { useState } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, ShoppingCart } from 'lucide-react';

export default function SearchResultCard({ result, user, onQuickView, onHoverImage }) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const isWishlisted = wishlistItems.some(w => w.product_id === result.id);

  const addToWishlist = async () => {
    if (!user) { backend.auth.redirectToLogin(window.location.href); return; }
    if (isWishlisted) { setPopupOpen(false); return; }
    setSaving(true);
    await backend.data.Wishlist.create({
      user_email: user.email,
      product_id: result.id,
      product_name: result.name,
      product_image: result.image_url,
      price: result.price || 0,
      product_type: 'card'
    });
    queryClient.invalidateQueries(['wishlist']);
    setSaving(false);
    setPopupOpen(false);
  };

  const addToList = async (list) => {
    setSaving(true);
    const existing = list.items?.find(i => i.product_id === result.id);
    const updatedItems = existing
      ? list.items.map(i => i.product_id === result.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i)
      : [...(list.items || []), {
          product_id: result.id,
          product_name: result.name,
          product_image: result.image_url,
          price: result.price || 0,
          product_type: 'card',
          quantity: 1
        }];
    await backend.data.CardList.update(list.id, { items: updatedItems });
    queryClient.invalidateQueries(['cardlists']);
    setSaving(false);
    setPopupOpen(false);
  };

  return (
    <div className="group bg-white rounded-lg border border-gray-200 overflow-visible hover:shadow-lg hover:border-gray-400 transition-all duration-200 relative">
      <div className="aspect-square bg-gray-100 relative overflow-hidden rounded-t-lg">
        {result.image_url ? (
          <img
            src={result.image_url}
            alt={result.name}
            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300 cursor-pointer"
            onMouseEnter={() => onHoverImage?.(result.image_url)}
            onMouseLeave={() => onHoverImage?.(null)}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.querySelector('[data-image-fallback]')?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div data-image-fallback className={`${result.image_url ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-gray-400`}>No Image</div>

        {/* Heart button */}
        <div className="absolute top-2 right-2">
          <button
            onClick={() => setPopupOpen(p => !p)}
            className={`p-2 rounded-full shadow-md transition-all ${isWishlisted ? 'bg-red-500 text-white' : 'bg-white text-red-400 hover:bg-red-500 hover:text-white'}`}
          >
            <Heart className="w-4 h-4" fill={isWishlisted ? 'currentColor' : 'currentColor'} />
          </button>

          {popupOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-44 py-1">
              <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Save to...</p>
              <button
                onClick={addToWishlist}
                disabled={saving || isWishlisted}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                <Heart className="w-3.5 h-3.5" /> {isWishlisted ? 'In Wishlist ✓' : 'Wishlist'}
              </button>
              {user && userLists.length > 0 && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <p className="px-3 py-1 text-xs text-gray-400">My Lists</p>
                  {userLists.map(list => (
                    <button
                      key={list.id}
                      onClick={() => addToList(list)}
                      disabled={saving}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors truncate"
                    >
                      <span className="text-xs">📋</span> {list.name}
                    </button>
                  ))}
                </>
              )}
              {!user && <p className="px-3 py-2 text-xs text-gray-400 italic">Sign in to save</p>}
            </div>
          )}
        </div>
      </div>

      <div className="p-3">
        <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{result.name}</h3>
        <div className="flex items-center gap-1 mt-1 flex-wrap text-xs">
          <span className="text-gray-500">{result.set_code}</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-500 line-clamp-1">{result.set_name}</span>
        </div>
        {result.rarity && <p className="text-xs text-gray-500 mt-1 capitalize">{result.rarity}</p>}
        {result.price && <p className="text-sm font-bold text-gray-900 mt-2">${result.price.toFixed(2)}</p>}
        <div className="mt-3 space-y-2">
          {result.inStock ? (
            <>
              <Badge className="bg-green-600 text-white text-xs w-fit">In Stock</Badge>
              <p className="text-xs text-gray-600">${result.stockCard.price.toFixed(2)} • {result.stockCard.quantity} available</p>
              <Button size="sm" onClick={() => onQuickView(result.stockCard)} className="w-full bg-gray-800 hover:bg-gray-700 text-xs h-8">
                <ShoppingCart className="w-3 h-3 mr-1" /> Add to Cart
              </Button>
            </>
          ) : (
            <>
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-xs w-fit">Out of Stock</Badge>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600">
                Not in stock
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


