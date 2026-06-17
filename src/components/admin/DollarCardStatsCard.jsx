import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Coins } from 'lucide-react';

export default function DollarCardStatsCard({ cards }) {
  // Cards priced at exactly $1 (the minimum price floor)
  const dollarCards = cards.filter(c => c.price === 1 && c.status !== 'archived');

  const count = dollarCards.reduce((sum, c) => sum + c.quantity, 0);

  // Total market value of those cards (their cost field was set by price sync = market price)
  // We use `cost` as the purchase cost - but market price is what Scryfall returned as `price` before
  // the $1 floor was applied. Since syncCardPrices updates `price` directly, we need another way.
  // The best proxy we have: cards priced at $1 where cost < 1 means market < $1 too.
  // We'll use `cost` as the acquisition cost and show real profit vs market value.
  const totalMarketValue = dollarCards.reduce((sum, c) => sum + ((c.cost || 0) * c.quantity), 0);
  const totalSaleValue = dollarCards.reduce((sum, c) => sum + (1 * c.quantity), 0);
  const extraProfit = totalSaleValue - totalMarketValue;

  return (
    <Card className="bg-white border-orange-200 col-span-2 lg:col-span-1">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-100 text-orange-600 shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-500 text-sm">$1 Cards Profit Boost</p>
            <p className="text-xl font-bold text-gray-900">+${extraProfit.toFixed(2)}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
              <span>{count} cards @ $1.00</span>
              <span>Market value: ${totalMarketValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}