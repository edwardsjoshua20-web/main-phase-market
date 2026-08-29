import React from 'react';
import { Link } from 'react-router-dom';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    action: 'BUILD DECKS →',
    to: '/AdvancedDeckBuilder',
  },
  {
    title: 'Commander Hub',
    action: 'EXPLORE COMMANDERS →',
    to: '/CommanderHub',
  },
  {
    title: 'Community Decks',
    action: 'BROWSE DECKS →',
    to: '/CommunityDecks',
  },
  {
    title: 'TCG Encyclopedia',
    action: 'EXPLORE SETS →',
    to: '/set/yugioh/magnificent-monsters',
  },
];

export default function CoreActionsSection() {
  return (
    <section className="bg-white py-3.5">
      <HomepageContentShell>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Main Phase Tools</h2>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => (
            <Link
              key={action.title}
              to={action.to}
              className="group relative overflow-hidden rounded-[2px] bg-[#07111f] px-4 py-3 text-white shadow-[0_6px_16px_rgba(2,8,20,0.10)] ring-1 ring-slate-800/80 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0a1726] hover:ring-slate-600"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/25 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_42%,rgba(14,165,233,0.035))]" />
              <div className="relative flex min-h-[58px] flex-col justify-between">
                <h3 className="truncate text-[0.98rem] font-semibold leading-tight text-white">{action.title}</h3>
                <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-sky-200/90 transition-colors duration-200 group-hover:text-sky-100">{action.action}</p>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
