import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const games = [
  {
    id: 'magic',
    title: 'Magic: The Gathering',
    image: '/images/game-mtg.png',
    position: 'center 34%'
  },
  {
    id: 'pokemon',
    title: 'Pokemon',
    image: '/images/game-pokemon.webp',
    position: 'center 24%'
  },
  {
    id: 'yugioh',
    title: 'Yu-Gi-Oh!',
    image: '/images/game-yugioh.jpg',
    position: 'center center'
  },
  {
    id: 'onepiece',
    title: 'One Piece',
    image: '/images/game-onepiece.png',
    position: 'center center'
  },
  {
    id: 'lorcana',
    title: 'Disney Lorcana',
    image: '/images/game-lorcana.png',
    position: 'center 18%'
  },
  {
    id: 'flesh_and_blood',
    title: 'Flesh & Blood',
    image: '/images/game-fab.jpg',
    position: 'center center'
  },
  {
    id: 'starwars',
    title: 'Star Wars Unlimited',
    image: null,
    position: 'center center',
    initials: 'SWU'
  }
];

export default function GameTabs() {
  return (
    <section className="bg-white py-8">
      <HomepageContentShell>
        <div className="mb-4 flex items-end justify-between border-b border-slate-200 pb-3">
          <div>
            <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Catalog</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Shop by Game</h2>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:grid-cols-7">
          {games.map((game) => (
            <Link
              key={game.id}
              to={createPageUrl('Shop') + `?game=${game.id}`}
              className="group relative overflow-hidden rounded-[7px] border border-slate-200 bg-slate-950 shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
            >
              {game.image ? (
                <div
                  className="absolute inset-0 bg-cover bg-no-repeat opacity-80 transition-transform duration-300 group-hover:scale-[1.03]"
                  style={{ backgroundImage: `url(${game.image})`, backgroundPosition: game.position }}
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(14,165,233,0.24),transparent_34%),linear-gradient(135deg,#020814,#102338)]" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.48)_52%,rgba(2,6,23,0.88)_100%)]" />

              <div className="relative flex h-[104px] items-end p-3">
                <div className="min-w-0">
                  {game.initials && (
                    <p className="mb-1 text-[0.68rem] font-black uppercase tracking-[0.2em] text-sky-200">{game.initials}</p>
                  )}
                  <h3 className="text-sm font-semibold leading-tight text-white drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)] line-clamp-2">
                    {game.title}
                  </h3>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
