import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const actions = [
  {
    title: 'Shop',
    subtitle: 'Browse singles, sealed, and deals',
    to: '/MobileShop?type=single_card',
    accent: 'from-blue-700 via-indigo-700 to-slate-950'
  },
  {
    title: 'Decks',
    subtitle: 'Build, save, and refine lists',
    to: '/MobileDeckBuilder',
    accent: 'from-amber-600 via-orange-600 to-red-900'
  },
  {
    title: 'Forum',
    subtitle: 'Ask, answer, and explore threads',
    to: '/MobileForum',
    accent: 'from-emerald-700 via-teal-700 to-slate-950'
  }
];

export default function MobileQuickActions() {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-950">Quick Actions</h2>
      </div>
      <div className="overflow-hidden border-y border-slate-200 bg-white">
        {actions.map((action) => (
          <Link
            key={action.title}
            to={action.to}
            className="flex items-center justify-between gap-3 px-1 py-0 active:bg-slate-50"
          >
            <div className={`h-10 w-1.5 shrink-0 bg-gradient-to-b ${action.accent}`} />
            <div className="flex flex-1 items-start justify-between gap-3 border-b border-slate-200 py-3 pr-1 last:border-b-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{action.title}</p>
                <p className="mt-1 text-xs leading-4 text-slate-500">{action.subtitle}</p>
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center text-slate-700">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
