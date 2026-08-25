import React from 'react';
import { CreditCard, Layers3, Search, Swords } from 'lucide-react';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const trustItems = [
  {
    title: 'Secure Checkout',
    Icon: CreditCard,
  },
  {
    title: 'Catalog-Wide Search',
    Icon: Search,
  },
  {
    title: 'Multi-TCG Support',
    Icon: Layers3,
  },
  {
    title: 'Deck & Player Tools',
    Icon: Swords,
  },
];

export default function TrustStrip() {
  return (
    <section className="bg-white pb-5 pt-2">
      <HomepageContentShell>
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 md:grid-cols-4 md:divide-y-0">
          {trustItems.map(({ title, Icon }) => (
            <div key={title} className="flex min-h-[48px] items-center justify-center gap-2.5 px-3 py-2 text-center">
              <Icon className="h-4 w-4 shrink-0 text-slate-700" strokeWidth={1.8} />
              <span className="text-sm font-semibold text-slate-800">{title}</span>
            </div>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
