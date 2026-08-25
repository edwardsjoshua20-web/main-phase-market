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
    <section className="bg-white pb-6 pt-3">
      <HomepageContentShell>
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-[4px] border border-slate-200 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.04)] md:grid-cols-4 md:divide-y-0">
          {trustItems.map(({ title, Icon }) => (
            <div key={title} className="flex min-h-[62px] items-center justify-center gap-3 px-3 py-3 text-center">
              <Icon className="h-5 w-5 shrink-0 text-slate-800" />
              <span className="text-sm font-semibold text-slate-900">{title}</span>
            </div>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
