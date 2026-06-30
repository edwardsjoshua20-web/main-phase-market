import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, CartesianGrid } from 'recharts';
import ColorIdentity from '@/components/commander/ColorIdentity';
import { getMtgCommanderPage } from '@/lib/mtgCommanderCatalog';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

const TYPE_COLORS = {
  Land: '#d4a017',
  Creature: '#22c55e',
  Instant: '#3b82f6',
  Sorcery: '#ef4444',
  Artifact: '#94a3b8',
  Enchantment: '#f8fafc',
  Planeswalker: '#a855f7',
  Battle: '#64748b'
};

function percentText(value) {
  const pct = Number(value || 0) * 100;
  if (!Number.isFinite(pct)) return '0%';
  if (Math.abs(pct) >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

function wholeCardCount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric);
}

function titleCaseTheme(theme) {
  return String(theme || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function modeSummary(mode) {
  const summaries = {
    commander: 'Commander-led recommendations, theme slices, and category breakdowns.',
    card: 'Card-centric commander usage plus the shared shell around this card.',
    'average-deck': 'A synthesized average list built from the active local slice.',
    decks: 'Raw ingested deck rows for the active local slice.'
  };
  return summaries[mode] || '';
}

function modeTitle(mode) {
  const titles = {
    commander: 'As Commander',
    card: 'As Card',
    'average-deck': 'Average Deck',
    decks: 'Decks'
  };
  return titles[mode] || 'Commander';
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2 shadow-xl">
      {label ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">{label}</p> : null}
      <div className="mt-1 space-y-1">
        {payload.map((entry) => (
          <div key={`${entry.name}-${entry.value}`} className="flex items-center justify-between gap-4 text-sm text-white">
            <span className="text-slate-300">{entry.name}</span>
            <span className="font-bold text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeBreakdown({ data }) {
  const maxValue = Math.max(...data.map((entry) => entry.value), 1);

  return (
    <div className="mt-4 flex h-full flex-col justify-between gap-3">
      {data.map((entry) => {
        const width = `${Math.max((entry.value / maxValue) * 100, 8)}%`;

        return (
          <div key={entry.name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-semibold text-slate-200">{entry.name}</span>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{wholeCardCount(entry.value)} cards</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{
                  width,
                  background: `linear-gradient(90deg, ${entry.fill}, rgba(255,255,255,0.22))`
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardTile({ card }) {
  return (
    <button type="button" className="text-left">
      <div className="overflow-hidden rounded-md border border-white/10 bg-slate-950">
        {getCardImageUrl(card) ? (
          <img
            src={getCardImageUrl(card)}
            alt={card.card_name}
            className="aspect-[0.715] h-auto w-full object-contain"
            loading="lazy"
            onError={(event) => handleCardImageError(event, card)}
          />
        ) : (
          <div className="flex aspect-[0.715] items-center justify-center text-xs text-white/25">No image</div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-0 border border-white/10 bg-white/[0.02] text-center">
        <div className="min-w-0 px-1.5 py-2 sm:px-2">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[10px] sm:tracking-[0.16em]">Decks</p>
          <p className="mt-1 whitespace-nowrap text-base font-black leading-none text-white sm:text-lg">{card.deck_count || 0}</p>
        </div>
        <div className="min-w-0 border-x border-white/10 px-1.5 py-2 sm:px-2">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[10px] sm:tracking-[0.16em]">Inclusion</p>
          <p className="mt-1 whitespace-nowrap text-sm font-black leading-none text-white sm:text-lg">{percentText(card.inclusion_rate)}</p>
        </div>
        <div className="min-w-0 px-1.5 py-2 sm:px-2">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[10px] sm:tracking-[0.16em]">Synergy</p>
          <p className="mt-1 whitespace-nowrap text-sm font-black leading-none text-orange-300 sm:text-lg">
            {card.synergy_score >= 0 ? '+' : ''}
            {percentText(card.synergy_score)}
          </p>
        </div>
      </div>
    </button>
  );
}

function AverageDeckCardTile({ card }) {
  return (
    <button type="button" className="text-left">
      <div className="relative overflow-hidden rounded-md border border-white/10 bg-slate-950">
        {getCardImageUrl(card) ? (
          <img
            src={getCardImageUrl(card)}
            alt={card.card_name}
            className="aspect-[0.715] h-auto w-full object-contain"
            loading="lazy"
            onError={(event) => handleCardImageError(event, card)}
          />
        ) : (
          <div className="flex aspect-[0.715] items-center justify-center text-xs text-white/25">No image</div>
        )}
        <div className="absolute left-2 top-2 rounded bg-black/80 px-2 py-1 text-xs font-black uppercase tracking-[0.14em] text-white">
          {card.quantity}x
        </div>
      </div>
      <div className="mt-2 border border-white/10 bg-white/[0.02] px-3 py-2">
        <p className="truncate text-sm font-semibold text-white">{card.card_name}</p>
        <p className="mt-1 truncate text-xs uppercase tracking-[0.14em] text-slate-500">{card.type_line || 'Card'}</p>
      </div>
    </button>
  );
}

function DeckPreviewTile({ card }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-white/10 bg-slate-950">
      {getCardImageUrl(card) ? (
        <img
          src={getCardImageUrl(card)}
          alt={card.card_name}
          className="aspect-[0.715] h-auto w-full object-contain"
          loading="lazy"
          onError={(event) => handleCardImageError(event, card)}
        />
      ) : (
        <div className="flex aspect-[0.715] items-center justify-center text-xs text-white/25">No image</div>
      )}
      <div className="absolute left-2 top-2 rounded bg-black/80 px-2 py-1 text-xs font-black uppercase tracking-[0.14em] text-white">
        {card.quantity}x
      </div>
    </div>
  );
}

function CommanderUsageTile({ commander, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="text-left">
      <div className="overflow-hidden rounded-md border border-white/10 bg-slate-950">
        {getCardImageUrl(commander) ? (
          <img
            src={getCardImageUrl(commander)}
            alt={commander.name}
            className="aspect-[0.715] h-auto w-full object-contain"
            loading="lazy"
            onError={(event) => handleCardImageError(event, commander)}
          />
        ) : (
          <div className="flex aspect-[0.715] items-center justify-center text-xs text-white/25">{commander.name}</div>
        )}
      </div>
      <div className="mt-2 border border-white/10 bg-white/[0.02] px-3 py-2">
        <p className="truncate text-sm font-semibold text-white">{commander.name}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2 text-center">
          <div className="border-r border-white/10 pr-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Decks</p>
            <p className="mt-1 text-lg font-black leading-none text-white">{commander.deck_count || 0}</p>
          </div>
          <div className="pl-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Rank</p>
            <p className="mt-1 text-lg font-black leading-none text-white">#{commander.rank || '-'}</p>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function CommanderDetail() {
  const navigate = useNavigate();
  const { oracleId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const contentGridRef = useRef(null);
  const asideRef = useRef(null);
  const commanderRailRef = useRef(null);
  const browseRef = useRef(null);
  const [commander, setCommander] = useState(null);
  const [topSynergy, setTopSynergy] = useState([]);
  const [newCards, setNewCards] = useState([]);
  const [gameChangers, setGameChangers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [averageDeckSections, setAverageDeckSections] = useState([]);
  const [deckRows, setDeckRows] = useState([]);
  const [topCommanders, setTopCommanders] = useState([]);
  const [averageDeckProfile, setAverageDeckProfile] = useState({
    total_decks: 0,
    average_cards: 0,
    type_distribution: [],
    mana_curve: []
  });
  const [themeOptions, setThemeOptions] = useState([]);
  const [activeTheme, setActiveTheme] = useState('');
  const [activeMode, setActiveMode] = useState('commander');
  const [totalDecks, setTotalDecks] = useState(0);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [browseFloat, setBrowseFloat] = useState({
    mode: 'normal',
    width: 0,
    left: 0,
    height: 0
  });

  useEffect(() => {
    let mounted = true;
    const requestedTheme = searchParams.get('theme') || '';
    const requestedMode = searchParams.get('mode') || 'commander';

    async function load() {
      try {
        const pagePayload = await getMtgCommanderPage(oracleId, {
          theme: requestedTheme,
          mode: requestedMode
        });
        if (!mounted) return;
        setCommander(pagePayload?.commander || null);
        setTopSynergy(pagePayload?.top_synergy_cards || []);
        setNewCards(pagePayload?.new_cards || []);
        setGameChangers(pagePayload?.game_changers || []);
        setCategories(pagePayload?.categories || []);
        setAverageDeckSections(pagePayload?.average_deck_sections || []);
        setDeckRows(pagePayload?.deck_rows || []);
        setTopCommanders(pagePayload?.top_commanders || []);
        setThemeOptions(pagePayload?.theme_options || []);
        setActiveTheme(pagePayload?.active_theme || '');
        setActiveMode(pagePayload?.active_mode || 'commander');
        setAverageDeckProfile(pagePayload?.average_deck_profile || {
          total_decks: 0,
          average_cards: 0,
          type_distribution: [],
          mana_curve: []
        });
        setTotalDecks(pagePayload?.total_decks || 0);
        setHasLocalData(Boolean(pagePayload?.has_local_data));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [oracleId, searchParams]);

  const navSections = useMemo(() => {
    const allowedCategoryOrder = [
      'Creatures',
      'Instants',
      'Sorceries',
      'Artifacts',
      'Utility Artifacts',
      'Mana Artifacts',
      'Enchantments',
      'Planeswalkers',
      'Lands',
      'Utility Lands'
    ];

    const sections = [];
    if (activeMode === 'average-deck') {
      return averageDeckSections.map((section) => ({
        id: `average-${section.type.toLowerCase()}`,
        label: section.label
      }));
    }
    if (activeMode === 'decks') {
      return [];
    }
    if (activeMode === 'card') {
      const sections = [];
      if (topCommanders.length > 0) sections.push({ id: 'top-commanders', label: 'Top Commanders' });
      if (topSynergy.length > 0) sections.push({ id: 'recommended', label: 'Recommended Cards' });
      if (newCards.length > 0) sections.push({ id: 'new-cards', label: 'New Cards' });
      if (gameChangers.length > 0) sections.push({ id: 'game-changers', label: 'Game Changers' });
      return sections;
    }
    if (topSynergy.length > 0) sections.push({ id: 'recommended', label: 'Recommended by Synergy' });
    if (newCards.length > 0) sections.push({ id: 'new-cards', label: 'New Cards' });
    if (gameChangers.length > 0) sections.push({ id: 'game-changers', label: 'Game Changers' });
    for (const label of allowedCategoryOrder) {
      const section = categories.find((entry) => entry.label === label);
      if (section) {
        sections.push({ id: `category-${section.category}`, label: section.label });
      }
    }
    return sections;
  }, [activeMode, averageDeckSections, categories, gameChangers, newCards, topCommanders, topSynergy]);

  const visibleCategories = useMemo(() => {
    const allowedLabels = new Set([
      'Creatures',
      'Instants',
      'Sorceries',
      'Artifacts',
      'Utility Artifacts',
      'Mana Artifacts',
      'Enchantments',
      'Planeswalkers',
      'Lands',
      'Utility Lands'
    ]);

    return categories.filter((section) => allowedLabels.has(section.label));
  }, [categories]);

  const chartData = useMemo(() => {
    const typeDistribution = (averageDeckProfile?.type_distribution || []).map((entry, index) => ({
      name: entry.name,
      value: entry.average_count,
      fill: TYPE_COLORS[entry.name] || Object.values(TYPE_COLORS)[index % Object.values(TYPE_COLORS).length]
    }));

    const manaCurve = (averageDeckProfile?.mana_curve || []).map((entry) => ({
      mana: entry.mana,
      count: wholeCardCount(entry.average_count)
    }));

    return {
      totalDecks: averageDeckProfile?.total_decks || 0,
      averageCards: averageDeckProfile?.average_cards || 0,
      typeDistribution,
      manaCurve
    };
  }, [averageDeckProfile]);

  const activeSliceLabel = useMemo(() => {
    const modeLabel = modeTitle(activeMode);
    if (activeTheme) {
      return `${modeLabel} • ${titleCaseTheme(activeTheme)}`;
    }
    return modeLabel;
  }, [activeMode, activeTheme]);

  const modeOptions = useMemo(() => ([
    { id: 'commander', label: 'As Commander', enabled: true },
    { id: 'card', label: 'As Card', enabled: true },
    { id: 'average-deck', label: 'Average Deck', enabled: true },
    { id: 'decks', label: 'Decks', enabled: true }
  ]), []);

  function updateCommanderView(next = {}) {
    const params = new URLSearchParams(searchParams);
    if (next.mode !== undefined) {
      if (!next.mode || next.mode === 'commander') params.delete('mode');
      else params.set('mode', next.mode);
    }
    if (next.theme !== undefined) {
      if (!next.theme) params.delete('theme');
      else params.set('theme', next.theme);
    }
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    function updateBrowseFloat() {
      if (typeof window === 'undefined') return;
      if (window.innerWidth < 1280 || !navSections.length) {
        setBrowseFloat({ mode: 'normal', width: 0, left: 0, height: 0 });
        return;
      }

      const asideEl = asideRef.current;
      const gridEl = contentGridRef.current;
      const commanderEl = commanderRailRef.current;
      const browseEl = browseRef.current;
      if (!asideEl || !gridEl || !commanderEl || !browseEl) return;

      const asideRect = asideEl.getBoundingClientRect();
      const gridRect = gridEl.getBoundingClientRect();
      const browseHeight = browseEl.offsetHeight;
      const headerOffset = 96;
      const gap = 20;
      const scrollY = window.scrollY;
      const asideTop = scrollY + asideRect.top;
      const gridBottom = scrollY + gridRect.bottom;
      const commanderBottom = asideTop + commanderEl.offsetHeight;
      const fixedThreshold = commanderBottom + gap - headerOffset;
      const stopThreshold = gridBottom - browseHeight - headerOffset;

      let mode = 'normal';
      if (scrollY >= fixedThreshold && scrollY < stopThreshold) {
        mode = 'fixed';
      } else if (scrollY >= stopThreshold) {
        mode = 'bottom';
      }

      setBrowseFloat({
        mode,
        width: asideRect.width,
        left: asideRect.left,
        height: browseHeight
      });
    }

    updateBrowseFloat();
    window.addEventListener('scroll', updateBrowseFloat, { passive: true });
    window.addEventListener('resize', updateBrowseFloat);

    return () => {
      window.removeEventListener('scroll', updateBrowseFloat);
      window.removeEventListener('resize', updateBrowseFloat);
    };
  }, [navSections.length, commander?.oracle_id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-[#0a0d14] text-slate-300">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
        <span>Loading commander...</span>
      </div>
    );
  }

  if (!commander) {
    return (
      <div className="min-h-screen bg-[#0a0d14] px-6 py-16 text-white xl:px-10">
        <div className="border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-xl font-semibold">Commander not found.</p>
          <button
            type="button"
            onClick={() => navigate('/CommanderHub')}
            className="mt-4 rounded-xl bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-400"
          >
            Back to Commander Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white">
      <div className="px-6 py-8 xl:px-10">
        <button
          type="button"
          onClick={() => navigate('/CommanderHub')}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          All Commanders
        </button>

        <div ref={contentGridRef} className="grid gap-8 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
          <aside ref={asideRef} className="space-y-5 xl:relative xl:self-start">
            <div ref={commanderRailRef} className="border border-white/10 bg-white/[0.02] p-5">
              <div className="overflow-hidden rounded-md border border-white/10 bg-slate-950">
                {getCardImageUrl(commander) ? (
                  <img
                    src={getCardImageUrl(commander)}
                    alt={commander.name}
                    className="h-auto w-full object-contain"
                    onError={(event) => handleCardImageError(event, commander)}
                  />
                ) : (
                  <div className="flex aspect-[0.715] items-center justify-center text-white/20">{commander.name}</div>
                )}
              </div>

              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Color Identity</p>
                <div className="mt-3">
                  <ColorIdentity colors={commander.color_identity || []} showLabel />
                </div>
              </div>
            </div>

            {navSections.length > 0 && (
              <>
                {browseFloat.mode === 'fixed' ? <div style={{ height: `${browseFloat.height}px` }} /> : null}
                <div
                  ref={browseRef}
                  className="border border-white/10 bg-white/[0.02] p-5"
                  style={browseFloat.mode === 'fixed'
                    ? {
                        position: 'fixed',
                        top: '96px',
                        left: `${browseFloat.left}px`,
                        width: `${browseFloat.width}px`,
                        zIndex: 20
                      }
                    : browseFloat.mode === 'bottom'
                      ? {
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0
                        }
                      : undefined}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Browse</p>
                  <div className="mt-3 space-y-2">
                    {navSections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="block text-sm font-semibold text-slate-300 transition-colors hover:text-white"
                      >
                        {section.label}
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </aside>

          <main className="space-y-10">
            <section className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
              <div className="border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
                  {modeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!option.enabled}
                      onClick={() => option.enabled && updateCommanderView({ mode: option.id })}
                      className={`rounded-lg px-4 py-3 text-center text-base font-bold transition-all duration-150 ${
                        activeMode === option.id
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)]'
                          : option.enabled
                            ? 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                            : 'cursor-not-allowed bg-white/[0.04] text-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-orange-400/20 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.15),rgba(249,115,22,0.03)_55%,rgba(0,0,0,0)_100%)] px-4 py-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-200/80">Now Viewing</p>
                    <p className="mt-2 text-lg font-black text-white">{activeSliceLabel}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{modeSummary(activeMode)}</p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      {activeMode === 'card' ? 'Matching Decks' : 'Decks'}
                    </p>
                    <p className="mt-3 text-4xl font-black leading-none text-white">{totalDecks || 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      {activeMode === 'card' ? 'Card Rank' : 'Rank'}
                    </p>
                    <p className="mt-3 text-4xl font-black leading-none text-white">#{commander.rank || '-'}</p>
                  </div>
                </div>

                {themeOptions.length > 0 && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Themes</p>
                      {activeTheme ? (
                        <button
                          type="button"
                          onClick={() => updateCommanderView({ theme: '' })}
                          className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-white"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {themeOptions.map((theme) => (
                        <button
                          key={theme.slug}
                          type="button"
                          onClick={() => updateCommanderView({ theme: activeTheme === theme.slug ? '' : theme.slug })}
                          className={`inline-flex items-center justify-between gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-all duration-150 ${
                            activeTheme === theme.slug
                              ? 'border-orange-400/50 bg-orange-500/10 text-orange-200 shadow-[0_10px_24px_rgba(249,115,22,0.12)]'
                              : 'border-white/10 bg-white/10 text-white hover:border-orange-400/40 hover:bg-orange-500/10 hover:text-orange-200'
                          }`}
                        >
                          <span>{theme.label}</span>
                          <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] font-black text-slate-200">
                            {theme.deck_count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {(chartData.typeDistribution.length > 0 || chartData.manaCurve.some((entry) => entry.count > 0)) && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5">
                    <h2 className="text-2xl font-black text-white">Type Distribution</h2>
                    <TypeBreakdown data={chartData.typeDistribution} />
                  </div>

                  <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5">
                    <h2 className="text-2xl font-black text-white">Mana Curve</h2>
                    <div className="mt-4 min-h-[18rem] flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.manaCurve}>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="mana" stroke="#94a3b8" tickLine={false} axisLine={false} />
                          <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                            content={<ChartTooltip />}
                          />
                          <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {!hasLocalData && (
              <section className="border border-orange-400/20 bg-orange-500/5 p-5">
                <p className="text-sm text-slate-200">
                  This commander is in the local catalog, but the live corpus is still thin.
                </p>
              </section>
            )}

            {activeMode === 'commander' && topSynergy.length > 0 && (
              <section id="recommended" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Recommended by Synergy</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {topSynergy.map((card) => (
                    <CardTile key={`recommended-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'card' && topCommanders.length > 0 && (
              <section id="top-commanders" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Top Commanders</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {topCommanders.map((entry) => (
                    <CommanderUsageTile
                      key={`top-commander-${entry.oracle_id}`}
                      commander={entry}
                      onOpen={() => navigate(`/commanders/${entry.oracle_id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'card' && topSynergy.length > 0 && (
              <section id="recommended" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Recommended Cards</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {topSynergy.map((card) => (
                    <CardTile key={`card-mode-recommended-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'card' && newCards.length > 0 && (
              <section id="new-cards" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">New Cards</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {newCards.map((card) => (
                    <CardTile key={`card-mode-new-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'card' && gameChangers.length > 0 && (
              <section id="game-changers" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Game Changers</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {gameChangers.map((card) => (
                    <CardTile key={`card-mode-changer-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'commander' && newCards.length > 0 && (
              <section id="new-cards" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">New Cards</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {newCards.map((card) => (
                    <CardTile key={`new-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'commander' && gameChangers.length > 0 && (
              <section id="game-changers" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Game Changers</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {gameChangers.map((card) => (
                    <CardTile key={`changer-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'commander' && visibleCategories.map((section) => (
              <section key={section.category} id={`category-${section.category}`} className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">{section.label}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {section.cards.map((card) => (
                    <CardTile key={`${section.category}-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            ))}

            {activeMode === 'average-deck' && averageDeckSections.map((section) => (
              <section key={section.type} id={`average-${section.type.toLowerCase()}`} className="space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <h2 className="text-2xl font-black tracking-tight text-white">{section.label}</h2>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Target {section.target_count}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {section.cards.map((card) => (
                    <AverageDeckCardTile key={`average-${section.type}-${card.oracle_id}-${card.card_name}`} card={card} />
                  ))}
                </div>
              </section>
            ))}

            {activeMode === 'average-deck' && averageDeckSections.length === 0 && (
              <section className="border border-white/10 bg-white/[0.02] p-5">
                <p className="text-sm text-slate-300">Average deck sections are still filling in for this commander slice.</p>
              </section>
            )}

            {activeMode === 'decks' && deckRows.length > 0 && (
              <section className="space-y-5">
                <h2 className="text-2xl font-black tracking-tight text-white">Decks</h2>
                <div className="space-y-5">
                  {deckRows.map((deck) => (
                    <article key={deck.deck_key} className="border border-white/10 bg-white/[0.02] p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <h3 className="text-xl font-black text-white">{deck.deck_name}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                            <span>{deck.card_count} cards</span>
                            {deck.source_name ? <span>{deck.source_name}</span> : null}
                            {deck.source_url ? (
                              <a
                                href={deck.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-orange-300 transition-colors hover:text-orange-200"
                              >
                                View Source
                              </a>
                            ) : null}
                          </div>
                        </div>

                        {deck.themes?.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {deck.themes.map((theme) => (
                              <span
                                key={`${deck.deck_key}-${theme.slug}`}
                                className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-200"
                              >
                                {theme.label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-8">
                        {deck.sample_cards.map((card) => (
                          <DeckPreviewTile key={`${deck.deck_key}-${card.oracle_id}-${card.card_name}`} card={card} />
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'decks' && deckRows.length === 0 && (
              <section className="border border-white/10 bg-white/[0.02] p-5">
                <p className="text-sm text-slate-300">No local deck rows are ready for this commander slice yet.</p>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
