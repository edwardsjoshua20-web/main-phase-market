import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const chemistryGames = [
  {
    id: 'magic',
    name: 'Magic: The Gathering',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Magic_the_Gathering_2017.svg',
    logoClassName: 'max-h-12 max-w-[190px] brightness-0 invert',
    available: true
  },
  {
    id: 'pokemon',
    name: 'Pokémon',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pok%C3%A9mon_Trading_Card_Game_logo.svg',
    logoClassName: 'max-h-14 max-w-[180px]'
  },
  {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yu-Gi-Oh!.png',
    logoClassName: 'max-h-14 max-w-[180px]'
  },
  {
    id: 'lorcana',
    name: 'Disney Lorcana',
    logoSrc: '/images/disney-lorcana-logo.png',
    logoClassName: 'max-h-16 max-w-[190px]'
  },
  {
    id: 'flesh-and-blood',
    name: 'Flesh and Blood',
    logoSrc: 'https://uchroniesgames.fr/web/image/event.event/168/image_1024',
    logoClassName: 'max-h-14 max-w-[185px]'
  },
  {
    id: 'one-piece',
    name: 'One Piece',
    logoSrc: '/images/oplogo.webp',
    logoClassName: 'max-h-14 max-w-[185px] brightness-0 invert'
  },
  {
    id: 'star-wars-unlimited',
    name: 'Star Wars Unlimited',
    logoSrc: '/images/star-wars-unlimited-logo.png',
    logoClassName: 'max-h-16 max-w-[170px] brightness-0 invert'
  }
];

function ChemistryGameCard({ game }) {
  const content = (
    <>
      <div className="flex min-h-[76px] items-center">
        <img
          src={game.logoSrc}
          alt={game.name}
          className={`h-auto w-auto object-contain opacity-90 ${game.logoClassName}`}
        />
      </div>
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
        <div>
          <p className="text-sm font-semibold text-white">{game.name}</p>
          <p className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${game.available ? 'text-sky-300' : 'text-slate-500'}`}>
            {game.available ? 'Live now' : 'Coming soon'}
          </p>
        </div>
        {game.available && <ArrowRight className="h-4 w-4 text-sky-300 transition-transform group-hover:translate-x-1" />}
      </div>
    </>
  );

  if (game.available) {
    return (
      <Link
        to="/DeckChemistry/magic"
        className="group relative min-h-[170px] overflow-hidden rounded-[3px] border border-sky-300/25 bg-[radial-gradient(circle_at_85%_0%,rgba(56,189,248,0.18),transparent_42%),linear-gradient(145deg,#10243a,#08111f)] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-[#10243a]"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      aria-disabled="true"
      className="min-h-[170px] rounded-[3px] border border-white/[0.08] bg-white/[0.025] p-5"
    >
      {content}
    </div>
  );
}

export default function DeckChemistry() {
  return (
    <div className="min-h-screen bg-[#070c14] text-white">
      <section className="relative min-h-[360px] overflow-hidden border-b border-white/10 sm:min-h-[420px] lg:min-h-[470px]">
        <img
          src="/images/deck-chemistry-banner.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,8,18,0.96)_0%,rgba(3,8,18,0.84)_30%,rgba(3,8,18,0.25)_68%,rgba(3,8,18,0.10)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,15,0.10),rgba(2,6,15,0.48))]" />

        <div className="relative mx-auto flex min-h-[360px] w-full max-w-[1600px] items-center px-5 py-14 sm:min-h-[420px] sm:px-8 lg:min-h-[470px] lg:px-12">
          <div className="max-w-[620px]">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Main Phase Intelligence</p>
            <h1 className="text-4xl font-black leading-none tracking-[0.01em] sm:text-6xl lg:text-7xl">Deck Chemistry</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-200 sm:text-lg">
              Discover the cards, strategies, and connections that make decks work across every game you play.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1600px] px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Choose your game</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Explore deck chemistry</h2>
          </div>
          <p className="max-w-md text-sm text-slate-400">Magic analysis is live. More TCG experiences are being built on the same foundation.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {chemistryGames.map((game) => <ChemistryGameCard key={game.id} game={game} />)}
        </div>
      </section>
    </div>
  );
}
