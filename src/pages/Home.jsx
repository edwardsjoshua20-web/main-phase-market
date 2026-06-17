import React from 'react';
import { backend } from '@/services/backend';
import { useQuery } from '@tanstack/react-query';
import HeroBanner from '@/components/home/HeroBanner';
import ProductSection from '@/components/home/ProductSection';
import GameTabs from '@/components/home/GameTabs';
import TrendingCards from '@/components/home/TrendingCards';
import CoreActionsSection from '@/components/home/CoreActionsSection';
import { createPageUrl } from '@/utils';
import { inventoryListings } from '@/services/inventoryListings';

export default function Home() {
  // Fetch products - using Card entity for now, will migrate to Product
  const { data: cards = [] } = useQuery({
    queryKey: ['home-cards'],
    queryFn: () => inventoryListings.filter({ status: 'active' }, '-price'),
  });

  // Try to fetch products if entity exists
  const { data: products = [] } = useQuery({
    queryKey: ['home-products'],
    queryFn: async () => {
      try {
        return await backend.data.Product.filter({ status: 'active' }, '-price');
      } catch {
        return [];
      }
    },
  });

  // Combine cards and products, prefer products if available
  const allProducts = products.length > 0 ? products : cards.map(card => ({
    ...card,
    product_type: 'single_card'
  }));

  // Filter by categories
  const featuredProducts = allProducts.filter(p => p.featured).slice(0, 6);
  const sealedProducts = allProducts.filter(p => ['booster_box', 'starter_deck', 'bundle', 'sealed_product'].includes(p.product_type)).slice(0, 6);
  const diceAccessories = allProducts.filter(p => ['dice', 'accessories'].includes(p.product_type)).slice(0, 6);
  const utilityProducts = sealedProducts.length > 0 ? sealedProducts : diceAccessories;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50/40 to-white w-full">
      <div className="hidden md:block">
        <HeroBanner />
      </div>

      <CoreActionsSection />
      <div className="hidden md:block">
        <GameTabs />
      </div>

      {featuredProducts.length > 0 && (
        <ProductSection
          title="Featured Products"
          subtitle="Hand-picked selections from our inventory"
          products={featuredProducts}
          viewAllLink={createPageUrl('Shop') + '?featured=true'}
        />
      )}

      <TrendingCards />

      {utilityProducts.length > 0 && (
        <ProductSection
          title={sealedProducts.length > 0 ? 'Booster Boxes & Sealed Products' : 'Dice & Accessories'}
          subtitle={sealedProducts.length > 0 ? 'Factory sealed for collectors and players' : 'Upgrade your gaming experience'}
          products={utilityProducts}
          viewAllLink={sealedProducts.length > 0 ? createPageUrl('Shop') + '?type=booster_box' : createPageUrl('Shop') + '?type=dice'}
          bgColor="bg-gray-50"
        />
      )}

      {/* Empty State */}
      {allProducts.length === 0 && (
        <div className="py-20 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Coming Soon</h3>
            <p className="text-gray-500">Our inventory is being stocked. Check back soon for amazing products!</p>
          </div>
        </div>
      )}
    </div>
  );
}


