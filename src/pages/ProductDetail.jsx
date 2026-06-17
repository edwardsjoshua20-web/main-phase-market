import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  ShoppingCart, 
  ChevronLeft, 
  Shield, 
  Truck, 
  Award,
  Minus,
  Plus,
  Package,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';

const conditionLabels = {
  mint: { label: 'Mint', description: 'Perfect condition, no visible wear' },
  near_mint: { label: 'Near Mint', description: 'Minimal wear, almost perfect' },
  excellent: { label: 'Excellent', description: 'Minor wear, still great condition' },
  good: { label: 'Good', description: 'Some wear visible' },
  light_played: { label: 'Light Played', description: 'Light wear from play' },
  played: { label: 'Played', description: 'Moderate wear from play' },
  poor: { label: 'Poor', description: 'Heavy wear, significant damage' },
  sealed: { label: 'Sealed', description: 'Factory sealed, unopened' },
};

const productTypeLabels = {
  single_card: 'Single Card',
  booster_box: 'Booster Box',
  starter_deck: 'Starter Deck',
  bundle: 'Bundle',
  dice: 'Dice',
  accessories: 'Accessories',
  sealed_product: 'Sealed Product',
};

const gameLabels = {
  magic: 'Magic: The Gathering',
  pokemon: 'Pokémon',
  yugioh: 'Yu-Gi-Oh!',
  other: 'Other',
};

export default function ProductDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  const [quantity, setQuantity] = useState(1);
  const [user, setUser] = useState(null);
  const [addingToCart, setAddingToCart] = useState(false);
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

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const products = await backend.data.Product.filter({ id: productId });
      return products[0];
    },
    enabled: !!productId
  });

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        backend.auth.redirectToLogin(window.location.href);
        return;
      }

      const existingItems = await backend.data.CartItem.filter({
        user_email: user.email,
        card_id: productId
      });

      if (existingItems.length > 0) {
        await backend.data.CartItem.update(existingItems[0].id, {
          quantity: existingItems[0].quantity + quantity
        });
      } else {
        await backend.data.CartItem.create({
          card_id: productId,
          card_name: product.name,
          card_image: product.image_url,
          price: product.price,
          quantity: quantity,
          user_email: user.email
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['cart']);
      toast.success('Added to cart!');
      setAddingToCart(false);
    },
    onError: () => {
      toast.error('Failed to add to cart');
      setAddingToCart(false);
    }
  });

  const handleAddToCart = async () => {
    setAddingToCart(true);
    addToCartMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-32 bg-gray-100 mb-8" />
          <div className="grid md:grid-cols-2 gap-8">
            <Skeleton className="aspect-square rounded-lg bg-gray-100" />
            <div className="space-y-4">
              <Skeleton className="h-10 bg-gray-100 w-3/4" />
              <Skeleton className="h-6 bg-gray-100 w-1/2" />
              <Skeleton className="h-12 bg-gray-100 w-1/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-gray-900 text-2xl font-bold mb-4">Product not found</h2>
          <Link to={createPageUrl('Shop')}>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              Back to Shop
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const condition = conditionLabels[product.condition] || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link to={createPageUrl('Shop')}>
          <Button variant="ghost" className="text-gray-600 hover:text-gray-900 mb-6 -ml-2">
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Shop
          </Button>
        </Link>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Image */}
          <div className="relative">
            <div className="aspect-square rounded-lg overflow-hidden bg-white border border-gray-200 sticky top-8">
              {product.image_url ? (
                <img 
                  src={product.image_url} 
                  alt={product.name} 
                  className="w-full h-full object-contain p-4"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <Package className="w-20 h-20" />
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-6">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-gray-100 text-gray-700">
                {gameLabels[product.game]}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700">
                {productTypeLabels[product.product_type]}
              </Badge>
              {product.is_preorder && (
                <Badge className="bg-purple-600 text-white">Preorder</Badge>
              )}
              {product.is_new_release && (
                <Badge className="bg-green-600 text-white">New Release</Badge>
              )}
            </div>

            {/* Title */}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{product.name}</h1>
              {product.set_name && (
                <p className="text-gray-500 text-lg mt-1">
                  {product.set_name} {product.card_number && `• ${product.card_number}`}
                </p>
              )}
            </div>

            {/* Price Box */}
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-gray-900">${product.price?.toFixed(2)}</span>
                {product.quantity > 0 && product.quantity <= 5 && (
                  <span className="text-red-500 text-sm font-medium">Only {product.quantity} left!</span>
                )}
              </div>

              {product.is_preorder && product.release_date && (
                <div className="flex items-center gap-2 mt-3 text-purple-600">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Releases {format(new Date(product.release_date), 'MMMM d, yyyy')}
                  </span>
                </div>
              )}

              {product.quantity > 0 || product.is_preorder ? (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600">Quantity:</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 border-gray-300"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={quantity <= 1}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="text-gray-900 w-10 text-center font-medium">{quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 border-gray-300"
                        onClick={() => setQuantity(Math.min(product.quantity || 99, quantity + 1))}
                        disabled={quantity >= (product.quantity || 99)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {!product.is_preorder && (
                      <span className="text-gray-500 text-sm">{product.quantity} available</span>
                    )}
                  </div>

                  <Button 
                    size="lg" 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-14"
                    onClick={handleAddToCart}
                    disabled={addingToCart}
                  >
                    {addingToCart ? (
                      <>Adding...</>
                    ) : (
                      <>
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        {product.is_preorder ? 'Preorder' : 'Add to Cart'} - ${(product.price * quantity).toFixed(2)}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="mt-6">
                  <Button size="lg" className="w-full" disabled>
                    Sold Out
                  </Button>
                </div>
              )}
            </div>

            {/* Condition */}
            {condition.label && (
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-gray-900 font-semibold mb-2 flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" />
                  Condition: {condition.label}
                </h3>
                <p className="text-gray-600">{condition.description}</p>
              </div>
            )}

            {/* Description */}
            {product.description && (
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-gray-900 font-semibold mb-2">Description</h3>
                <p className="text-gray-600 whitespace-pre-wrap">{product.description}</p>
              </div>
            )}

            {/* Trust Badges */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200 flex items-center gap-3">
                <Shield className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-gray-900 font-medium text-sm">Authenticated</p>
                  <p className="text-gray-500 text-xs">100% Genuine</p>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200 flex items-center gap-3">
                <Truck className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-gray-900 font-medium text-sm">Fast Shipping</p>
                  <p className="text-gray-500 text-xs">Secure Packaging</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


