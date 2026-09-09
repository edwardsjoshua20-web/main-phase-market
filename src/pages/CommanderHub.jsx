import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import CardImage from '@/components/cards/CardImage';
import { CardHoverPreview, useCardHoverPreview } from '@/components/cards/CardPresentation';
import { useCommanderHubData } from '@/hooks/useCommanderHubData';

const colorFilters = [
  { value: 'all', label: 'All colors' },
  { value: 'W', label: 'White' },
  { value: 'U', label: 'Blue' },
  { value: 'B', label: 'Black' },
  { value: 'R', label: 'Red' },
  { value: 'G', label: 'Green' },
  { value: 'multicolor', label: 'Multicolor' },
  { value: 'colorless', label: 'Colorless' }
];

const confidenceFilters = [
  { value: 'all', label: 'All samples' },
  { value: 'strong', label: 'Strong · 20+' },
  { value: 'usable', label: 'Usable · 10–19' },
  { value: 'low', label: 'Low · 5–9' },
  { value: 'insufficient', label: 'Insufficient · 1–4' }
];

const deckCountFilters = [
  { value: 'all', label: 'Any deck count' },
  { value: '20', label: '20+ decks' },
  { value: '10', label: '10+ decks' },
  { value: '5', label: '5+ decks' }
];

function formatUpdatedAt(value) {
  if (!value) return 'Freshness unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Freshness unavailable';
  return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function getBrowseSampleCount(commander) {
  return Number(commander?.unique_configuration_count ?? commander?.deck_count ?? 0);
}

function hasLimitedData(commander) {
  return ['low', 'insufficient'].includes(commander?.confidence_tier);
}

function TopCommanderCard({ commander, onPreviewEnter, onPreviewLeave }) {
  const sampleCount = getBrowseSampleCount(commander);

  return (
    <Link
      to={`/commanders/${encodeURIComponent(commander.oracle_id)}`}
      className="group relative aspect-[5/7] overflow-hidden rounded-[3px] bg-[#0b1624] ring-1 ring-white/10 transition hover:ring-sky-300/45"
      onMouseEnter={() => onPreviewEnter(commander)}
      onMouseLeave={onPreviewLeave}
    >
      <CardImage
        card={commander}
        alt={commander.name}
        className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.015]"
        renderFallback={() => <div className="h-full w-full bg-[linear-gradient(145deg,#15253a,#090f19)]" />}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-black/10" />
      <span className="absolute left-2 top-2 bg-black/75 px-1.5 py-0.5 text-xs font-black text-white">#{commander.rank}</span>
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <h3 className="line-clamp-2 text-xs font-bold leading-tight text-white">{commander.name}</h3>
        <p className="mt-1 text-[10px] font-semibold text-slate-300">{sampleCount.toLocaleString()} decks</p>
      </div>
    </Link>
  );
}

function FilterSelect({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="relative min-w-[150px] flex-1 sm:flex-none">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        className="h-9 w-full appearance-none rounded-[4px] border border-white/10 bg-[#101925] px-3 pr-8 text-xs font-semibold text-slate-200 outline-none transition hover:border-white/20 focus:border-sky-400/50 disabled:cursor-not-allowed disabled:text-slate-500 sm:w-auto sm:min-w-[150px]"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
    </label>
  );
}

