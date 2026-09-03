import React from 'react';
import { Link } from 'react-router-dom';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const actions = [
  {
    title: 'Deck Builder',
    action: 'BUILD DECKS →',
    to: '/AdvancedDeckBuilder',
    visual: 'radial-gradient(ellipse at 76% 36%, rgba(56,189,248,0.42), transparent 38%), radial-gradient(ellipse at 18% 112%, rgba(14,165,233,0.26), transparent 48%), linear-gradient(100deg, rgba(255,255,255,0.12), transparent 48%, rgba(15,23,42,0.12))',
    texture: 'radial-gradient(ellipse 160% 74% at 76% 118%, transparent 45%, rgba(125,211,252,0.26) 46%, transparent 48%), radial-gradient(ellipse 150% 68% at 36% 112%, transparent 43%, rgba(56,189,248,0.20) 44%, transparent 47%), radial-gradient(ellipse 132% 58% at 4% 112%, transparent 42%, rgba(255,255,255,0.12) 43%, transparent 46%)',
  },
  {
    title: 'Commander Hub',
    action: 'EXPLORE COMMANDERS →',
    to: '/CommanderHub',
    visual: 'radial-gradient(ellipse at 74% 34%, rgba(168,85,247,0.44), transparent 39%), radial-gradient(ellipse at 26% 98%, rgba(79,70,229,0.32), transparent 46%), linear-gradient(100deg, rgba(255,255,255,0.10), transparent 50%, rgba(15,23,42,0.14))',
    texture: 'radial-gradient(ellipse 58% 96% at 82% 42%, rgba(216,180,254,0.16), transparent 62%), radial-gradient(ellipse 44% 120% at 54% 76%, rgba(129,140,248,0.15), transparent 58%), radial-gradient(ellipse 68% 104% at 104% 88%, rgba(45,212,191,0.10), transparent 60%)',
  },
  {
    title: 'Community Decks',
    action: 'BROWSE DECKS →',
    to: '/CommunityDecks',
    visual: 'radial-gradient(ellipse at 82% 28%, rgba(20,184,166,0.42), transparent 40%), radial-gradient(ellipse at 18% 108%, rgba(34,197,94,0.24), transparent 48%), linear-gradient(100deg, rgba(255,255,255,0.10), transparent 50%, rgba(15,23,42,0.14))',
    texture: 'radial-gradient(circle at 68% 34%, rgba(153,246,228,0.38) 0 1px, transparent 2px), radial-gradient(circle at 88% 66%, rgba(134,239,172,0.34) 0 1px, transparent 2px), radial-gradient(circle at 42% 78%, rgba(94,234,212,0.28) 0 1px, transparent 2px), linear-gradient(90deg, transparent 0 23%, rgba(153,246,228,0.12) 23.5%, transparent 24%, transparent 47%, rgba(153,246,228,0.10) 47.5%, transparent 48%, transparent 72%, rgba(153,246,228,0.10) 72.5%, transparent 73%), linear-gradient(0deg, transparent 0 28%, rgba(153,246,228,0.10) 28.5%, transparent 29%, transparent 62%, rgba(153,246,228,0.10) 62.5%, transparent 63%)',
  },
  {
    title: 'TCG Encyclopedia',
    action: 'EXPLORE SETS →',
    to: '/set/yugioh/magnificent-monsters',
    visual: 'radial-gradient(ellipse at 76% 30%, rgba(59,130,246,0.34), transparent 40%), radial-gradient(ellipse at 92% 82%, rgba(250,204,21,0.20), transparent 36%), linear-gradient(100deg, rgba(255,255,255,0.10), transparent 48%, rgba(15,23,42,0.12))',
    texture: 'linear-gradient(90deg, transparent 0 58%, rgba(191,219,254,0.16) 58%, rgba(191,219,254,0.16) 59%, transparent 59%, transparent 68%, rgba(191,219,254,0.10) 68%, rgba(191,219,254,0.10) 69%, transparent 69%), linear-gradient(0deg, transparent 0 26%, rgba(191,219,254,0.10) 26.5%, transparent 27%, transparent 51%, rgba(191,219,254,0.08) 51.5%, transparent 52%, transparent 76%, rgba(191,219,254,0.08) 76.5%, transparent 77%), radial-gradient(ellipse at 84% 48%, rgba(147,197,253,0.18), transparent 50%)',
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
              <div
                className="pointer-events-none absolute inset-0 opacity-80 transition-opacity duration-200 group-hover:opacity-95"
                style={{ background: action.texture }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.36),rgba(2,6,23,0.10)_54%,rgba(2,6,23,0.20))]" />
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
