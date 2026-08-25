import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Boxes, LibraryBig, Swords } from 'lucide-react';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    description: 'Build and refine lists.',
    action: 'Start Building',
    to: '/AdvancedDeckBuilder',
    Icon: Swords,
  },
  {
    title: 'Commander Hub',
    description: 'Find commanders and staples.',
    action: 'Explore Commander',
    to: '/CommanderHub',
    Icon: LibraryBig,
  },
  {
    title: 'Community Decks',
    description: 'Browse player decklists.',
    action: 'Browse Decks',
    to: '/CommunityDecks',
    Icon: Boxes,
  },
  {
    title: 'TCG Encyclopedia',
    description: 'Review sets and card data.',
    action: 'View Releases',
    to: '/set/yugioh/magnificent-monsters',
    Icon: BookOpen,
  },
];

export default function CoreActionsSection() {
  return (
    <section className="bg-white py-4">
      <HomepageContentShell>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Main Phase Tools</h2>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(({ Icon, ...action }) => (
            <Link
              key={action.title}
              to={action.to}
              className="group overflow-hidden rounded-[3px] border border-slate-200 bg-[#08111f] px-4 py-3 text-white shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-[#0b1726]"
            >
              <div className="flex min-h-[92px] flex-col justify-between">
                <Icon className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                <div>
                  <h3 className="text-base font-semibold leading-tight text-white">{action.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-300 line-clamp-1">{action.description}</p>
                  <p className="mt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-200">{action.action}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
