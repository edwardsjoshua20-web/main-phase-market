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
import { addToGuestCart } from '@/components/utils/guestStorage';

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
      if (user) {
        await backend.data.CartItem.create({
          card_id: product.id,
          card_name: product.name,
          card_image: getCardImageUrl(product),
          price: product.price,
          quantity: 1,
          user_email: user.email
        });
      } else {
        addToGuestCart({
          card_id: product.id,
          card_name: product.name,
          card_image: getCardImageUrl(product),
          price: product.price,
          quantity: 1
        });
      }
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries(['cart']);
      }
      toast.success('Added to cart');
    }
  });

  const addToWishlistMutation = useMutation({
    mutationFn: async (product) => {
      if (!user) {
        backend.auth.redirectToLogin(window.location.href);
        return;
      }
      await backend.data.Wishlist.create({
        user_email: user.email,
        product_id: product.id,
        product_name: product.name,
        product_image: getCardImageUrl(product),
        price: product.price,
        product_type: product.product_type || 'card'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['wishlist']);
      toast.success('Added to wishlist');
    }
  });

  if (!products || products.length === 0) return null;

  return (
    <section className={`py-12 ${bgColor}`}>
      <HomepageContentShell>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-1">{title}</h2>
            {subtitle && <p className="text-gray-600">{subtitle}</p>}
          </div>
          {viewAllLink && (
            <Link to={viewAllLink}>
              <Button variant="ghost" className="text-gray-700 hover:text-gray-900">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {products.slice(0, 6).map((product) => (
            <div 
              key={product.id} 
              className="relative"
              onMouseEnter={() => setHoveredProduct(product)}
              onMouseLeave={() => setHoveredProduct(null)}
            >
              <Link
                to={createPageUrl('Shop') + `?type=single_card&id=${product.id}`}
                className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-xl hover:border-slate-300 transition-all duration-200 block"
              >
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {getCardImageUrl(product) ? (
                    <img 
                      src={getCardImageUrl(product)} 
                      alt={product.name}
                      className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                      onError={(event) => handleCardImageError(event, product)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      No Image
                    </div>
                  )}
                
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
                    <span className="text-white font-bold text-sm">SOLD OUT</span>
                  </div>
                )}
                </div>

                <div className="p-3">
                  <h3 className="font-medium text-gray-900 text-sm line-clamp-2 group-hover:text-gray-600 transition-colors min-h-[2.5rem]">
                    {product.name}
                  </h3>
                  {product.set_name && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{product.set_name}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 mb-2">
                    <span className="text-lg font-bold text-gray-900">
                      ${product.price?.toFixed(2)}
                    </span>
                    {product.condition && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
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
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs h-8"
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
                      className="px-2 h-8 border-red-500 text-red-500 hover:bg-red-50"
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


