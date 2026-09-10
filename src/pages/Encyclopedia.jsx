import React, { useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, ExternalLink, Layers, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CardImage from '@/components/cards/CardImage';
import { formatCardMetadataLabel } from '@/components/cards/CardPresentation';
import { gameKnowledgeOwner } from '@/services/knowledge/gameKnowledgeOwner';
import { createPageUrl } from '@/utils';

const SETS_PER_PAGE = 24;
const LANDING_COPY_BY_GAME = {
  magic: 'Browse sets, cards, and rules.',
  pokemon: 'Browse sets, cards, and play topics.',
  yugioh: 'Browse sets, cards, and duel rules.',
  lorcana: 'Browse sets, cards, and rules.',
  flesh_and_blood: 'Browse sets, cards, and game rules.',
  onepiece: 'Browse sets, cards, and play rules.',
  starwars: 'Browse sets, cards, and rules.'
};

function SectionShell({ children, className = '' }) {
  return <section className={`mx-auto w-full max-w-[1480px] px-4 ${className}`}>{children}</section>;
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-[420px] w-full max-w-[1480px] items-center justify-center px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
      </div>
    </main>
  );
}

function EmptyState({ title, body, to = '/Encyclopedia', action = 'Back to Encyclopedia' }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SectionShell className="py-16">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Encyclopedia</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{body}</p>
        <Link to={to}>
          <Button className="mt-6 rounded bg-slate-900 text-white hover:bg-slate-800">{action}</Button>
        </Link>
      </SectionShell>
    </main>
  );
}

function GameLogo({ game }) {
  return <img src={game.logoSrc} alt={game.label} loading="lazy" className={`h-auto w-auto object-contain ${game.logoClassName}`} />;
}

function GameIdentityMark({ game }) {
  if (game.id === 'magic') {
    return (
      <div className="flex items-center gap-3 text-white/86">
        <span className="flex h-10 w-10 items-center justify-center border border-white/20 bg-white/10 text-sm font-black leading-none">MTG</span>
        <span className="text-sm font-black uppercase tracking-[0.18em] text-white/72">Magic</span>
      </div>
    );
  }

  return (
    <div className="flex max-h-14 items-center justify-start opacity-90 md:justify-end">
      <GameLogo game={game} />
    </div>
  );
}

function GameHero({ game, eyebrow = 'TCG Encyclopedia' }) {
  return (
    <section className={`bg-gradient-to-br ${game.tintClassName} text-white`}>
      <SectionShell className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_220px] md:items-center md:py-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/58">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{game.label}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/74">{LANDING_COPY_BY_GAME[game.id] || 'Browse sets, cards, and rules.'}</p>
        </div>
        <div className="flex min-h-10 items-center justify-start md:justify-end">
          <GameIdentityMark game={game} />
        </div>
      </SectionShell>
    </section>
  );
}

function SourceList({ sources = [], className = '' }) {
  return (
    <div className={className}>
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Sources</h3>
      <div className="mt-3 space-y-3">
        {sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block border-t border-slate-200 pt-3 text-sm font-bold text-slate-900 hover:text-slate-600">
            <span className="inline-flex items-center gap-2">{source.label}<ExternalLink className="h-3.5 w-3.5" /></span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">{source.freshness}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function SetRow({ set }) {
  return (
    <Link to={set.path} className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-4 py-3 hover:bg-white">
      <div className="flex h-10 w-10 items-center justify-center bg-white">
        {set.imageUrl ? <img src={set.imageUrl} alt="" className="max-h-8 max-w-8 object-contain" /> : <Layers className="h-5 w-5 text-slate-400" />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold text-slate-950">{set.name}</p>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">
          {[set.setCode, set.releaseDate].filter(Boolean).join(' · ') || 'Set'}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-400" />
    </Link>
  );
}

function filterSetsByQuery(sets = [], query = '') {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return sets;
  return sets.filter((set) => `${set.name} ${set.setCode}`.toLowerCase().includes(normalized));
}

function sortSets(sets = [], sortMode = 'newest') {
  return [...sets].sort((a, b) => {
    if (sortMode === 'oldest') return String(a.releaseDate || '').localeCompare(String(b.releaseDate || ''));
    if (sortMode === 'name') return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    return String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''));
  });
}

function clampPage(value, totalPages) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, totalPages);
}

function SetPagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-slate-600">Page {currentPage} of {totalPages}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="rounded border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-45">
          Previous
        </Button>
        <Button type="button" variant="outline" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="rounded border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-45">
          Next
        </Button>
      </div>
    </div>
  );
}

function EncyclopediaLanding() {
  const games = gameKnowledgeOwner.listGames();
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="bg-slate-950 text-white">
        <SectionShell className="py-10 md:py-12">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/60">MainPhase reference</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight md:text-5xl">TCG Encyclopedia</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/74">
            Browse trading card sets, cards, rules, and MainPhase availability across supported games.
          </p>
        </SectionShell>
      </section>

      <SectionShell className="py-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {games.map((game) => (
            <Link key={game.id} to={`/Encyclopedia/${game.routeKey}`} className="group flex min-h-[210px] flex-col justify-between border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md">
              <div>
                <div className={`flex h-20 items-center justify-start bg-gradient-to-br ${game.tintClassName} px-4`}>
                  <GameLogo game={game} />
                </div>
                <h2 className="mt-4 text-xl font-black tracking-tight">{game.label}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{LANDING_COPY_BY_GAME[game.id] || 'Browse sets, cards, and rules.'}</p>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-bold text-slate-900">
                <span>{game.rulesCount} rule topics</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </SectionShell>
    </main>
  );
}

function GameLanding({ game }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMagic = game.id === 'magic';
  const rules = gameKnowledgeOwner.getRulesTopics(game.id);
  const { data: sets = [], isLoading } = useQuery({
    queryKey: [isMagic ? 'encyclopedia-sets' : 'encyclopedia-sets-preview', game.id],
    queryFn: () => gameKnowledgeOwner.listSets(game.id, { limit: isMagic ? 0 : 8 }),
    staleTime: 60_000
  });
  const magicQuery = isMagic ? searchParams.get('q') || '' : '';
  const magicSortMode = isMagic && searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const magicSets = useMemo(() => {
    if (!isMagic) return sets;
    return sortSets(filterSetsByQuery(sets, magicQuery), magicSortMode);
  }, [isMagic, magicQuery, magicSortMode, sets]);
  const magicTotalPages = Math.max(1, Math.ceil(magicSets.length / SETS_PER_PAGE));
  const magicCurrentPage = clampPage(searchParams.get('page') || '1', magicTotalPages);
  const displaySets = isMagic ? magicSets.slice((magicCurrentPage - 1) * SETS_PER_PAGE, magicCurrentPage * SETS_PER_PAGE) : sets;

  const updateMagicBrowseParams = (updates = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      const normalized = String(value || '').trim();
      if (!normalized || (key === 'sort' && normalized === 'newest') || (key === 'page' && normalized === '1')) {
        next.delete(key);
        return;
      }
      next.set(key, normalized);
    });
    setSearchParams(next, { replace: true });
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <GameHero game={game} />
      <SectionShell className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Sets</h2>
              {isMagic && <p className="mt-1 text-sm text-slate-600">{magicSets.length} set{magicSets.length === 1 ? '' : 's'} visible.</p>}
            </div>
            {isMagic ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row md:max-w-xl">
                <label className="flex min-w-0 flex-1 items-center gap-2 border border-slate-300 bg-white px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={magicQuery}
                    onChange={(event) => updateMagicBrowseParams({ q: event.target.value, page: 1 })}
                    placeholder="Search set name or code"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </label>
                <select
                  value={magicSortMode}
                  onChange={(event) => updateMagicBrowseParams({ sort: event.target.value, page: 1 })}
                  className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none"
                >
                  <option value="newest">Newest to oldest</option>
                  <option value="oldest">Oldest to newest</option>
                </select>
              </div>
            ) : (
              <Link to={`/Encyclopedia/${game.routeKey}/sets`}>
                <Button variant="outline" className="rounded border-slate-300 text-slate-900 hover:bg-slate-100">View all sets</Button>
              </Link>
            )}
          </div>
          {isLoading ? (
            <div className="py-10 text-sm font-semibold text-slate-500">Loading sets...</div>
          ) : displaySets.length === 0 ? (
            <div className="border-b border-slate-200 py-10 text-sm font-semibold text-slate-500">No sets match that search.</div>
          ) : (
            <div className="divide-y divide-slate-200">{displaySets.map((set) => <SetRow key={set.id} set={set} />)}</div>
          )}
          {isMagic && !isLoading && (
            <SetPagination currentPage={magicCurrentPage} totalPages={magicTotalPages} onPageChange={(page) => updateMagicBrowseParams({ page })} />
          )}
        </div>
        <aside className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight">Rules Topics</h2>
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {rules.map((topic) => (
              <Link key={topic.slug} to={topic.path} className="block py-4 hover:bg-white">
                <p className="font-bold text-slate-950">{topic.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{topic.summary}</p>
              </Link>
            ))}
          </div>
          <div className="mt-7 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Card Source</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{game.cardSource}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{game.sourceLimitations}</p>
          </div>
          <SourceList sources={game.sourceRefs} className="mt-7" />
        </aside>
      </SectionShell>
    </main>
  );
}

