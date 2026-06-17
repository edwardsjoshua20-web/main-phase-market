import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const BADGES = [
  {
    id: 'first_order',
    label: 'First Pull',
    description: 'Made your first purchase',
    emoji: '🎴',
    color: 'bg-blue-100 border-blue-300 text-blue-700',
    threshold: 1,
  },
  {
    id: 'five_orders',
    label: 'Pack Ripper',
    description: '5 purchases completed',
    emoji: '📦',
    color: 'bg-green-100 border-green-300 text-green-700',
    threshold: 5,
  },
  {
    id: 'ten_orders',
    label: 'Decksmith',
    description: '10 purchases completed',
    emoji: '⚒️',
    color: 'bg-purple-100 border-purple-300 text-purple-700',
    threshold: 10,
  },
  {
    id: 'twenty_five_orders',
    label: 'Card Shark',
    description: '25 purchases completed',
    emoji: '🦈',
    color: 'bg-yellow-100 border-yellow-300 text-yellow-700',
    threshold: 25,
  },
  {
    id: 'fifty_orders',
    label: 'Mythic Collector',
    description: '50 purchases — legendary status!',
    emoji: '✨',
    color: 'bg-gradient-to-r from-yellow-100 to-orange-100 border-yellow-400 text-yellow-800',
    threshold: 50,
  },
];

export function getEarnedBadges(orderCount) {
  return BADGES.filter(b => orderCount >= b.threshold);
}

export function getNextBadge(orderCount) {
  return BADGES.find(b => orderCount < b.threshold) || null;
}

export default function MemberBadge({ badge, locked = false }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all cursor-default select-none
            ${locked
              ? 'bg-gray-50 border-gray-200 opacity-40 grayscale'
              : badge.color
            }`}
          >
            <span className="text-2xl">{badge.emoji}</span>
            <span className="text-xs font-bold text-center leading-tight">{badge.label}</span>
            {locked && (
              <span className="absolute top-1 right-1 text-xs">🔒</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-semibold">{badge.label}</p>
          <p className="text-xs text-gray-400">{badge.description}</p>
          {locked && <p className="text-xs text-gray-400 mt-1">Needs {badge.threshold} orders</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { BADGES };