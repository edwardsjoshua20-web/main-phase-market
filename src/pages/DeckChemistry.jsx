import { useEffect, useState } from 'react';
import { ArrowRight, Database, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import CardImage from '@/components/cards/CardImage';
import { searchMtgCommanders } from '@/lib/mtgCommanderCatalog';

const chemistryGames = [
  {
    id: 'magic',
    name: 'Magic: The Gathering',
    description: 'Commander cards, themes, and synergy.',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Magic_the_Gathering_2017.svg',
    logoClassName: 'max-h-11 max-w-[170px] brightness-0 invert',
    backgroundSrc: '/images/game-mtg.png',
    backgroundPosition: 'center 30%',
    available: true
  },
  {
    id: 'pokemon',
    name: 'Pokémon',
    description: 'Evolution lines and deck archetypes.',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pok%C3%A9mon_Trading_Card_Game_logo.svg',
    logoClassName: 'max-h-12 max-w-[160px]',
    backgroundSrc: '/images/game-pokemon.webp',
    backgroundPosition: 'center'
  },
  {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    description: 'Engines, combos, and archetypes.',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yu-Gi-Oh!.png',
    logoClassName: 'max-h-12 max-w-[160px]',
    backgroundSrc: '/images/game-yugioh.jpg',
    backgroundPosition: 'center'
  },
  {
    id: 'lorcana',
    name: 'Disney Lorcana',
    description: 'Ink curves and character synergy.',
    logoSrc: '/images/disney-lorcana-logo.png',
    logoClassName: 'max-h-14 max-w-[170px]',
    backgroundSrc: '/images/game-lorcana.png',
    backgroundPosition: 'center 25%'
  },
  {
    id: 'flesh-and-blood',
    name: 'Flesh and Blood',
    description: 'Heroes, equipment, and pitch balance.',
    logoSrc: 'https://uchroniesgames.fr/web/image/event.event/168/image_1024',
    logoClassName: 'max-h-12 max-w-[165px]',
    backgroundSrc: '/images/game-fab.jpg',
    backgroundPosition: 'center'
  },
  {
    id: 'one-piece',
    name: 'One Piece',
    description: 'Leaders, colors, and deck engines.',
    logoSrc: '/images/oplogo.webp',
    logoClassName: 'max-h-12 max-w-[170px] brightness-0 invert',
    backgroundSrc: '/images/game-onepiece.png',
    backgroundPosition: 'center 30%'
  },
  {
    id: 'star-wars-unlimited',
    name: 'Star Wars Unlimited',
    description: 'Leaders, aspects, and arena strategy.',
    logoSrc: '/images/star-wars-unlimited-logo.png',
    logoClassName: 'max-h-14 max-w-[150px] brightness-0 invert',
    backgroundClassName: 'bg-[radial-gradient(circle_at_82%_22%,rgba(96,165,250,0.28),transparent_24%),radial-gradient(circle_at_18%_76%,rgba(255,255,255,0.12)_0_1px,transparent_2px),linear-gradient(145deg,#15263e,#070b13)]'
  }
];

const howItWorks = [
  {
    title: 'Real Deck Data',
    description: 'Real community decks reveal meaningful card relationships.',
    icon: Database
  },
  {
    title: 'Fresh & Evolving',
    description: 'Automatically updated as new decks are discovered.',
    icon: RefreshCw
  },
  {
    title: 'Smart Recommendations',
    description: 'Proven chemistry surfaces stronger cards and strategies.',
    icon: Sparkles
  }
];

const confidenceLabels = {
  strong: 'Strong sample',
  usable: 'Usable sample',
  low: 'Low confidence',
  insufficient: 'Insufficient sample'
};

function ChemistryGameCard({ game }) {
  const content = (
    <>
      {game.backgroundSrc && (
        <img
          src={game.backgroundSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-45 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-55"
          style={{ objectPosition: game.backgroundPosition }}
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,10,20,0.96),rgba(4,10,20,0.70)_52%,rgba(4,10,20,0.40))]" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#050a12] to-transparent" />

      <div className="relative flex min-h-[176px] flex-col justify-between p-5">
        <div className="flex min-h-[54px] items-center">
          <img
            src={game.logoSrc}
            alt={game.name}
            className={`h-auto w-auto object-contain opacity-95 ${game.logoClassName}`}
          />
        </div>
        <div>
          <p className="text-base font-semibold text-white">{game.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{game.description}</p>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
            <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${game.available ? 'text-sky-300' : 'text-slate-400'}`}>
              {game.available ? 'Live now' : 'Coming soon'}
            </span>
            <span className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${game.available ? 'text-white' : 'text-slate-500'}`}>
              Explore <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </>
  );

  const className = `group relative min-h-[176px] overflow-hidden rounded-[3px] border transition duration-200 ${game.backgroundClassName || 'bg-[#0c1726]'} ${
    game.available
      ? 'border-sky-300/35 hover:-translate-y-0.5 hover:border-sky-300/60'
      : 'border-white/10'
  }`;

  return game.available ? (
    <Link to="/DeckChemistry/magic" className={className}>{content}</Link>
  ) : (
    <div aria-disabled="true" className={className}>{content}</div>
  );
}

function TrendingChemistryCard({ commander }) {
  return (
    <Link
      to={`/commanders/${encodeURIComponent(commander.oracle_id)}`}
      className="group flex min-w-0 gap-3 border-t border-white/10 py-3 transition-colors hover:border-sky-300/40"
    >
      <div className="h-[94px] w-[68px] shrink-0 overflow-hidden rounded-[2px] bg-slate-900">
        <CardImage
          card={commander}
          alt={commander.name}
          className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.025]"
          renderFallback={() => <div className="h-full w-full bg-[#111c2b]" />}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white group-hover:text-sky-200">{commander.name}</p>
        <p className="mt-2 text-xs text-slate-400">{Number(commander.deck_count || 0).toLocaleString()} decks analyzed</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">
          {confidenceLabels[commander.confidence_tier] || commander.confidence_tier}
        </p>
      </div>
    </Link>
  );
}

