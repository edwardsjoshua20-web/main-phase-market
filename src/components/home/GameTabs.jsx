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
  }
];

export default function GameTabs() {
  return (
    <section className="py-12 bg-white">
      <HomepageContentShell>
        <div className="mb-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950">Shop by Game</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {games.map((game) => (
            <Link
              key={game.id}
              to={createPageUrl('Shop') + `?game=${game.id}`}
              className="group relative min-h-[12.75rem] overflow-hidden rounded-[1rem] bg-slate-900 shadow-[0_20px_40px_rgba(15,23,42,0.12)] ring-1 ring-black/10 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(15,23,42,0.16)]"
            >
              <div
                className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-300 group-hover:scale-[1.02]"
                style={{ backgroundImage: `url(${game.image})`, backgroundPosition: game.position }}
              />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0.05)_18%,rgba(2,6,23,0.22)_40%,rgba(2,6,23,0.72)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.68)_0%,rgba(2,6,23,0.24)_20%,rgba(2,6,23,0.02)_50%,rgba(2,6,23,0.24)_80%,rgba(2,6,23,0.68)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.58)_0%,rgba(2,6,23,0.16)_22%,rgba(2,6,23,0.02)_50%,rgba(2,6,23,0.42)_100%)]" />

              <div className="relative flex min-h-[12.75rem] items-center justify-center px-10 py-10 text-center">
                <div className="max-w-[20rem]">
                  <h3 className="text-[2rem] font-black leading-[1.02] tracking-tight text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.55)] md:text-[2.35rem]">
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
