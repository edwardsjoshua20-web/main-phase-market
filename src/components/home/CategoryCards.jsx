import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Package, Layers, Dice1, Box, Sparkles } from 'lucide-react';
import WideShell from '@/components/layout/WideShell';

const categories = [
  {
    name: 'Single Cards',
    description: 'Find the perfect card for your deck',
    icon: Layers,
    link: '?type=single_card',
    color: 'from-blue-500 to-blue-600',
    image: 'https://images.unsplash.com/photo-1606503153255-59d8b8b82176?w=300&h=200&fit=crop'
  },
  {
    name: 'Booster Boxes',
    description: 'Sealed boxes from latest sets',
    icon: Box,
    link: '?type=booster_box',
    color: 'from-purple-500 to-purple-600',
    image: 'https://images.unsplash.com/photo-1569863959165-56dae551d4fc?w=300&h=200&fit=crop'
  },
  {
    name: 'Starter Decks',
    description: 'Ready-to-play preconstructed decks',
    icon: Package,
    link: '?type=starter_deck',
    color: 'from-green-500 to-green-600',
    image: 'https://images.unsplash.com/photo-1606503153255-59d8b8b82176?w=300&h=200&fit=crop'
  },
  {
    name: 'Dice & Accessories',
    description: 'Dice sets, counters, and more',
    icon: Dice1,
    link: '?type=dice',
    color: 'from-amber-500 to-orange-500',
    image: 'https://images.unsplash.com/photo-1551431009-a802eeec77b1?w=300&h=200&fit=crop'
  },
  {
    name: 'Bundles',
    description: 'Great value product bundles',
    icon: Sparkles,
    link: '?type=bundle',
    color: 'from-pink-500 to-rose-500',
    image: 'https://images.unsplash.com/photo-1606503153255-59d8b8b82176?w=300&h=200&fit=crop'
  },
];

export default function CategoryCards() {
  return (
    <section className="py-10 bg-gray-50">
      <WideShell>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Shop by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.name}
                to={createPageUrl('Shop') + category.link}
                className="group relative bg-white rounded-xl overflow-hidden border border-gray-200 hover:border-gray-500 hover:shadow-lg transition-all duration-300"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${category.color} opacity-0 group-hover:opacity-90 transition-opacity duration-300`} />
                <div className="relative p-5 h-full flex flex-col items-center text-center">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${category.color} flex items-center justify-center mb-3 group-hover:bg-white/20 transition-colors`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-white transition-colors">
                    {category.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 group-hover:text-white/80 transition-colors">
                    {category.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </WideShell>
    </section>
  );
}