function SetListPage({ game }) {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('newest');
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ['encyclopedia-sets', game.id],
    queryFn: () => gameKnowledgeOwner.listSets(game.id, { limit: 0 }),
    staleTime: 60_000
  });
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? sets.filter((set) => `${set.name} ${set.setCode}`.toLowerCase().includes(q)) : sets;
    return [...visible].sort((a, b) => {
      if (sortMode === 'oldest') return String(a.releaseDate || '').localeCompare(String(b.releaseDate || ''));
      if (sortMode === 'name') return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
      return String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''));
    });
  }, [query, sets, sortMode]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Encyclopedia sets" />
      <SectionShell className="py-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight">All Sets</h2>
            <p className="mt-1 text-sm text-slate-600">{filtered.length} set{filtered.length === 1 ? '' : 's'} visible.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:max-w-xl">
            <label className="flex min-w-0 flex-1 items-center gap-2 border border-slate-300 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter sets" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
        {isLoading ? (
          <div className="py-10 text-sm font-semibold text-slate-500">Loading sets...</div>
        ) : (
          <div className="divide-y divide-slate-200">{filtered.map((set) => <SetRow key={set.id} set={set} />)}</div>
        )}
      </SectionShell>
    </main>
  );
}

const SET_FILTERS_BY_GAME = {
  magic: [
    { key: 'color', label: 'Color' },
    { key: 'type', label: 'Type' },
    { key: 'rarity', label: 'Rarity' },
    { key: 'mana_value', label: 'Mana Value' }
  ],
  pokemon: [
    { key: 'type', label: 'Type' },
    { key: 'stage', label: 'Stage' },
    { key: 'category', label: 'Category' },
    { key: 'rarity', label: 'Rarity' }
  ],
  yugioh: [
    { key: 'type', label: 'Card Type' },
    { key: 'subtype', label: 'Subtype' },
    { key: 'attribute', label: 'Attribute' },
    { key: 'level', label: 'Level / Rank / Link' }
  ],
  lorcana: [
    { key: 'ink', label: 'Ink' },
    { key: 'type', label: 'Category' },
    { key: 'cost', label: 'Cost' },
    { key: 'rarity', label: 'Rarity' }
  ],
  flesh_and_blood: [
    { key: 'class', label: 'Class' },
    { key: 'talent', label: 'Talent' },
    { key: 'type', label: 'Card Type' },
    { key: 'pitch', label: 'Pitch' }
  ],
  onepiece: [
    { key: 'color', label: 'Color' },
    { key: 'category', label: 'Category' },
    { key: 'cost', label: 'Cost' },
    { key: 'rarity', label: 'Rarity' }
  ],
  starwars: [
    { key: 'aspect', label: 'Aspect' },
    { key: 'type', label: 'Card Type' },
    { key: 'arena', label: 'Arena' },
    { key: 'cost', label: 'Cost' }
  ]
};

