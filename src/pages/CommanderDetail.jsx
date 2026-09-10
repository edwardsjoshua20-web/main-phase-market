import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUp, Loader2, Plus } from 'lucide-react';
import { ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import CardImage from '@/components/cards/CardImage';
import { ManaCost } from '@/components/lib/MtgSymbolText';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCommanderDetailPage } from '@/hooks/useCommanderDetailPage';
import { useCommanderCommerce } from '@/hooks/useCommanderCommerce';
import { useAppAuth } from '@/lib/AppAuthContext';
import { deckBuilderOwner } from '@/services/deckBuilderOwner';

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

function stockStatus(availability, commerceLoading) {
  if (availability?.inStock) {
    return {
      className: 'text-cyan-200/80',
      label: `In Stock · ${availability.quantity}`
    };
  }

  if (commerceLoading || !availability) {
    return {
      className: 'text-slate-400',
      label: 'Checking Stock'
    };
  }

  return {
    className: 'text-slate-500',
    label: 'Out of Stock'
  };
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
    <div className="mt-3 flex h-full flex-col justify-between gap-2.5">
      {data.map((entry) => {
        const width = `${Math.max((entry.value / maxValue) * 100, 8)}%`;

        return (
          <div key={entry.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2.5">
            <span className="truncate text-xs font-semibold text-slate-200">{entry.name}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{
                  width,
                  background: `linear-gradient(90deg, ${entry.fill}, rgba(255,255,255,0.22))`
                }}
              />
            </div>
            <span className="text-right text-xs font-semibold tabular-nums text-slate-400">{wholeCardCount(entry.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CardTile({ card, commerce, commerceLoading, onAddToDeck }) {
  const chemistryScore = percentText(card.synergy_score);
  const price = commerce?.pricing?.display_price;
  const availability = commerce?.availability;
  const stock = stockStatus(availability, commerceLoading);

  return (
    <article className="group min-w-0 text-left">
      <div className="overflow-hidden rounded-[3px] bg-slate-950 ring-1 ring-white/[0.08] transition group-hover:ring-white/20">
        <CardImage
          card={card}
          alt={card.card_name}
          className="aspect-[0.715] h-auto w-full object-contain"
          fallbackClassName="flex aspect-[0.715] items-center justify-center text-xs text-white/25"
        />
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-xs font-semibold text-slate-100">{card.card_name}</p>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs font-bold">
          <span className="text-orange-300">Chemistry {card.synergy_score >= 0 ? '+' : ''}{chemistryScore}</span>
          {formatPrice(price) ? <span className={priceClassName(price)}>{formatPrice(price)}</span> : null}
        </div>
        <div className="mt-1.5 flex min-h-5 items-center justify-between gap-2 text-[11px]">
          <span className={stock.className}>{stock.label}</span>
          <button type="button" onClick={() => onAddToDeck(card)} className="font-semibold text-slate-300 transition hover:text-white">
            + Add to Deck
          </button>
        </div>
      </div>
    </article>
  );
}

function AddToDeckDialog({ card, decks, open, onOpenChange, onAdd, onCreate, busy }) {
  const [newDeckName, setNewDeckName] = useState('');

  useEffect(() => {
    if (open) setNewDeckName(card ? `${card.card_name || card.name} Deck` : '');
  }, [card, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#101722] text-white sm:rounded-[4px]">
        <DialogHeader>
          <DialogTitle>Add {card?.card_name || card?.name || 'card'} to Deck</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 border-y border-white/[0.08] py-2">
          {decks.length > 0 ? decks.map((deck) => (
            <button
              key={deck.id}
              type="button"
              disabled={busy}
              onClick={() => onAdd(deck)}
              className="flex w-full items-center justify-between px-2 py-2 text-left text-sm text-slate-200 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
            >
              <span className="truncate font-semibold">{deck.name}</span>
              <span className="ml-3 text-xs text-slate-500">{(deck.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)} cards</span>
            </button>
          )) : <p className="px-2 py-3 text-sm text-slate-400">No Commander decks yet.</p>}
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Create New Deck</p>
          <div className="mt-2 flex gap-2">
            <input value={newDeckName} onChange={(event) => setNewDeckName(event.target.value)} className="min-w-0 flex-1 border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40" aria-label="New deck name" />
            <button type="button" disabled={busy || !newDeckName.trim()} onClick={() => onCreate(newDeckName.trim())} className="inline-flex items-center gap-1 bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Create
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? `$${price.toFixed(2)}` : '';
}

function priceClassName(value) {
  const price = Number(value);
  if (price >= 20) return 'text-violet-300';
  if (price >= 10) return 'text-amber-300';
  return 'text-cyan-300';
}

function commanderBrowsePath(searchParams) {
  const params = new URLSearchParams(searchParams);
  params.delete('mode');
  params.delete('theme');
  params.delete('deckAction');
  params.delete('deckCard');
  const query = params.toString();
  return `/DeckChemistry/magic${query ? `?${query}` : ''}`;
}

function AverageDeckCardTile({ card }) {
  return (
    <button type="button" className="text-left">
      <div className="relative overflow-hidden rounded-md border border-white/10 bg-slate-950">
        <CardImage
          card={card}
          alt={card.card_name}
          className="aspect-[0.715] h-auto w-full object-contain"
          fallbackClassName="flex aspect-[0.715] items-center justify-center text-xs text-white/25"
        />
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
      <CardImage
        card={card}
        alt={card.card_name}
        className="aspect-[0.715] h-auto w-full object-contain"
        fallbackClassName="flex aspect-[0.715] items-center justify-center text-xs text-white/25"
      />
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
        <CardImage
          card={commander}
          alt={commander.name}
          className="aspect-[0.715] h-auto w-full object-contain"
          renderFallback={() => (
            <div className="flex aspect-[0.715] items-center justify-center text-xs text-white/25">
              {commander.name}
            </div>
          )}
        />
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
  const queryClient = useQueryClient();
  const { user, isAuthenticated, navigateToLogin } = useAppAuth();
  const { oracleId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const contentGridRef = useRef(null);
  const asideRef = useRef(null);
  const commanderRailRef = useRef(null);
  const browseRef = useRef(null);
  const topRef = useRef(null);
  const resumedDeckActionRef = useRef('');
  const [deckActionCard, setDeckActionCard] = useState(null);
  const [deckActionBusy, setDeckActionBusy] = useState(false);
  const [browseFloat, setBrowseFloat] = useState({
    mode: 'normal',
    width: 0,
    left: 0,
    height: 0
  });
  const {
    commander,
    topSynergy,
    newCards,
    gameChangers,
    categories,
    averageDeckSections,
    deckRows,
    topCommanders,
    averageDeckProfile,
    themeOptions,
    activeTheme,
    activeMode,
    totalDecks,
    hasLocalData,
    navSections,
    visibleCategories,
    loading
  } = useCommanderDetailPage({ oracleId, searchParams });

  const commerceCards = useMemo(() => {
    const cards = [
      commander ? { ...commander, card_name: commander.name } : null,
      ...topSynergy,
      ...newCards,
      ...gameChangers,
      ...visibleCategories.flatMap((section) => section.cards || [])
    ].filter(Boolean);
    return [...new Map(cards.map((card) => [card.oracle_id, card])).values()];
  }, [commander, gameChangers, newCards, topSynergy, visibleCategories]);
  const { commerceByOracleId, loadingCommerce, fetchingCommerce } = useCommanderCommerce(commerceCards);
  const commerceLoading = loadingCommerce || fetchingCommerce;
  const commanderStock = stockStatus(commerceByOracleId[commander?.oracle_id]?.availability, commerceLoading);
  const { data: compatibleDecks = [] } = useQuery({
    queryKey: ['cardlists', user?.email, 'magic', 'commander'],
    queryFn: () => deckBuilderOwner.listUserDecks(user.email, { game: 'magic', format: 'commander' }),
    enabled: Boolean(isAuthenticated && user?.email && deckActionCard)
  });

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

  const modeOptions = useMemo(() => ([
    { id: 'commander', label: 'As Commander', enabled: true },
    { id: 'card', label: 'As Card', enabled: true }
  ]), []);

  const allCommandersPath = useMemo(() => commanderBrowsePath(searchParams), [searchParams]);

  const deckActionReturnTo = (action, card) => {
    const params = new URLSearchParams(searchParams);
    params.set('deckAction', action);
    if (card?.oracle_id) params.set('deckCard', card.oracle_id);
    else params.delete('deckCard');
    return `${window.location.pathname}?${params.toString()}`;
  };

  const openDeckAction = (card) => {
    if (!isAuthenticated) {
      navigateToLogin(deckActionReturnTo('add', card));
      return;
    }
    setDeckActionCard(card);
  };

  const buildAroundCommander = () => {
    if (!isAuthenticated) {
      navigateToLogin(deckActionReturnTo('build', commander));
      return;
    }
    createDeckAndAdd(`Build Around ${commander.name}`, { ...commander, card_name: commander.name }, true);
  };

  const addToExistingDeck = async (deck) => {
    setDeckActionBusy(true);
    try {
      const commerceCard = commerceByOracleId[deckActionCard.oracle_id]?.card || deckActionCard;
      const result = await deckBuilderOwner.addCardToDeck(deck, commerceCard);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['cardlists', user?.email] });
      toast.success(`${deckActionCard.card_name || deckActionCard.name} added to ${deck.name}`);
      setDeckActionCard(null);
    } catch (error) {
      toast.error(error?.message || 'Could not add card to deck');
    } finally {
      setDeckActionBusy(false);
    }
  };

  const createDeckAndAdd = async (name, card = deckActionCard, asCommander = false) => {
    setDeckActionBusy(true);
    try {
      const commerceCard = commerceByOracleId[card.oracle_id]?.card || card;
      const deck = await deckBuilderOwner.createDeckWithCard({ userEmail: user.email, name, card: commerceCard, asCommander });
      await queryClient.invalidateQueries({ queryKey: ['cardlists', user?.email] });
      setDeckActionCard(null);
      if (asCommander) navigate(`/AdvancedDeckBuilder?deck=${encodeURIComponent(deck.id)}`);
      else toast.success(`${card.card_name || card.name} added to ${deck.name}`);
    } catch (error) {
      toast.error(error?.message || 'Could not create deck');
    } finally {
      setDeckActionBusy(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !user?.email || loading || !commander) return;
    const action = searchParams.get('deckAction');
    const cardId = searchParams.get('deckCard') || '';
    if (!action) return;
    const actionKey = `${oracleId}:${action}:${cardId}`;
    if (resumedDeckActionRef.current === actionKey) return;
    resumedDeckActionRef.current = actionKey;

    const params = new URLSearchParams(searchParams);
    params.delete('deckAction');
    params.delete('deckCard');
    setSearchParams(params, { replace: true });

    if (action === 'add') {
      const card = commerceCards.find((candidate) => candidate.oracle_id === cardId);
      if (card) setDeckActionCard(card);
    } else if (action === 'build') {
      createDeckAndAdd(`Build Around ${commander.name}`, { ...commander, card_name: commander.name }, true);
    }
  }, [commander, commerceCards, isAuthenticated, loading, oracleId, searchParams, setSearchParams, user?.email]);

  useEffect(() => {
    if (loading || !searchParams.get('theme') || activeTheme) return;
    const params = new URLSearchParams(searchParams);
    params.delete('theme');
    setSearchParams(params, { replace: true });
  }, [activeTheme, loading, searchParams, setSearchParams]);

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
            onClick={() => navigate(allCommandersPath)}
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
      <div className="px-5 py-6 sm:px-6 xl:px-10">
        <button
          type="button"
          onClick={() => navigate(allCommandersPath)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          All Commanders
        </button>

        <div ref={contentGridRef} className="grid gap-7 xl:grid-cols-[17rem_minmax(0,1fr)] xl:items-start">
          <aside ref={asideRef} className="space-y-5 xl:relative xl:self-start">
            <div ref={commanderRailRef} className="border border-white/[0.08] bg-white/[0.015] p-3">
              <div className="overflow-hidden rounded-[3px] bg-slate-950 ring-1 ring-white/10">
                <CardImage
                  card={commander}
                  alt={commander.name}
                  className="h-auto w-full object-contain"
                  renderFallback={() => (
                    <div className="flex aspect-[0.715] items-center justify-center text-white/20">
                      {commander.name}
                    </div>
                  )}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <ManaCost manaCost={commander.mana_cost} />
                {formatPrice(commerceByOracleId[commander.oracle_id]?.pricing?.display_price) ? (
                  <span className={`text-sm font-bold ${priceClassName(commerceByOracleId[commander.oracle_id]?.pricing?.display_price)}`}>
                    {formatPrice(commerceByOracleId[commander.oracle_id]?.pricing?.display_price)}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className={commanderStock.className}>{commanderStock.label}</span>
                <button type="button" disabled={deckActionBusy} onClick={buildAroundCommander} className="text-right font-semibold text-orange-200 transition hover:text-white disabled:opacity-50">
                  Build Around This Commander
                </button>
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
                    <button
                      type="button"
                      onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="flex w-full items-center gap-2 border-t border-white/[0.08] pt-3 text-left text-sm font-semibold text-slate-400 transition-colors hover:text-white"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> Back to Top
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>

          <main className="space-y-9">
            <section ref={topRef} className="scroll-mt-24 border-b border-white/10 pb-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(30rem,1.12fr)]">
                <div className="min-w-0">
                  <h1 className="text-3xl font-black leading-tight tracking-tight text-white">{commander.name}</h1>
                  <p className="mt-2 text-sm font-semibold text-slate-400">{commander.type_line}</p>
                  {commander.oracle_text ? (
                    <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-200">{commander.oracle_text}</p>
                  ) : null}

                  {themeOptions.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {themeOptions.map((theme) => (
                        <button
                          key={theme.slug}
                          type="button"
                          onClick={() => updateCommanderView({ theme: activeTheme === theme.slug ? '' : theme.slug })}
                          className={`border px-2.5 py-1.5 text-xs font-semibold transition ${
                            activeTheme === theme.slug
                              ? 'border-orange-300/50 bg-orange-400/10 text-orange-200'
                              : 'border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {theme.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/[0.08] pt-3">
                    {modeOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!option.enabled}
                        onClick={() => option.enabled && updateCommanderView({ mode: option.id })}
                        className={`border-b py-1 text-xs font-bold transition ${
                          activeMode === option.id
                            ? 'border-orange-300 text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(chartData.typeDistribution.length > 0 || chartData.manaCurve.some((entry) => entry.count > 0)) && (
                  <div className="grid min-h-[17rem] grid-cols-2 gap-5 border-l border-white/[0.08] pl-5">
                    <div className="flex min-w-0 flex-col">
                      <h2 className="text-lg font-black text-white">Type Distribution</h2>
                      <TypeBreakdown data={chartData.typeDistribution} />
                    </div>

                    <div className="flex min-w-0 flex-col">
                      <h2 className="text-lg font-black text-white">Mana Curve</h2>
                      <div className="mt-3 min-h-[14rem] flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData.manaCurve} margin={{ top: 18, right: 0, bottom: 0, left: -24 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                            <XAxis dataKey="mana" stroke="#64748b" tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.035)' }} content={<ChartTooltip />} />
                            <Bar dataKey="count" fill="#f97316" radius={[2, 2, 0, 0]} label={{ position: 'top', fill: '#94a3b8', fontSize: 10 }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
                <h2 className="text-2xl font-black tracking-tight text-white">Recommended Chemistry</h2>
                <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {topSynergy.map((card) => (
                    <CardTile key={`recommended-${card.oracle_id}-${card.card_name}`} card={card} commerce={commerceByOracleId[card.oracle_id]} commerceLoading={commerceLoading} onAddToDeck={openDeckAction} />
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
                <h2 className="text-2xl font-black tracking-tight text-white">Recommended Chemistry</h2>
                <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {topSynergy.map((card) => (
                    <CardTile key={`card-mode-recommended-${card.oracle_id}-${card.card_name}`} card={card} commerce={commerceByOracleId[card.oracle_id]} commerceLoading={commerceLoading} onAddToDeck={openDeckAction} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'card' && gameChangers.length > 0 && (
              <section id="game-changers" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Game Changers</h2>
                <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {gameChangers.map((card) => (
                    <CardTile key={`card-mode-changer-${card.oracle_id}-${card.card_name}`} card={card} commerce={commerceByOracleId[card.oracle_id]} commerceLoading={commerceLoading} onAddToDeck={openDeckAction} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'card' && newCards.length > 0 && (
              <section id="new-cards" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">New Cards</h2>
                <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {newCards.map((card) => (
                    <CardTile key={`card-mode-new-${card.oracle_id}-${card.card_name}`} card={card} commerce={commerceByOracleId[card.oracle_id]} commerceLoading={commerceLoading} onAddToDeck={openDeckAction} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'commander' && gameChangers.length > 0 && (
              <section id="game-changers" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">Game Changers</h2>
                <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {gameChangers.map((card) => (
                    <CardTile key={`changer-${card.oracle_id}-${card.card_name}`} card={card} commerce={commerceByOracleId[card.oracle_id]} commerceLoading={commerceLoading} onAddToDeck={openDeckAction} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'commander' && newCards.length > 0 && (
              <section id="new-cards" className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">New Cards</h2>
                <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {newCards.map((card) => (
                    <CardTile key={`new-${card.oracle_id}-${card.card_name}`} card={card} commerce={commerceByOracleId[card.oracle_id]} commerceLoading={commerceLoading} onAddToDeck={openDeckAction} />
                  ))}
                </div>
              </section>
            )}

            {activeMode === 'commander' && visibleCategories.map((section) => (
              <section key={section.category} id={`category-${section.category}`} className="space-y-4">
                <h2 className="text-2xl font-black tracking-tight text-white">{section.label}</h2>
                <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {section.cards.map((card) => (
                    <CardTile key={`${section.category}-${card.oracle_id}-${card.card_name}`} card={card} commerce={commerceByOracleId[card.oracle_id]} commerceLoading={commerceLoading} onAddToDeck={openDeckAction} />
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
      <AddToDeckDialog
        card={deckActionCard}
        decks={compatibleDecks}
        open={Boolean(deckActionCard)}
        onOpenChange={(open) => !open && setDeckActionCard(null)}
        onAdd={addToExistingDeck}
        onCreate={(name) => createDeckAndAdd(name)}
        busy={deckActionBusy}
      />
    </div>
  );
}
