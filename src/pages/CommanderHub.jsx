import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ColorIdentity from '@/components/commander/ColorIdentity';
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

const confidenceLabels = {
  strong: 'Strong sample',
  usable: 'Usable sample',
  low: 'Low confidence',
  insufficient: 'Insufficient sample'
};

function formatUpdatedAt(value) {
  if (!value) return 'Freshness unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Freshness unavailable';
  return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function getFeaturedSignals(commander, detail) {
  if (!commander?.analytics_eligible || detail?.analytics_suppressed) {
    return { theme: null, recommendation: null };
  }

  const theme = [...(detail?.theme_options || [])]
    .filter((item) => Number(item.deck_count || 0) > 0)
    .sort((a, b) => Number(b.deck_count || 0) - Number(a.deck_count || 0))[0] || null;
  const recommendation = detail?.top_synergy_cards?.[0] || null;
  return { theme, recommendation };
}

function getFeaturedSampleCount(commander, detail) {
  return Number(detail?.sample_confidence?.deck_count ?? commander?.deck_count ?? 0);
}

function PrimaryFeaturedProfile({ commander, detail }) {
  const { theme, recommendation } = getFeaturedSignals(commander, detail);
  const art = detail?.commander?.image_art_crop || commander.image_url;
  const sampleCount = getFeaturedSampleCount(commander, detail);

  return (
    <Link
      to={`/commanders/${encodeURIComponent(commander.oracle_id)}`}
      className="group relative flex min-h-[330px] overflow-hidden rounded-[4px] border border-sky-300/25 bg-[#0b1624] transition hover:border-sky-300/50"
    >
      {art && <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-65 transition duration-500 group-hover:scale-[1.015]" />}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,8,18,0.97)_0%,rgba(3,8,18,0.90)_38%,rgba(3,8,18,0.28)_78%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#030812] via-transparent to-black/20" />

      <div className="relative flex max-w-[620px] flex-col justify-between p-6 sm:p-8">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">#1 Featured Chemistry</span>
          <h3 className="mt-3 max-w-lg text-3xl font-black leading-tight text-white sm:text-4xl">{commander.name}</h3>
          <div className="mt-4"><ColorIdentity colors={commander.color_identity || []} /></div>
        </div>

        <div className="mt-8">
          <div className="grid max-w-lg grid-cols-2 gap-x-5 gap-y-3 border-y border-white/10 py-4 text-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Sample</p>
              <p className="mt-1 font-semibold text-white">{sampleCount.toLocaleString()} decks</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Confidence</p>
              <p className="mt-1 font-semibold text-sky-300">{confidenceLabels[commander.confidence_tier] || commander.confidence_tier}</p>
            </div>
            {theme && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Leading theme</p>
                <p className="mt-1 font-semibold text-white">{theme.label}</p>
              </div>
            )}
            {recommendation && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Strong chemistry</p>
                <p className="mt-1 line-clamp-1 font-semibold text-white">{recommendation.card_name}</p>
              </div>
            )}
          </div>
          <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white">
            View Chemistry <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function SecondaryFeaturedProfile({ commander, detail }) {
  const { theme, recommendation } = getFeaturedSignals(commander, detail);
  const art = detail?.commander?.image_art_crop || commander.image_url;
  const sampleCount = getFeaturedSampleCount(commander, detail);

  return (
    <Link
      to={`/commanders/${encodeURIComponent(commander.oracle_id)}`}
      className="group relative min-h-[156px] overflow-hidden rounded-[4px] border border-white/10 bg-[#0b1624] p-4 transition hover:border-sky-300/40 hover:bg-[#0e1b2b]"
    >
      {art && <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-30 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-40" />}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,9,18,0.96)_0%,rgba(4,9,18,0.88)_58%,rgba(4,9,18,0.38)_100%)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">#{commander.rank}</span>
            <ColorIdentity colors={commander.color_identity || []} />
          </div>
          <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-tight text-white">{commander.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
            <span>{sampleCount.toLocaleString()} decks</span>
            <span className="text-sky-300">{confidenceLabels[commander.confidence_tier] || commander.confidence_tier}</span>
          </div>
          {(theme || recommendation) && (
            <p className="mt-2 line-clamp-1 text-xs text-slate-400">
              {theme ? theme.label : recommendation.card_name}
            </p>
          )}
        </div>
        <span className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
          View Chemistry <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
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
  return (
    <Link
      to={`/commanders/${encodeURIComponent(commander.oracle_id)}`}
      className="group overflow-hidden rounded-[3px] bg-white/[0.035] transition hover:bg-white/[0.065]"
    >
      <div className="aspect-[5/7] overflow-hidden bg-[#080e17]" onMouseEnter={() => onPreviewEnter(commander)} onMouseLeave={onPreviewLeave}>
        <CardImage
          card={commander}
          alt={commander.name}
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.015]"
          renderFallback={() => (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_55%),linear-gradient(180deg,#101827,#090c14)]">
              <span className="text-3xl font-black text-white/15">{commander.name?.charAt(0)}</span>
            </div>
          )}
        />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white">{commander.name}</h3>
          <ColorIdentity colors={commander.color_identity || []} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px]">
          <span className="font-semibold text-slate-300">{Number(commander.deck_count || 0).toLocaleString()} decks</span>
          <span className="text-slate-500">{confidenceLabels[commander.confidence_tier] || commander.confidence_tier}</span>
        </div>
      </div>
    </Link>
  );
}

export default function CommanderHub() {
  const cardPreview = useCardHoverPreview();
  const [colorFilter, setColorFilter] = useState('all');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [deckCountFilter, setDeckCountFilter] = useState('all');
  const [sortMode, setSortMode] = useState('rank');
  const [visibleCount, setVisibleCount] = useState(48);
  const {
    browseLoading,
    browseResults,
    browseTotal,
    featuredDetails,
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
      const deckCountMatches = deckCountFilter === 'all' || Number(commander.deck_count || 0) >= Number(deckCountFilter);
      return colorMatches && confidenceMatches && deckCountMatches;
    });

    if (sortMode === 'az') return [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'popular') {
      return [...result].sort((a, b) => Number(b.deck_count || 0) - Number(a.deck_count || 0) || a.name.localeCompare(b.name));
    }
    return result;
  }, [browseResults, colorFilter, confidenceFilter, deckCountFilter, sortMode]);

  useEffect(() => {
    setVisibleCount(48);
  }, [search, colorFilter, confidenceFilter, deckCountFilter, sortMode]);

  const visibleCommanders = filteredCommanders.slice(0, visibleCount);
  const profileCount = manifest?.positive_commander_count || browseTotal || browseResults.length;
  const updatedAt = manifest?.last_publication_time || manifest?.generated_at;

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="border-b border-white/10 bg-[#0d1420]">
        <div className="px-5 py-7 sm:px-6 xl:px-10">
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
            className="mt-6"
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

      <div className="space-y-11 px-5 py-8 sm:px-6 xl:px-10">
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">Current leaders</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Featured Chemistry</h2>
            </div>
            <span className="hidden text-xs text-slate-500 sm:block">Ranked from the current certified corpus</span>
          </div>

          {featuredLoading ? (
            <div className="flex min-h-[330px] items-center justify-center gap-3 border-y border-white/10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
              <span>Loading featured chemistry...</span>
            </div>
          ) : rankedFeatured.length === 0 ? (
            <div className="border-y border-white/10 py-12 text-center text-sm text-slate-400">Featured chemistry is unavailable.</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
              <PrimaryFeaturedProfile
                commander={rankedFeatured[0]}
                detail={featuredDetails[rankedFeatured[0].oracle_id]}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {rankedFeatured.slice(1, 5).map((commander) => (
                  <SecondaryFeaturedProfile
                  key={commander.oracle_id}
                  commander={commander}
                    detail={featuredDetails[commander.oracle_id]}
                />
              ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white">Browse Commanders</h2>
              <p className="mt-1 text-sm text-slate-400">Find a profile by identity, sample quality, or popularity.</p>
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
              {filteredCommanders.length.toLocaleString()} profiles
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            <FilterSelect label="Color identity" value={colorFilter} onChange={setColorFilter} options={colorFilters} />
            <FilterSelect label="Confidence" value={confidenceFilter} onChange={setConfidenceFilter} options={confidenceFilters} />
            <FilterSelect
              label="Theme"
              value="detail"
              disabled
              options={[{ value: 'detail', label: 'Theme · profile detail' }]}
            />
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
