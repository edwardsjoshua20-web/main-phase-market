import React from 'react';
import { Link } from 'react-router-dom';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    action: 'BUILD DECKS →',
    to: '/AdvancedDeckBuilder',
    visual: 'radial-gradient(circle at 82% 26%, rgba(56,189,248,0.46), transparent 38%), radial-gradient(circle at 18% 100%, rgba(14,165,233,0.30), transparent 44%), linear-gradient(135deg, rgba(255,255,255,0.16), transparent 38%, rgba(15,23,42,0.12))',
  },
  {
    title: 'Commander Hub',
    action: 'EXPLORE COMMANDERS →',
    to: '/CommanderHub',
    visual: 'radial-gradient(circle at 76% 22%, rgba(168,85,247,0.43), transparent 37%), radial-gradient(circle at 14% 94%, rgba(45,212,191,0.26), transparent 44%), linear-gradient(135deg, rgba(255,255,255,0.15), transparent 39%, rgba(15,23,42,0.13))',
  },
  {
    title: 'Community Decks',
    action: 'BROWSE DECKS →',
    to: '/CommunityDecks',
    visual: 'radial-gradient(circle at 84% 18%, rgba(34,197,94,0.38), transparent 38%), radial-gradient(circle at 12% 100%, rgba(56,189,248,0.25), transparent 44%), linear-gradient(135deg, rgba(255,255,255,0.15), transparent 39%, rgba(15,23,42,0.13))',
  },
  {
    title: 'TCG Encyclopedia',
    action: 'EXPLORE SETS →',
    to: '/set/yugioh/magnificent-monsters',
    visual: 'radial-gradient(circle at 78% 24%, rgba(250,204,21,0.36), transparent 36%), radial-gradient(circle at 14% 96%, rgba(125,211,252,0.24), transparent 44%), linear-gradient(135deg, rgba(255,255,255,0.145), transparent 39%, rgba(15,23,42,0.13))',
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
              <div
                className="pointer-events-none absolute inset-0 opacity-90 transition-opacity duration-200 group-hover:opacity-100"
                style={{ background: action.visual }}
              />
              <div className="pointer-events-none absolute inset-0 opacity-[0.38] [background-image:linear-gradient(115deg,transparent_0,transparent_25%,rgba(255,255,255,0.30)_25%,rgba(255,255,255,0.30)_26%,transparent_26%,transparent_48%,rgba(255,255,255,0.24)_48%,rgba(255,255,255,0.24)_49%,transparent_49%,transparent_72%,rgba(255,255,255,0.18)_72%,rgba(255,255,255,0.18)_73%,transparent_73%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.25),rgba(2,6,23,0.04)_54%,rgba(2,6,23,0.16))]" />
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