function firstArrayValue(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(', ') : value;
}

function cardFilterValue(card = {}, key) {
  const raw = card.raw || {};
  const filters = card.filterValues || {};
  const direct = firstArrayValue(filters[key]);
  if (direct) return String(direct);

  if (key === 'color') return firstArrayValue(raw.colors || raw.color_identity || raw.colorsProduced) || (card.game === 'magic' ? 'Colorless' : '');
  if (key === 'type') return filters.type || raw.frameType || raw.category || raw.supertype || raw.type || raw.type_text || String(card.type_line || '').split('/')[0].trim();
  if (key === 'category') return filters.category || raw.category || raw.supertype || String(card.type_line || '').split('/')[0].trim();
  if (key === 'subtype') return filters.subtype || raw.race || raw.subtype || (raw.subtypes || [])[0] || '';
  if (key === 'attribute') return filters.attribute || raw.attribute || '';
  if (key === 'level') return raw.linkval || raw.level || raw.rank || '';
  if (key === 'mana_value') return raw.cmc ?? raw.mana_value ?? raw.manaValue ?? '';
  if (key === 'cost') return raw.cost ?? raw.mana_cost ?? raw.resource_cost ?? '';
  if (key === 'ink') return filters.ink || raw.ink || '';
  if (key === 'stage') return filters.stage || (raw.subtypes || [])[0] || '';
  if (key === 'class') return filters.class || (raw.types || [])[0] || raw.class || '';
  if (key === 'talent') return raw.talent || raw.talents?.[0] || raw.color || '';
  if (key === 'pitch') return filters.pitch || raw.pitch || '';
  if (key === 'aspect') return filters.aspect || (raw.aspects || [])[0] || '';
  if (key === 'arena') return filters.arena || raw.arena || '';
  if (key === 'rarity') return card.rarity || card.rarities?.[0] || raw.rarity || '';
  return '';
}

function sortFilterValues(values = []) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
}

function CardGalleryTile({ card }) {
  const rarity = Array.isArray(card.rarities) && card.rarities.length > 1
    ? `${card.rarities.length} rarities`
    : formatCardMetadataLabel(card.rarity || card.rarities?.[0] || '');
  return (
    <Link to={card.encyclopediaPath} className="group block min-w-0">
      <div className="aspect-[63/88] overflow-hidden bg-slate-100 shadow-sm ring-1 ring-slate-200 transition group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-slate-300">
        <CardImage card={card} alt={card.name} className="h-full w-full object-contain" fallbackClassName="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500" />
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-bold leading-5 text-slate-950">{card.name}</p>
        <p className="mt-0.5 truncate text-xs font-semibold leading-4 text-slate-500">
          {[card.collector_number, rarity].filter(Boolean).join(' / ')}
        </p>
      </div>
    </Link>
  );
}

function fieldLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SetDetailPage({ game, setSlug }) {
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [visibleLimit, setVisibleLimit] = useState(120);
  const { data: detail, isLoading } = useQuery({
    queryKey: ['encyclopedia-set-detail', game.id, setSlug],
    queryFn: () => gameKnowledgeOwner.resolveSet(game.id, setSlug),
    staleTime: 60_000
  });

  const setCards = detail?.setCards || [];
  const filterConfig = SET_FILTERS_BY_GAME[game.id] || [];
  const filterOptions = useMemo(() => {
    const next = {};
    setCards.forEach((card) => {
      filterConfig.forEach(({ key }) => {
        const value = cardFilterValue(card, key);
        if (!value) return;
        if (!next[key]) next[key] = new Set();
        next[key].add(String(value));
      });
    });
    return Object.fromEntries(Object.entries(next).map(([key, values]) => [key, sortFilterValues(values)]));
  }, [filterConfig, setCards]);
  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return setCards.filter((card) => {
      if (q && !`${card.name} ${card.subtitle || ''} ${card.collector_number || ''} ${card.type_line || ''}`.toLowerCase().includes(q)) return false;
      return Object.entries(activeFilters).every(([key, value]) => !value || String(cardFilterValue(card, key)) === String(value));
    });
  }, [activeFilters, query, setCards]);
  const visibleCards = filteredCards.slice(0, visibleLimit);

  if (isLoading) return <LoadingState />;
  if (!detail) return <EmptyState title="Set not found" body="That set is not available in the Encyclopedia yet." to={`/Encyclopedia/${game.routeKey}/sets`} action="Back to sets" />;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Encyclopedia set" />
      <SectionShell className="py-8">
        <div className="min-w-0">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{detail.setCode || game.shortLabel}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">{detail.name}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {detail.cardCatalog?.knownLabel || `${setCards.length} known cards`} in collector order.
            </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={detail.legacySetPath}>
                <Button variant="outline" className="rounded border-slate-300 bg-white text-slate-900 hover:bg-slate-100">Retail set page</Button>
              </Link>
              <Link to={createPageUrl('Shop') + `?type=single_card&game=${encodeURIComponent(game.searchGame)}&search=${encodeURIComponent(detail.name)}`}>
                <Button className="rounded bg-slate-900 text-white hover:bg-slate-800">
                  {detail.availability?.activeListingCount > 0 ? `Shop ${detail.availability.activeListingCount} listing${detail.availability.activeListingCount === 1 ? '' : 's'}` : 'Shop this set'}
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-b border-slate-200 py-4 lg:flex-row lg:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-2 border border-slate-300 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(120); }} placeholder="Search this set" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[680px] lg:grid-cols-4">
              {filterConfig.filter(({ key }) => filterOptions[key]?.length > 0).map(({ key, label }) => (
                <select key={key} value={activeFilters[key] || ''} onChange={(event) => { setActiveFilters((current) => ({ ...current, [key]: event.target.value })); setVisibleLimit(120); }} className="min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none">
                  <option value="">{label || fieldLabel(key)}</option>
                  {filterOptions[key].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm font-semibold text-slate-600">
              Showing {visibleCards.length} of {filteredCards.length} card{filteredCards.length === 1 ? '' : 's'}
            </p>
            {detail.cardCatalog?.printingLabel && <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{detail.cardCatalog.printingLabel}</p>}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(138px,1fr))] gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]">
            {visibleCards.map((card) => <CardGalleryTile key={card.id} card={card} />)}
          </div>
          {visibleCards.length === 0 && (
            <div className="border-y border-slate-200 py-12 text-center text-sm font-semibold text-slate-500">No cards match those set filters.</div>
          )}
          {visibleCards.length < filteredCards.length && (
            <Button variant="outline" onClick={() => setVisibleLimit((current) => current + 120)} className="mt-8 w-full rounded border-slate-300 bg-white text-slate-900 hover:bg-slate-100">
              Show more cards
            </Button>
          )}
        </div>
      </SectionShell>
    </main>
  );
}

