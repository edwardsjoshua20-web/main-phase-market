import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import HomepageContentShell from '@/components/layout/HomepageContentShell';

const gameColors = {
  magic: 'bg-purple-100 text-purple-700',
  pokemon: 'bg-yellow-100 text-yellow-700',
  yugioh: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-700',
};

function getGameLabel(set) {
  const desc = (set.description || '').toLowerCase();
  const name = (set.name || '').toLowerCase();
  if (set.game === 'lorcana' || desc.includes('lorcana') || name.includes('lorcana')) return { label: 'Lorcana', color: 'bg-pink-100 text-pink-700' };
  if (set.game === 'onepiece' || desc.includes('one piece')) return { label: 'One Piece', color: 'bg-red-100 text-red-700' };
  if (set.game === 'fab' || desc.includes('flesh and blood')) return { label: 'Flesh & Blood', color: 'bg-orange-100 text-orange-700' };
  if (set.game === 'starwars' || desc.includes('star wars')) return { label: 'Star Wars', color: 'bg-cyan-100 text-cyan-700' };
  if (set.game === 'magic') return { label: 'Magic', color: gameColors.magic };
  if (set.game === 'pokemon') return { label: 'Pokémon', color: gameColors.pokemon };
  if (set.game === 'yugioh') return { label: 'Yu-Gi-Oh!', color: gameColors.yugioh };
  return { label: set.gameLabel || set.game || 'TCG', color: gameColors.other };
}

export default function NewReleasesBar({ upcomingSets = [] }) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  const releases = React.useMemo(() => (
    upcomingSets.filter((set) => set?.name && (set.releaseDate || set.date))
  ), [upcomingSets]);

  React.useEffect(() => {
    if (currentIndex < releases.length) return;
    setCurrentIndex(0);
  }, [currentIndex, releases.length]);

  const goTo = React.useCallback((nextIndex) => {
    if (releases.length <= 1) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      setCurrentIndex((nextIndex + releases.length) % releases.length);
      window.setTimeout(() => setIsTransitioning(false), 120);
    }, 120);
  }, [releases.length]);

  React.useEffect(() => {
    if (releases.length <= 1 || isPaused) return undefined;
    const interval = window.setInterval(() => {
      goTo(currentIndex + 1);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [currentIndex, goTo, isPaused, releases.length]);

  const goPrev = () => goTo(currentIndex - 1);
  const goNext = () => goTo(currentIndex + 1);

  if (releases.length === 0) {
    return null;
  }

  const current = releases[currentIndex] || releases[0];
  const { label, color } = getGameLabel(current);
  const releaseHref = current.ctaHref
    || current.links?.setDetail
    || current.links?.shopSearch
    || (createPageUrl('Shop') + `?search=${encodeURIComponent(current.name)}`);
  const releaseDate = current.releaseDate || current.date;
  const releaseDateLabel = releaseDate ? format(new Date(releaseDate), 'MMM d') : '';
  const releaseStateLabel = current.releaseStateLabel || '';

  return (
    <section
      className="border-y border-slate-200 bg-slate-100"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <HomepageContentShell className="py-0">
        <div className="grid min-h-[44px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden md:min-h-[46px] md:gap-4">
          <div className="flex shrink-0 items-center gap-2 text-slate-800">
            <Calendar className="h-4 w-4 text-slate-600" />
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-900">
              <span className="sm:hidden">Releases</span>
              <span className="hidden sm:inline">Upcoming Releases</span>
            </span>
          </div>

          <Link
            key={current.releaseKey || current.id || currentIndex}
            to={releaseHref}
            data-release-key={current.releaseKey || current.id || ''}
            data-release-code={current.setCode || ''}
            className={`group min-w-0 transition-all duration-200 ${isTransitioning ? 'translate-x-1 opacity-0' : 'translate-x-0 opacity-100'}`}
          >
            <div className="flex min-w-0 items-center gap-2 text-sm md:gap-3">
              <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold leading-4 ${color}`}>
                {label}
              </span>
              <span className="min-w-0 truncate font-bold text-slate-950">
                {current.name}
              </span>
              {releaseDateLabel && (
                <span className="shrink-0 text-xs font-medium text-slate-500">
                  {releaseDateLabel}
                </span>
              )}
              {releaseStateLabel && (
                <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:inline">
                  {releaseStateLabel}
                </span>
              )}
              <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 transition-colors group-hover:text-slate-950 sm:text-[11px] sm:tracking-[0.18em]">
                VIEW SET <span aria-hidden="true">→</span>
              </span>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous release"
              className="flex h-7 w-6 items-center justify-center text-slate-500 transition-colors hover:text-slate-950 disabled:text-slate-300"
              disabled={releases.length <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next release"
              className="flex h-7 w-6 items-center justify-center text-slate-500 transition-colors hover:text-slate-950 disabled:text-slate-300"
              disabled={releases.length <= 1}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </HomepageContentShell>
    </section>
  );
}
