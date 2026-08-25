import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const games = [
  {
    id: 'magic',
    title: 'Magic: The Gathering',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Magic_the_Gathering_2017.svg',
    logoClassName: 'max-h-[44px] max-w-[150px]',
  },
  {
    id: 'pokemon',
    title: 'Pokemon',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pok%C3%A9mon_Trading_Card_Game_logo.svg',
    logoClassName: 'max-h-[50px] max-w-[145px]',
  },
  {
    id: 'yugioh',
    title: 'Yu-Gi-Oh!',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yu-Gi-Oh!.png',
    logoClassName: 'max-h-[48px] max-w-[145px]',
  },
  {
    id: 'lorcana',
    title: 'Disney Lorcana',
    logoSrc: '/images/disney-lorcana-logo.png',
    logoClassName: 'max-h-[52px] max-w-[156px]',
  },
  {
    id: 'flesh_and_blood',
    title: 'Flesh & Blood',
    logoSrc: 'https://uchroniesgames.fr/web/image/event.event/168/image_1024',
    logoClassName: 'max-h-[44px] max-w-[150px]',
  },
  {
    id: 'onepiece',
    title: 'One Piece',
    logoSrc: '/images/oplogo.webp',
    logoClassName: 'max-h-[45px] max-w-[152px]',
  },
  {
    id: 'starwars',
    title: 'Star Wars Unlimited',
    logoSrc: '/images/star-wars-unlimited-logo.png',
    logoClassName: 'max-h-[52px] max-w-[142px]',
  }
];

export default function GameTabs() {
  return (
    <section className="bg-white py-4">
      <HomepageContentShell>
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">Shop by Game</h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {games.map((game) => (
            <Link
              key={game.id}
              to={createPageUrl('Shop') + `?game=${game.id}`}
              className="group flex h-[82px] items-center justify-center rounded-[3px] border border-slate-200 bg-white px-3 text-center shadow-[0_3px_10px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_7px_14px_rgba(15,23,42,0.075)]"
            >
              <img
                src={game.logoSrc}
                alt={game.title}
                loading="lazy"
                className={`h-auto w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02] ${game.logoClassName}`}
              />
              <span className="sr-only">{game.title}</span>
            </Link>
          ))}
        </div>
      </HomepageContentShell>
    </section>
  );
}