function CardDetailPage({ game, setSlug, cardId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['encyclopedia-set-card', game.id, setSlug, cardId],
    queryFn: () => gameKnowledgeOwner.resolveSetCard(game.id, setSlug, cardId),
    staleTime: 60_000
  });
  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState title="Card not found" body="The card could not be resolved inside that set." to={`/Encyclopedia/${game.routeKey}/sets/${setSlug}`} action="Back to set" />;

  const { card, detail, printings } = data;
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Encyclopedia card" />
      <SectionShell className="grid gap-8 py-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="bg-white p-3 shadow-sm">
            <CardImage card={card} alt={card.name} className="aspect-[63/88] w-full object-contain" fallbackClassName="flex aspect-[63/88] w-full items-center justify-center bg-slate-100 px-4 text-center text-sm font-semibold text-slate-500" />
          </div>
        </div>
        <div className="min-w-0">
          <Link to={`/Encyclopedia/${game.routeKey}/sets/${detail.slug}`} className="text-sm font-bold text-slate-500 hover:text-slate-950">{detail.name}</Link>
          <h1 className="mt-2 text-4xl font-black tracking-tight">{card.name}</h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {card.fields.map((field) => (
              <div key={field.label} className="border-t border-slate-200 pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{field.label}</p>
                <p className="mt-1 font-semibold text-slate-950">{field.value}</p>
              </div>
            ))}
          </div>
          {card.textBlocks.length > 0 && (
            <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {card.textBlocks.map((block) => (
                <div key={block.title} className="py-4">
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{block.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{block.text}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-8">
            <h2 className="text-2xl font-black tracking-tight">Printings and Availability</h2>
            <p className="mt-1 text-sm text-slate-600">Browse printings and MainPhase availability.</p>
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {printings.slice(0, 24).map((printing, index) => (
                <div key={`${printing.id || printing.searchIdentity || printing.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{printing.name || card.name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                      {[printing.setLabel, printing.numberLabel, printing.rarity, printing.variantLabel].filter(Boolean).join(' / ')}
                    </p>
                  </div>
                  <p className={`text-sm font-black ${printing.inStock ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {printing.inStock ? `In stock${printing.priceLabel ? ` / $${printing.priceLabel}` : ''}` : 'Known printing'}
                  </p>
                </div>
              ))}
              {printings.length === 0 && <p className="py-4 text-sm text-slate-600">No additional printings were resolved.</p>}
            </div>
          </div>
        </div>
      </SectionShell>
    </main>
  );
}

function RulesPage({ game, topicSlug }) {
  const topics = gameKnowledgeOwner.getRulesTopics(game.id);
  const topic = topicSlug ? gameKnowledgeOwner.getRulesTopic(game.id, topicSlug) : null;
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Encyclopedia rules" />
      <SectionShell className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {topic ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Rules topic</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">{topic.title}</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700">{topic.summary}</p>
              <SourceList sources={topic.sources} className="mt-8" />
            </>
          ) : (
            <>
              <h2 className="text-3xl font-black tracking-tight">Rules Topics</h2>
              <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                {topics.map((entry) => (
                  <Link key={entry.slug} to={entry.path} className="block py-4 hover:bg-white">
                    <p className="font-bold text-slate-950">{entry.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{entry.summary}</p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <aside className="h-fit border border-slate-200 bg-white p-5 shadow-sm">
          <BookOpen className="h-6 w-6 text-slate-700" />
          <h2 className="mt-3 text-lg font-black tracking-tight">Authority Boundary</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            MainPhase stores source-attributed summaries only. Official publisher documents remain the authority for event and judge rulings.
          </p>
        </aside>
      </SectionShell>
    </main>
  );
}

export default function Encyclopedia() {
  const params = useParams();
  const location = useLocation();
  if (!params.game) return <EncyclopediaLanding />;

  const game = gameKnowledgeOwner.getGame(params.game);
  if (!game) return <EmptyState title="Game not found" body="That game is not available in the MainPhase Encyclopedia yet." />;
  const segments = location.pathname.split('/').filter(Boolean);
  const section = segments[2] || '';
  const topicSlug = section === 'rules' ? segments[3] : '';
  if (params.cardId && params.setSlug) return <CardDetailPage game={game} setSlug={params.setSlug} cardId={params.cardId} />;
  if (params.setSlug) return <SetDetailPage game={game} setSlug={params.setSlug} />;
  if (section === 'sets') return <SetListPage game={game} />;
  if (section === 'rules') return <RulesPage game={game} topicSlug={topicSlug} />;
  return <GameLanding game={game} />;
}
