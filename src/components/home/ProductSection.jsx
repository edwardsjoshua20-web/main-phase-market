import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { backend } from '@/services/backend';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ShoppingCart, Heart } from 'lucide-react';
import { toast } from 'sonner';
import HomepageContentShell from '@/components/layout/HomepageContentShell';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { useCartOwner } from '@/hooks/useCartOwner';
import { useWishlistOwner } from '@/hooks/useWishlistOwner';

const conditionLabels = {
  mint: 'Mint',
  near_mint: 'NM',
  excellent: 'EX',
  good: 'Good',
  light_played: 'LP',
  played: 'PL',
  poor: 'Poor',
  sealed: 'Sealed'
};

export default function ProductSection({ title, subtitle, products, viewAllLink, bgColor = 'bg-white' }) {
  const [hoveredProduct, setHoveredProduct] = useState(null);
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();
  const cart = useCartOwner(user);
  const wishlist = useWishlistOwner(user);

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (isAuth) {
        const userData = await backend.auth.getCurrentUser();
        setUser(userData);
      }
    };
    loadUser();
  }, []);

  const addToCartMutation = useMutation({
    mutationFn: async (product) => {
      await cart.addItem({
        card_id: product.id,
        card_name: product.name,
        card_image: getCardImageUrl(product),
        price: product.price,
        product_type: product.product_type,
        game: product.game,
        set_code: product.set_code,
        set_name: product.set_name,
        collector_number: product.collector_number || product.number,
        finish: product.finish,
        condition: product.condition,
        language: product.language || product.lang,
      }, 1);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Added to cart');
    }
  });

  const addToWishlistMutation = useMutation({
    mutationFn: async (product) => {
      await wishlist.addItem({
        product_id: product.id,
        product_name: product.name,
        product_image: getCardImageUrl(product),
        price: product.price,
        product_type: product.product_type || product.game || 'card',
        game: product.game,
        set_code: product.set_code,
        set_name: product.set_name,
        collector_number: product.collector_number || product.number,
        finish: product.finish,
        condition: product.condition,
        language: product.language || product.lang,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success('Added to wishlist');
    }
  });

  if (!products || products.length === 0) return null;

  return (
    <section className={`py-8 ${bgColor}`}>
      <HomepageContentShell>
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {viewAllLink && (
            <Link to={viewAllLink}>
              <Button variant="ghost" className="h-8 rounded-[5px] px-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-200 hover:text-slate-950">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {products.slice(0, 6).map((product) => (
            <div 
              key={product.id} 
              className="relative"
              onMouseEnter={() => setHoveredProduct(product)}
              onMouseLeave={() => setHoveredProduct(null)}
            >
              <Link
                to={createPageUrl('Shop') + `?type=single_card&id=${product.id}`}
                className="group block overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)]"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                  {getCardImageUrl(product) ? (
                    <img 
                      src={getCardImageUrl(product)} 
                      alt={product.name}
                      className="w-full h-full object-contain p-1.5 group-hover:scale-[1.035] transition-transform duration-200"
                      onError={(event) => handleCardImageError(event, product, (image) => {
                        const fallback = image.parentElement?.querySelector('[data-product-image-fallback]');
                        fallback?.classList.remove('hidden');
                        fallback?.classList.add('flex');
                      })}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      No Image
                    </div>
                  )}
                  <div data-product-image-fallback className="hidden absolute inset-0 items-center justify-center px-3 text-center text-xs font-medium text-slate-400">
                    No image
                  </div>
                
                {product.is_preorder && (
                  <Badge className="absolute top-2 left-2 bg-purple-600 text-white text-xs">
                    Preorder
                  </Badge>
                )}
                {product.is_new_release && !product.is_preorder && (
                  <Badge className="absolute top-2 left-2 bg-green-600 text-white text-xs">
                    New
                  </Badge>
                )}
                {product.quantity === 0 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-white font-bold text-xs">SOLD OUT</span>
                  </div>
                )}
                </div>

                <div className="p-2.5">
                  <h3 className="min-h-[2rem] text-xs font-medium leading-4 text-slate-950 line-clamp-2 transition-colors group-hover:text-slate-700">
                    {product.name}
                  </h3>
                  {product.set_name && (
                    <p className="mt-1 text-[0.7rem] text-slate-500 line-clamp-1">{product.set_name}</p>
                  )}
                  <div className="my-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-950">
                      ${product.price?.toFixed(2)}
                    </span>
                    {product.condition && (
                      <span className="rounded-[4px] bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-500">
                        {conditionLabels[product.condition]}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      onClick={(e) => {
                        e.preventDefault();
                        addToCartMutation.mutate(product);
                      }}
                      disabled={product.quantity === 0}
                      size="sm"
                      className="h-8 flex-1 rounded-[5px] bg-slate-900 text-xs text-white hover:bg-slate-800"
                    >
                      <ShoppingCart className="w-3 h-3 mr-1" />
                      Cart
                    </Button>
                    <Button 
                      onClick={(e) => {
                        e.preventDefault();
                        addToWishlistMutation.mutate(product);
                      }}
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-[5px] border-slate-300 px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Heart className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </HomepageContentShell>

      {/* Large Image Popup on Hover */}
      {hoveredProduct && getCardImageUrl(hoveredProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl p-3 max-w-xs pointer-events-auto border-4 border-gray-700">
            <img 
              src={getCardImageUrl(hoveredProduct)} 
              alt={hoveredProduct.name}
              className="w-full h-auto rounded-lg mb-2"
              onError={(event) => handleCardImageError(event, hoveredProduct)}
            />
            <h3 className="font-bold text-sm text-gray-900 mb-1">{hoveredProduct.name}</h3>
            {hoveredProduct.set_name && (
              <p className="text-xs text-gray-600 mb-2">{hoveredProduct.set_name}</p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-gray-900">
                ${hoveredProduct.price?.toFixed(2)}
              </span>
              {hoveredProduct.condition && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {conditionLabels[hoveredProduct.condition]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