export default function DeckChemistry() {
  const [trendingCommanders, setTrendingCommanders] = useState([]);

  useEffect(() => {
    let mounted = true;

    searchMtgCommanders('', { limit: 5, minDeckCount: 1 })
      .then((payload) => {
        if (!mounted) return;
        setTrendingCommanders((payload.results || []).filter((commander) => commander.analytics_eligible).slice(0, 5));
      })
      .catch(() => {
        if (mounted) setTrendingCommanders([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#070c14] text-white">
      <section className="relative h-[224px] overflow-hidden border-b border-white/10 sm:h-[244px] lg:h-[264px]">
        <img
          src="/images/deck-chemistry-banner.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,8,18,0.97)_0%,rgba(3,8,18,0.84)_32%,rgba(3,8,18,0.20)_70%,rgba(3,8,18,0.08)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050a12]/55 to-transparent" />

        <div className="relative mx-auto flex h-full w-full max-w-[1600px] items-center px-5 sm:px-8 lg:px-12">
          <div className="max-w-[610px]">
            <h1 className="text-4xl font-black leading-none sm:text-5xl">Deck Chemistry</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base">
              Discover the cards and combinations that make decks click across every TCG.
            </p>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1600px] space-y-11 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Explore by game</p>
              <h2 className="mt-1.5 text-2xl font-bold tracking-tight">Find your chemistry</h2>
            </div>
            <p className="text-xs text-slate-400">Magic is live. More games are coming next.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {chemistryGames.map((game) => <ChemistryGameCard key={game.id} game={game} />)}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Trending Deck Chemistry</h2>
              <p className="mt-1 text-xs text-slate-400">Magic: The Gathering · Live commander data</p>
            </div>
            <Link to="/DeckChemistry/magic" className="hidden items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-300 hover:text-sky-200 sm:flex">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {trendingCommanders.length > 0 ? (
            <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 lg:grid-cols-5">
              {trendingCommanders.map((commander) => (
                <TrendingChemistryCard key={commander.oracle_id} commander={commander} />
              ))}
            </div>
          ) : (
            <div className="border-t border-white/10 py-5 text-sm text-slate-500">Loading live chemistry profiles...</div>
          )}
        </section>

        <section className="border-y border-white/10 py-5">
          <h2 className="mb-5 text-xl font-bold tracking-tight">How Deck Chemistry Works</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-0">
            {howItWorks.map(({ title, description, icon: Icon }, index) => (
              <div key={title} className={`flex gap-3 sm:px-5 ${index === 0 ? 'sm:pl-0' : 'sm:border-l sm:border-white/10'} ${index === howItWorks.length - 1 ? 'sm:pr-0' : ''}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