function BrowseCommanderCard({ commander, onPreviewEnter, onPreviewLeave }) {
  const sampleCount = getBrowseSampleCount(commander);

  return (
    <Link
      to={`/commanders/${encodeURIComponent(commander.oracle_id)}`}
      className="group relative aspect-[4/5] overflow-hidden rounded-[3px] bg-[#0b1624] ring-1 ring-white/[0.07] transition hover:ring-white/20"
    >
      <div className="absolute inset-0 overflow-hidden bg-[#080e17]" onMouseEnter={() => onPreviewEnter(commander)} onMouseLeave={onPreviewLeave}>
        <CardImage
          card={commander}
          alt={commander.name}
          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.015]"
          renderFallback={() => (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_55%),linear-gradient(180deg,#101827,#090c14)]">
              <span className="text-3xl font-black text-white/15">{commander.name?.charAt(0)}</span>
            </div>
          )}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
      {hasLimitedData(commander) && (
        <span className="absolute right-2 top-2 bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-300">Limited data</span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white">{commander.name}</h3>
        <p className="mt-1 text-[10px] font-semibold text-slate-300">{sampleCount.toLocaleString()} decks</p>
      </div>
    </Link>
  );
}

export default function CommanderHub() {
  const cardPreview = useCardHoverPreview();
  const browseSectionRef = useRef(null);
  const [colorFilter, setColorFilter] = useState('all');
  const [archetypeFilter, setArchetypeFilter] = useState('all');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [deckCountFilter, setDeckCountFilter] = useState('all');
  const [sortMode, setSortMode] = useState('rank');
  const [visibleCount, setVisibleCount] = useState(48);
  const {
    browseLoading,
    browseResults,
    browseTotal,
    featuredLoading,
    manifest,
    rankedFeatured,
    search,
    setSearch,
    submitSearch
  } = useCommanderHubData();

  const filteredCommanders = useMemo(() => {
    const result = browseResults.filter((commander) => {
      const colors = commander.color_identity || [];
      const colorMatches = colorFilter === 'all'
        || (colorFilter === 'multicolor' && colors.length > 1)
        || (colorFilter === 'colorless' && colors.length === 0)
        || (colorFilter.length === 1 && colors.includes(colorFilter));
      const confidenceMatches = confidenceFilter === 'all' || commander.confidence_tier === confidenceFilter;
      const archetypeMatches = archetypeFilter === 'all'
        || (commander.archetypes || []).some((archetype) => archetype.slug === archetypeFilter);
      const deckCountMatches = deckCountFilter === 'all' || getBrowseSampleCount(commander) >= Number(deckCountFilter);
      return colorMatches && archetypeMatches && confidenceMatches && deckCountMatches;
    });

    if (sortMode === 'az') return [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'popular') {
      return [...result].sort((a, b) => getBrowseSampleCount(b) - getBrowseSampleCount(a) || a.name.localeCompare(b.name));
    }
    return result;
  }, [browseResults, colorFilter, archetypeFilter, confidenceFilter, deckCountFilter, sortMode]);

  useEffect(() => {
    setVisibleCount(48);
  }, [search, colorFilter, archetypeFilter, confidenceFilter, deckCountFilter, sortMode]);

  const visibleCommanders = filteredCommanders.slice(0, visibleCount);
  const profileCount = manifest?.positive_commander_count || browseTotal || browseResults.length;
  const updatedAt = manifest?.last_publication_time || manifest?.generated_at;
  const trendingArchetypes = manifest?.trending_archetypes || [];
  const archetypeOptions = [
    { value: 'all', label: 'All archetypes' },
    ...trendingArchetypes.map((archetype) => ({ value: archetype.slug, label: archetype.label }))
  ];

  const selectArchetype = (slug) => {
    setArchetypeFilter(slug);
    requestAnimationFrame(() => browseSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="border-b border-white/10 bg-[#0d1420]">
        <div className="px-5 py-5 sm:px-6 xl:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Magic: The Gathering</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white md:text-4xl">Deck Chemistry</h1>
            </div>
            <p className="pb-1 text-xs font-medium text-slate-400">
              {Number(profileCount || 0).toLocaleString()} commander profiles <span className="mx-2 text-slate-700">·</span> {formatUpdatedAt(updatedAt)}
            </p>
          </div>

          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <div className="relative max-w-5xl">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search for a commander..."
                className="h-10 rounded-[4px] border-white/10 bg-white/[0.045] pl-10 text-white placeholder:text-slate-500 focus-visible:border-sky-400/50 focus-visible:ring-sky-500/20"
              />
            </div>
          </form>
        </div>
      </div>

      <div className="space-y-9 px-5 py-6 sm:px-6 xl:px-10">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <h2 className="mb-4 text-xl font-black tracking-tight text-white">Popular Right Now</h2>

            {featuredLoading ? (
              <div className="flex min-h-[180px] items-center justify-center gap-3 border-y border-white/10 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
                <span>Loading commanders...</span>
              </div>
            ) : rankedFeatured.length === 0 ? (
              <div className="border-y border-white/10 py-12 text-center text-sm text-slate-400">Popular commanders are unavailable.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {rankedFeatured.slice(0, 6).map((commander) => (
                  <TopCommanderCard
                    key={commander.oracle_id}
                    commander={commander}
                    onPreviewEnter={cardPreview.showPreview}
                    onPreviewLeave={cardPreview.hidePreview}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <h2 className="mb-3 text-xl font-black tracking-tight text-white">Trending Archetypes</h2>
            <div className="divide-y divide-white/[0.07] border-y border-white/10">
              {trendingArchetypes.map((archetype) => (
                <button
                  key={archetype.slug}
                  type="button"
                  onClick={() => selectArchetype(archetype.slug)}
                  className="group flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition hover:bg-white/[0.035]"
                >
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-white">{archetype.label}</span>
                  <span className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                    {Number(archetype.deck_count || 0).toLocaleString()} decks
                    <ChevronRight className="h-3.5 w-3.5 text-sky-300/70 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </section>

        <section ref={browseSectionRef} className="scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white">Browse Commanders</h2>
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
              {filteredCommanders.length.toLocaleString()} profiles
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            <FilterSelect label="Color identity" value={colorFilter} onChange={setColorFilter} options={colorFilters} />
            <FilterSelect label="Archetype" value={archetypeFilter} onChange={setArchetypeFilter} options={archetypeOptions} />
            <FilterSelect label="Confidence" value={confidenceFilter} onChange={setConfidenceFilter} options={confidenceFilters} />
            <FilterSelect label="Deck count" value={deckCountFilter} onChange={setDeckCountFilter} options={deckCountFilters} />
            <FilterSelect
              label="Sort"
              value={sortMode}
              onChange={setSortMode}
              options={[
                { value: 'rank', label: 'Rank order' },
                { value: 'popular', label: 'Most analyzed' },
                { value: 'az', label: 'A–Z' }
              ]}
            />
          </div>

          {browseLoading ? (
            <div className="flex items-center justify-center gap-3 border-y border-white/10 px-6 py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
              <span>Loading commander search...</span>
            </div>
          ) : filteredCommanders.length === 0 ? (
            <div className="border-y border-white/10 px-6 py-14 text-center">
              <p className="text-lg font-semibold text-white">No commanders found.</p>
              <p className="mt-2 text-sm text-slate-400">Try a different search or broaden the filters.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
              {visibleCommanders.map((commander) => (
                <BrowseCommanderCard
                  key={commander.oracle_id}
                  commander={commander}
                  onPreviewEnter={cardPreview.showPreview}
                  onPreviewLeave={cardPreview.hidePreview}
                />
              ))}
            </div>
              {visibleCount < filteredCommanders.length && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((current) => current + 48)}
                    className="border-b border-sky-300/50 px-1 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 transition hover:border-sky-200 hover:text-white"
                  >
                    Show more commanders
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <CardHoverPreview card={cardPreview.card} showMetadata={false} />
    </div>
  );
}
