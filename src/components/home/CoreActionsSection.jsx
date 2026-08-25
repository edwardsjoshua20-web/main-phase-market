import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Boxes, ChevronRight, LibraryBig, Swords } from 'lucide-react';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    description: 'Build, test, and refine lists.',
    action: 'Start Building',
    to: '/AdvancedDeckBuilder',
    Icon: Swords,
  },
  {
    title: 'Commander Hub',
    description: 'Find commanders, themes, and staples.',
    action: 'Explore Commander',
    to: '/CommanderHub',
    Icon: LibraryBig,
  },
  {
    title: 'Community Decks',
    description: 'Browse decks from players like you.',
    action: 'Browse Decks',
    to: '/CommunityDecks',
    Icon: Boxes,
  },
  {
    title: 'TCG Encyclopedia',
    description: 'Review sets, releases, and card data.',
    action: 'View Releases',
    to: '/set/yugioh/magnificent-monsters',
    Icon: BookOpen,
  },
];

export default function CoreActionsSection() {
  return (
    <section className="bg-white py-5">
      <HomepageContentShell>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Main Phase Tools</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(({ Icon, ...action }) => (
            <Link
              key={action.title}
              to={action.to}
              className="group relative overflow-hidden rounded-[5px] border border-slate-200 bg-slate-950 px-4 py-3.5 text-white shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-[#0b1726] hover:shadow-[0_12px_26px_rgba(15,23,42,0.14)]"
            >
              <div className="absolute inset-y-0 right-0 w-28 bg-[radial-gradient(circle_at_70%_35%,rgba(56,189,248,0.16),transparent_42%)]" />
              <div className="relative flex min-h-[108px] flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <Icon className="h-6 w-6 text-sky-200" />
                  <ChevronRight className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold leading-tight text-white">{action.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-300 line-clamp-1">{action.description}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-sky-200">{action.action}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
