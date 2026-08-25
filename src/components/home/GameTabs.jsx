import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const games = [
  {
    id: 'magic',
    title: 'Magic: The Gathering',
    mark: 'MAGIC',
    submark: 'The Gathering',
    accent: 'text-orange-600',
  },
  {
    id: 'pokemon',
    title: 'Pokemon',
    mark: 'Pokemon',
    submark: 'Trading Card Game',
    accent: 'text-blue-600',
  },
  {
    id: 'yugioh',
    title: 'Yu-Gi-Oh!',
    mark: 'Yu-Gi-Oh!',
    submark: 'Trading Card Game',
    accent: 'text-red-700',
  },
  {
    id: 'lorcana',
    title: 'Disney Lorcana',
    mark: 'Lorcana',
    submark: 'Disney Trading Card Game',
    accent: 'text-indigo-700',
  },
  {
    id: 'flesh_and_blood',
    title: 'Flesh & Blood',
    mark: 'Flesh and Blood',
    submark: 'TCG',
    accent: 'text-rose-800',
  },
  {
    id: 'onepiece',
    title: 'One Piece',
    mark: 'One Piece',
    submark: 'Card Game',
    accent: 'text-slate-950',
  },
  {
    id: 'starwars',
    title: 'Star Wars Unlimited',
    mark: 'Star Wars',
    submark: 'Unlimited',
    accent: 'text-slate-950',
  }
];

export default function GameTabs() {
  return (
    <section className="bg-white py-5">
      <HomepageContentShell>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">Shop by Game</h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {games.map((game) => (
            <Link
              key={game.id}
              to={createPageUrl('Shop') + `?game=${game.id}`}
              className="group flex h-[82px] items-center justify-center rounded-[4px] border border-slate-200 bg-white px-3 text-center shadow-[0_4px_12px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500 hover:shadow-[0_8px_18px_rgba(15,23,42,0.09)]"
            >
              <div className="min-w-0">
                <p className={`text-[1.18rem] font-black leading-none tracking-tight ${game.accent}`}>
                  {game.mark}
                </p>
                <p className="mt-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {game.submark}
                </p>
              </div>
              <span className="sr-only">{game.title}</span>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
