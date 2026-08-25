import React from 'react';
import { Link } from 'react-router-dom';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    action: 'Build Decks →',
    to: '/AdvancedDeckBuilder',
    accent: 'cyan',
  },
  {
    title: 'Commander Hub',
    action: 'Explore Commanders →',
    to: '/CommanderHub',
    accent: 'violet',
  },
  {
    title: 'Community Decks',
    action: 'Browse Decks →',
    to: '/CommunityDecks',
    accent: 'amber',
  },
  {
    title: 'TCG Encyclopedia',
    action: 'Explore Sets →',
    to: '/set/yugioh/magnificent-monsters',
    accent: 'emerald',
  },
];

const accentStyles = {
  cyan: 'bg-cyan-300/10 border-cyan-200/15',
  violet: 'bg-violet-300/10 border-violet-200/15',
  amber: 'bg-amber-200/10 border-amber-200/15',
  emerald: 'bg-emerald-200/10 border-emerald-200/15',
};

export default function CoreActionsSection() {
  return (
    <section className="bg-white py-4">
      <HomepageContentShell>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Main Phase Tools</h2>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => (
            <Link
              key={action.title}
              to={action.to}
              className="group relative overflow-hidden rounded-[2px] border border-slate-800 bg-[#06101d] px-4 py-3 text-white shadow-[0_7px_18px_rgba(2,8,20,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-[#0a1726]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/35 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),transparent_34%,rgba(14,165,233,0.045))]" />
              <div className={`pointer-events-none absolute right-[-18px] top-1/2 h-24 w-24 -translate-y-1/2 rotate-12 border ${accentStyles[action.accent]}`} />
              <div className="pointer-events-none absolute right-5 top-1/2 h-12 w-12 -translate-y-1/2 rotate-45 border border-white/[0.035] transition-colors duration-200 group-hover:border-white/[0.06]" />
              <div className="relative flex min-h-[72px] max-w-[78%] flex-col justify-between">
                <h3 className="text-[1.05rem] font-semibold leading-tight text-white">{action.title}</h3>
                <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-sky-200/90 transition-colors duration-200 group-hover:text-sky-100">{action.action}</p>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
