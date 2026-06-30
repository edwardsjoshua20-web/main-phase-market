import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ColorIdentity from '@/components/commander/ColorIdentity';
import { searchMtgCommanders } from '@/lib/mtgCommanderCatalog';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

function CommanderSummaryCard({ commander, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition-all hover:-translate-y-0.5 hover:border-orange-400/25 hover:bg-white/[0.05]"
    >
      <div className="relative aspect-[5/7] overflow-hidden bg-slate-950">
        {getCardImageUrl(commander) ? (
          <img
            src={getCardImageUrl(commander)}
            alt={commander.name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            onError={(event) => handleCardImageError(event, commander)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.28),transparent_55%),linear-gradient(180deg,#101827,#090c14)]">
            <span className="text-4xl font-black text-white/20">{commander.name?.charAt(0)}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-sm font-black text-white">
          #{commander.rank}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="mb-2">
            <ColorIdentity colors={commander.color_identity || []} />
          </div>
          <h2 className="line-clamp-2 text-base font-black leading-tight text-white">{commander.name}</h2>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-orange-300">
            {commander.deck_count || 0} decks
          </p>
        </div>
      </div>
    </button>
  );
}

function BrowseCommanderCard({ commander, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition-all hover:-translate-y-0.5 hover:border-orange-400/30 hover:bg-white/[0.05]"
    >
      <div className="aspect-[5/7] overflow-hidden bg-slate-900">
        {getCardImageUrl(commander) ? (
          <img
            src={getCardImageUrl(commander)}
            alt={commander.name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            onError={(event) => handleCardImageError(event, commander)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.22),transparent_55%),linear-gradient(180deg,#101827,#090c14)]">
            <span className="text-3xl font-black text-white/20">{commander.name?.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <ColorIdentity colors={commander.color_identity || []} />
        <h2 className="line-clamp-2 text-sm font-bold leading-snug text-white">{commander.name}</h2>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300">
          {commander.deck_count || 0} decks
        </p>
      </div>
    </button>
  );
}

export default function CommanderHub() {
  const navigate = useNavigate();
  const [featuredCommanders, setFeaturedCommanders] = useState([]);
  const [browseResults, setBrowseResults] = useState([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadFeatured() {
      try {
        const payload = await searchMtgCommanders('', { limit: 10, minDeckCount: 1 });
        const commanders = (payload.results || []).slice(0, 10);
        if (!mounted) return;
        setFeaturedCommanders(commanders);
      } finally {
        if (mounted) {
          setFeaturedLoading(false);
        }
      }
    }

    loadFeatured();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setBrowseLoading(true);

    const timeoutId = setTimeout(async () => {
      try {
        const payload = await searchMtgCommanders(search, {
          limit: 1000,
          minDeckCount: 1
        });
        if (!mounted) return;
        setBrowseResults(payload.results || []);
        setBrowseTotal(payload.total || 0);
      } finally {
        if (mounted) {
          setBrowseLoading(false);
        }
      }
    }, search.trim() ? 120 : 0);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [search]);

  const rankedFeatured = useMemo(
    () => featuredCommanders.map((commander, index) => ({ ...commander, rank: index + 1 })),
    [featuredCommanders]
  );

  const openCommander = (oracleId) => {
    navigate(`/commanders/${encodeURIComponent(oracleId)}`);
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="border-b border-white/10 bg-[linear-gradient(180deg,#111827_0%,#0a0d14_100%)]">
        <div className="px-6 py-10 xl:px-10">
          <div className="max-w-4xl">
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              Discover commanders and the cards that make them hum.
            </h1>
          </div>

          <div className="mt-8">
            <div className="relative max-w-4xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search for a commander..."
                className="h-12 rounded-xl border-white/10 bg-white/5 pl-11 text-white placeholder:text-slate-500 focus-visible:ring-orange-500/40"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-6 py-10 xl:px-10">
        <section>
          <div className="mb-5">
            <h2 className="text-2xl font-black tracking-tight text-white">Top 10 Commanders</h2>
          </div>

          {featuredLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
              <span>Loading featured commanders...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10">
              {rankedFeatured.map((commander) => (
                <CommanderSummaryCard
                  key={commander.oracle_id}
                  commander={commander}
                  onOpen={() => openCommander(commander.oracle_id)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white">Browse Commanders</h2>
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
              {browseTotal || browseResults.length} commanders
            </div>
          </div>

          {browseLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
              <span>Loading commander search...</span>
            </div>
          ) : browseResults.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center">
              <p className="text-lg font-semibold text-white">No commanders found.</p>
              <p className="mt-2 text-sm text-slate-400">Try a different search or clear your color filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8 2xl:grid-cols-10">
              {browseResults.map((commander) => (
                <BrowseCommanderCard
                  key={commander.oracle_id}
                  commander={commander}
                  onOpen={() => openCommander(commander.oracle_id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
