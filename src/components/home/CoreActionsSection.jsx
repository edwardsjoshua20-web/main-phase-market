import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Boxes, LibraryBig, Swords } from 'lucide-react';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    description: 'Refine decks. Test ideas.',
    action: 'Start Building',
    to: '/AdvancedDeckBuilder',
    Icon: Swords,
  },
  {
    title: 'Commander Hub',
    description: 'Commanders, themes, staples.',
    action: 'Explore Commander',
    to: '/CommanderHub',
    Icon: LibraryBig,
  },
  {
    title: 'Community Decks',
    description: 'Real decks from real players.',
    action: 'Browse Decks',
    to: '/CommunityDecks',
    Icon: Boxes,
  },
  {
    title: 'TCG Encyclopedia',
    description: 'Sets, releases, card data.',
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
              className="group relative overflow-hidden rounded-[2px] border border-slate-800 bg-[#06101d] px-4 py-3 text-white shadow-[0_7px_18px_rgba(2,8,20,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-[#0a1726]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/35 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),transparent_34%,rgba(14,165,233,0.055))]" />
              <div className="relative flex min-h-[94px] flex-col justify-between">
                <Icon className="h-5 w-5 text-slate-400 transition-colors duration-200 group-hover:text-slate-200" strokeWidth={1.55} />
                <div>
                  <h3 className="text-base font-semibold leading-tight text-white">{action.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-300 line-clamp-1">{action.description}</p>
                  <p className="mt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-sky-200/90">{action.action}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
