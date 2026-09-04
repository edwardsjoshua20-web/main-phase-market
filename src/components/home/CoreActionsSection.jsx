import React from 'react';
import { Link } from 'react-router-dom';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    action: 'BUILD DECKS →',
    to: '/AdvancedDeckBuilder',
    backgroundImage: '/images/home-tools/deck-builder-blue-wave.png',
    backgroundPosition: '100% 50%',
  },
  {
    title: 'Commander Hub',
    action: 'EXPLORE COMMANDERS →',
    to: '/CommanderHub',
    backgroundImage: '/images/home-tools/commander-purple-energy.png',
    backgroundPosition: '78% 50%',
  },
  {
    title: 'Community Decks',
    action: 'BROWSE DECKS →',
    to: '/CommunityDecks',
    backgroundImage: '/images/home-tools/community-teal-network.png',
    backgroundPosition: '100% 50%',
  },
  {
    title: 'TCG Encyclopedia',
    action: 'EXPLORE SETS →',
    to: '/set/yugioh/magnificent-monsters',
    backgroundImage: '/images/home-tools/encyclopedia-navy-gold.png',
    backgroundPosition: '100% 50%',
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
              <img
                src={action.backgroundImage}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-100 brightness-150 contrast-125 saturate-150 transition duration-200 group-hover:scale-[1.025] group-hover:brightness-[1.65]"
                style={{ objectPosition: action.backgroundPosition }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.78),rgba(2,6,23,0.46)_34%,rgba(2,6,23,0.00)_62%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
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
