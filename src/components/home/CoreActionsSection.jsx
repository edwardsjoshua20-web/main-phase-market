import React from 'react';
import { Link } from 'react-router-dom';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    action: 'BUILD DECKS →',
    to: '/AdvancedDeckBuilder',
    visual: 'deck',
  },
  {
    title: 'Commander Hub',
    action: 'EXPLORE COMMANDERS →',
    to: '/CommanderHub',
    visual: 'commander',
  },
  {
    title: 'Community Decks',
    action: 'BROWSE DECKS →',
    to: '/CommunityDecks',
    visual: 'community',
  },
  {
    title: 'TCG Encyclopedia',
    action: 'EXPLORE SETS →',
    to: '/set/yugioh/magnificent-monsters',
    visual: 'reference',
  },
];

function ToolVisual({ type }) {
  if (type === 'deck') {
    return (
      <div className="pointer-events-none absolute inset-y-0 right-0 w-48 overflow-hidden opacity-90">
        <div className="absolute right-20 top-6 h-20 w-14 -rotate-12 rounded-[2px] border border-cyan-100/20 bg-cyan-100/[0.055] shadow-[0_14px_34px_rgba(8,145,178,0.16)]" />
        <div className="absolute right-14 top-5 h-20 w-14 -rotate-3 rounded-[2px] border border-white/20 bg-white/[0.055] shadow-[0_14px_34px_rgba(2,8,23,0.28)]" />
        <div className="absolute right-8 top-7 h-20 w-14 rotate-8 rounded-[2px] border border-sky-200/25 bg-sky-200/[0.07] shadow-[0_14px_34px_rgba(8,47,73,0.28)]" />
      </div>
    );
  }

  if (type === 'commander') {
    return (
      <div className="pointer-events-none absolute inset-y-0 right-0 w-48 overflow-hidden opacity-90">
        <div className="absolute right-7 top-1/2 h-28 w-20 -translate-y-1/2 rounded-[2px] border border-violet-100/20 bg-violet-100/[0.055] shadow-[0_18px_38px_rgba(76,29,149,0.22)]" />
        <div className="absolute right-12 top-7 h-3 w-10 rounded-[1px] bg-white/15" />
        <div className="absolute right-[3.25rem] top-12 h-12 w-8 border-x border-t border-violet-100/20" />
        <div className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-violet-200/30 to-transparent" />
      </div>
    );
  }

  if (type === 'community') {
    return (
      <div className="pointer-events-none absolute inset-y-0 right-0 w-52 overflow-hidden opacity-90">
        <div className="absolute right-6 top-5 grid grid-cols-3 gap-2">
          <div className="h-12 w-9 rounded-[2px] border border-amber-100/20 bg-amber-100/[0.055]" />
          <div className="h-12 w-9 rounded-[2px] border border-white/15 bg-white/[0.045]" />
          <div className="h-12 w-9 rounded-[2px] border border-amber-100/20 bg-amber-100/[0.055]" />
          <div className="h-12 w-9 rounded-[2px] border border-white/15 bg-white/[0.045]" />
          <div className="h-12 w-9 rounded-[2px] border border-amber-100/20 bg-amber-100/[0.055]" />
          <div className="h-12 w-9 rounded-[2px] border border-white/15 bg-white/[0.045]" />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-48 overflow-hidden opacity-90">
      <div className="absolute right-8 top-1/2 h-24 w-20 -translate-y-1/2 rounded-[2px] border border-emerald-100/20 bg-emerald-100/[0.055] shadow-[0_18px_38px_rgba(6,78,59,0.22)]" />
      <div className="absolute right-[5.75rem] top-7 h-20 w-px bg-emerald-100/25" />
      <div className="absolute right-[3.25rem] top-8 h-2 w-10 rounded-[1px] bg-white/15" />
      <div className="absolute right-[3.25rem] top-[3.25rem] h-2 w-7 rounded-[1px] bg-white/10" />
      <div className="absolute right-[3.25rem] top-[4.5rem] h-2 w-11 rounded-[1px] bg-white/10" />
      <div className="absolute right-4 top-4 h-6 w-6 rotate-45 border border-emerald-100/20 bg-emerald-100/[0.035]" />
    </div>
  );
}

export default function CoreActionsSection() {
  return (
    <section className="bg-white py-4">
      <HomepageContentShell>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Main Phase Tools</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {actions.map((action) => (
            <Link
              key={action.title}
              to={action.to}
              className="group relative min-h-[112px] overflow-hidden rounded-[2px] bg-[#06101d] px-5 py-4 text-white shadow-[0_10px_24px_rgba(2,8,20,0.14)] ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0a1726] hover:ring-white/20"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/35 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_48%,rgba(56,189,248,0.12),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.045),transparent_38%,rgba(15,23,42,0.22))]" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/[0.035] to-transparent" />
              <ToolVisual type={action.visual} />
              <div className="relative flex min-h-[80px] max-w-[60%] flex-col justify-between">
                <h3 className="text-lg font-semibold leading-tight text-white">{action.title}</h3>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-sky-200/90 transition-colors duration-200 group-hover:text-sky-100">{action.action}</p>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
