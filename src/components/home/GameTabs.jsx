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
    logoSrc: 'https://files.elfsightcdn.com/eafe4a4d-3436-495d-b748-5bdce62d911d/95be4c15-501c-4a8f-8c58-05f4f8a87527/Disney-Lorcana_TCG_Logo-transparent-780x470.webp',
    logoClassName: 'max-h-[46px] max-w-[150px]',
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
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/One_piece_logo.svg',
    logoClassName: 'max-h-[46px] max-w-[150px]',
  },
  {
    id: 'starwars',
    title: 'Star Wars Unlimited',
    logoSrc: 'https://starwarsunlimited.com/_next/image?q=75&url=https%3A%2F%2Fcdn.starwarsunlimited.com%2FSWH_01_pressrelease_1920x1080_plain_27f07ee8bb.jpg&w=3840',
    logoClassName: 'max-h-[52px] max-w-[132px]',
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
