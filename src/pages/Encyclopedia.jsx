import React, { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, ExternalLink, Layers, Library, Search, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CardImage from '@/components/cards/CardImage';
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

const MAGIC_REFERENCE_GROUP_LABELS = {
  core: 'Core',
  timing: 'Timing',
  'turn-combat': 'Turn / Combat',
  'card-rules': 'Card Rules',
  advanced: 'Advanced',
  formats: 'Formats',
  commander: 'Commander'
};

function SectionShell({ children, className = '' }) {
  return <section className={`mx-auto w-full max-w-[100vw] overflow-x-hidden px-4 2xl:max-w-[1480px] ${className}`}>{children}</section>;
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
  if (game.id === 'magic') {
    return (
      <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
        Magic: The Gathering
      </span>
    );
  }

  return <img src={game.logoSrc} alt={game.label} loading="lazy" className={`h-auto w-auto object-contain ${game.logoClassName}`} />;
}

function GameIdentityMark({ game }) {
  if (game.id === 'magic') {
    return null;
  }

  return (
    <div className="flex h-12 max-w-[190px] items-center justify-start overflow-hidden opacity-90 md:justify-end">
      <GameLogo game={game} />
    </div>
  );
}

function GameHero({ game, eyebrow = 'TCG Encyclopedia' }) {
  const showIdentityMark = game.id !== 'magic';

  return (
    <section className={`bg-gradient-to-br ${game.tintClassName} text-white`}>
      <SectionShell className={`grid gap-4 py-4 md:items-center md:py-5 ${showIdentityMark ? 'md:grid-cols-[minmax(0,1fr)_220px]' : ''}`}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/58">{eyebrow}</p>
          <h1 className="mt-1.5 text-3xl font-black tracking-tight md:text-4xl">{game.label}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-white/74">{LANDING_COPY_BY_GAME[game.id] || 'Browse sets, cards, and rules.'}</p>
        </div>
        {showIdentityMark ? (
          <div className="flex min-h-10 items-center justify-start md:justify-end">
            <GameIdentityMark game={game} />
          </div>
        ) : null}
      </SectionShell>
    </section>
  );
}

function SourceList({ sources = [], className = '', title = 'Sources' }) {
  return (
    <div className={className}>
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{title}</h3>
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

function MagicDestinationCard({ to, icon: Icon, eyebrow, title, body, meta }) {
  return (
    <Link to={to} className="group flex min-h-[190px] min-w-0 flex-col justify-between border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md">
      <span>
        <span className="inline-flex h-10 w-10 items-center justify-center bg-slate-950 text-white">
          <Icon className="h-5 w-5" />
        </span>
        <span className="mt-5 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">{eyebrow}</span>
        <span className="mt-2 block text-2xl font-black tracking-tight text-slate-950">{title}</span>
        <span className="mt-2 block text-sm leading-6 text-slate-600">{body}</span>
      </span>
      <span className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-bold text-slate-900">
        <span>{meta}</span>
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function MagicHub({ game }) {
  const learnLessons = gameKnowledgeOwner.getRulesTopicsByCategory(game.id, 'learn');
  const referenceGroups = gameKnowledgeOwner.getRulesReferenceGroups(game.id);
  const referenceCount = referenceGroups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <GameHero game={game} />
      <SectionShell className="py-8">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          <Link to="/Encyclopedia" className="hover:text-slate-900">TCG Encyclopedia</Link>
          <span>/</span>
          <span>Magic</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <MagicDestinationCard
            to="/Encyclopedia/magic/sets"
            icon={Library}
            eyebrow="Browse"
            title="Sets & Cards"
            body="Search Magic sets, sort by release date, open set galleries, and continue into card detail."
            meta="Set browser"
          />
          <MagicDestinationCard
            to="/Encyclopedia/magic/learn"
            icon={BookOpen}
            eyebrow="Course"
            title="Learn to Play"
            body="A guided sequence from first game concepts through combat, the stack, abilities, and first decks."
            meta={`${learnLessons.length} lessons`}
          />
          <MagicDestinationCard
            to="/Encyclopedia/magic/rules"
            icon={ScrollText}
            eyebrow="Reference"
            title="Game Rules"
            body="Searchable rules topics for timing, zones, combat, card rules, formats, and Commander."
            meta={`${referenceCount} topics`}
          />
        </div>
      </SectionShell>
    </main>
  );
}

function SetRow({ set }) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <Link to={set.path} state={{ encyclopediaReturnTo: returnTo }} className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-4 py-3 hover:bg-white">
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
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
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

function updateBrowseParams(searchParams, setSearchParams, updates = {}) {
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
}

function SetBrowser({ game, title = 'Sets' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ['encyclopedia-sets', game.id],
    queryFn: () => gameKnowledgeOwner.listSets(game.id, { limit: 0 }),
    staleTime: 60_000
  });
  const query = searchParams.get('q') || '';
  const sortMode = searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const filteredSets = useMemo(() => sortSets(filterSetsByQuery(sets, query), sortMode), [query, sets, sortMode]);
  const totalPages = Math.max(1, Math.ceil(filteredSets.length / SETS_PER_PAGE));
  const currentPage = clampPage(searchParams.get('page') || '1', totalPages);
  const displaySets = filteredSets.slice((currentPage - 1) * SETS_PER_PAGE, currentPage * SETS_PER_PAGE);
  const handleBrowseChange = (updates = {}) => updateBrowseParams(searchParams, setSearchParams, updates);

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{filteredSets.length} set{filteredSets.length === 1 ? '' : 's'} visible.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:max-w-xl">
          <label className="flex min-w-0 flex-1 items-center gap-2 border border-slate-300 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => handleBrowseChange({ q: event.target.value, page: 1 })}
              placeholder="Search set name or code"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={sortMode}
            onChange={(event) => handleBrowseChange({ sort: event.target.value, page: 1 })}
            className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none"
          >
            <option value="newest">Newest to oldest</option>
            <option value="oldest">Oldest to newest</option>
          </select>
        </div>
      </div>
      {isLoading ? (
        <div className="py-10 text-sm font-semibold text-slate-500">Loading sets...</div>
      ) : displaySets.length === 0 ? (
        <div className="border-b border-slate-200 py-10 text-sm font-semibold text-slate-500">No sets match that search.</div>
      ) : (
        <div className="divide-y divide-slate-200">{displaySets.map((set) => <SetRow key={set.id} set={set} />)}</div>
      )}
      {!isLoading && <SetPagination currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => handleBrowseChange({ page })} />}
    </div>
  );
}

function GameLanding({ game }) {
  if (game.id === 'magic') return <MagicHub game={game} />;
  const rules = gameKnowledgeOwner.getRulesTopics(game.id);

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <GameHero game={game} />
      <SectionShell className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SetBrowser game={game} />
        <aside className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight">Rules / How to Play</h2>
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {rules.map((topic) => (
              <Link key={topic.slug} to={topic.path} className="block py-4 hover:bg-white">
                <p className="font-bold text-slate-950">{topic.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{topic.summary}</p>
              </Link>
            ))}
          </div>
        </aside>
      </SectionShell>
    </main>
  );
}

function SetListPage({ game }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Encyclopedia sets" />
      <SectionShell className="py-8">
        <SetBrowser game={game} title="All Sets" />
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

function gameCardDetailParam(gameId) {
  if (gameId === 'magic') return 'oracle_id';
  if (gameId === 'pokemon') return 'pokemon_id';
  if (gameId === 'yugioh') return 'yugioh_id';
  if (gameId === 'lorcana') return 'lorcana_id';
  if (gameId === 'onepiece') return 'onepiece_id';
  if (gameId === 'flesh_and_blood') return 'fab_id';
  if (gameId === 'starwars') return 'starwars_id';
  return 'id';
}

function canonicalIdPart(card = {}) {
  const parts = String(card.canonicalId || '').split(':').filter(Boolean);
  return parts.length > 1 ? parts[1] : '';
}

function cardDetailIdentity(card = {}, game = {}) {
  const raw = card.raw || {};
  if (game.id === 'magic') return raw.oracle_id || card.oracle_id || card.id || card.routeId;
  if (game.id === 'pokemon') return card.printingId || card.api_id || raw.id || card.id || card.routeId;
  if (game.id === 'yugioh') return raw.id || card.api_id || canonicalIdPart(card) || card.printingId || card.id || card.routeId;
  if (game.id === 'lorcana') return card.printingId || card.api_id || raw.id || card.id || card.routeId;
  if (game.id === 'onepiece') return card.printingId || card.api_id || raw.id || card.id || card.routeId;
  if (game.id === 'starwars') return card.printingId || raw.uuid || card.api_id || card.id || card.routeId;
  if (game.id === 'flesh_and_blood') return card.printingId || raw.unique_id || card.api_id || card.id || card.routeId;
  return card.api_id || raw.id || card.printingId || card.id || card.routeId;
}

function buildCanonicalCardDetailPath(card = {}, game = {}, detail = null, returnTo = '') {
  const params = new URLSearchParams();
  const identity = cardDetailIdentity(card, game);
  if (identity) params.set(gameCardDetailParam(game.id), identity);
  const setCode = card.set_code || detail?.setCode || detail?.set?.code || '';
  if (setCode) params.set('set', setCode);
  if (card.name) params.set('search', card.name);
  if (returnTo) {
    params.set('returnTo', returnTo);
    params.set('returnLabel', `Back to ${detail?.name || 'set'}`);
  }
  return `${createPageUrl('CardDetail')}?${params.toString()}`;
}

function CardGalleryTile({ card, setTotal, game, detail }) {
  const location = useLocation();
  const collectorNumber = card.collector_number || card.card_number || card.number || '';
  const metadata = [collectorNumber, setTotal].filter(Boolean).join(' / ');
  const returnTo = `${location.pathname}${location.search}`;
  const detailPath = buildCanonicalCardDetailPath(card, game, detail, returnTo);

  return (
    <Link to={detailPath} state={{ returnTo, returnLabel: `Back to ${detail?.name || 'set'}` }} className="group block min-w-0">
      <div className="aspect-[63/88] overflow-hidden bg-slate-100 shadow-sm ring-1 ring-slate-200 transition group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-slate-300">
        <CardImage card={card} alt={card.name} className="h-full w-full object-contain" fallbackClassName="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500" />
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-bold leading-5 text-slate-950">{card.name}</p>
        <p className="mt-0.5 truncate text-xs font-semibold leading-4 text-slate-500">
          {metadata}
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
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [visibleLimit, setVisibleLimit] = useState(120);
  const returnTo = location.state?.encyclopediaReturnTo || `/Encyclopedia/${game.routeKey}`;
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
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Encyclopedia set" />
      <SectionShell className="py-8">
        <div className="min-w-0">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link to={returnTo} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500 hover:text-slate-900">
                <span aria-hidden="true">&larr;</span>
                {game.shortLabel || game.label} Sets
              </Link>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{detail.setCode || game.shortLabel}</p>
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
            {visibleCards.map((card) => <CardGalleryTile key={card.id} card={card} setTotal={setCards.length} game={game} detail={detail} />)}
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

function EncyclopediaCardRedirect({ game, setSlug, cardId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['encyclopedia-set-card', game.id, setSlug, cardId],
    queryFn: () => gameKnowledgeOwner.resolveSetCard(game.id, setSlug, cardId),
    staleTime: 60_000
  });
  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState title="Card not found" body="The card could not be resolved inside that set." to={`/Encyclopedia/${game.routeKey}/sets/${setSlug}`} action="Back to set" />;
  const { card, detail } = data;
  const returnTo = `/Encyclopedia/${game.routeKey}/sets/${detail.slug}`;
  return <Navigate to={buildCanonicalCardDetailPath(card, game, detail, returnTo)} replace />;
}

function TeachingCard({ card }) {
  return (
    <div className="min-w-0">
      <div className="aspect-[63/88] overflow-hidden bg-white shadow-sm ring-1 ring-slate-200">
        <CardImage card={card} alt={card.name} className="h-full w-full object-contain" fallbackClassName="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500" />
      </div>
      <p className="mt-2 truncate text-sm font-black text-slate-950">{card.name}</p>
      <p className="truncate text-xs font-semibold text-slate-500">{card.type_line || card.set_name || card.set_code}</p>
    </div>
  );
}

function useMagicVisualCards(visual) {
  const oracleIds = Array.isArray(visual?.oracleIds) ? visual.oracleIds : [];
  return useQuery({
    queryKey: ['magic-teaching-cards', oracleIds],
    queryFn: () => gameKnowledgeOwner.getMagicTeachingCards(oracleIds),
    enabled: oracleIds.length > 0,
    staleTime: 60_000
  });
}

function LessonVisual({ visual }) {
  const { data: cards = [] } = useMagicVisualCards(visual);
  if (!visual) return null;
  const steps = visual.steps || visual.stack || visual.callouts || visual.allowed || [];

  return (
    <section className="mt-8 border-y border-slate-200 bg-white/60 py-5">
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Visual Guide</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">{visual.title}</h3>
          {visual.cost && <p className="mt-2 text-sm font-black text-slate-700">Cost: {visual.cost}</p>}
          <div className="mt-4 grid gap-2">
            {steps.map((step, index) => (
              <div key={`${visual.type}-${step}`} className="grid grid-cols-[30px_minmax(0,1fr)] items-start gap-3 border-t border-slate-200 pt-2">
                <span className="text-sm font-black text-slate-400">{index + 1}</span>
                <span className="min-w-0 break-words text-sm font-semibold leading-6 text-slate-700">{step}</span>
              </div>
            ))}
          </div>
          {Array.isArray(visual.blocked) && visual.blocked.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Outside Identity</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{visual.blocked.join(', ')}</p>
            </div>
          )}
        </div>
        {cards.length > 0 && (
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:w-[360px]">
            {cards.slice(0, 6).map((card) => <TeachingCard key={card.oracle_id || card.id} card={card} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function ArticleBody({ article }) {
  return (
    <div className="mt-8 space-y-8">
      {(article?.sections || []).map((section) => (
        <section key={section.heading} className="border-t border-slate-200 pt-5">
          <h3 className="text-xl font-black tracking-tight text-slate-950">{section.heading}</h3>
          <div className="mt-3 space-y-3">
            {(section.body || []).map((paragraph, index) => (
              <p key={`${section.heading}-${index}`} className="break-words text-sm leading-7 text-slate-700">{paragraph}</p>
            ))}
          </div>
          {section.example && (
            <p className="mt-4 break-words border-l-2 border-slate-300 pl-4 text-sm font-semibold leading-6 text-slate-700">{section.example}</p>
          )}
        </section>
      ))}
    </div>
  );
}

function LessonNav({ previousTopic, nextTopic }) {
  if (!previousTopic && !nextTopic) return null;
  return (
    <div className="mt-8 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
      {previousTopic ? (
        <Link to={previousTopic.path} className="min-w-0 break-words border border-slate-200 bg-white p-4 hover:border-slate-400">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Previous lesson</span>
          <span className="mt-1 block font-black text-slate-950">{previousTopic.title}</span>
        </Link>
      ) : <div />}
      {nextTopic ? (
        <Link to={nextTopic.path} className="min-w-0 break-words border border-slate-200 bg-white p-4 text-right hover:border-slate-400">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Next lesson</span>
          <span className="mt-1 block font-black text-slate-950">{nextTopic.title}</span>
        </Link>
      ) : null}
    </div>
  );
}

function LearnPage({ game, topicSlug }) {
  const lessons = gameKnowledgeOwner.getRulesTopicsByCategory(game.id, 'learn');
  const topic = topicSlug ? gameKnowledgeOwner.getRulesTopic(game.id, topicSlug) : null;
  if (topicSlug && topic?.category !== 'learn') return <EmptyState title="Lesson not found" body="That Learn to Play lesson is not available." to="/Encyclopedia/magic/learn" action="Back to Learn to Play" />;
  const previousTopic = topic?.previousSlug ? gameKnowledgeOwner.getRulesTopic(game.id, topic.previousSlug) : null;
  const nextTopic = topic?.nextSlug ? gameKnowledgeOwner.getRulesTopic(game.id, topic.nextSlug) : null;
  const relatedTopics = (topic?.relatedTopics || [])
    .map((slug) => gameKnowledgeOwner.getRulesTopic(game.id, slug))
    .filter(Boolean)
    .slice(0, 6);

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Learn to Play" />
      <SectionShell className="py-8">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          <Link to="/Encyclopedia" className="hover:text-slate-900">TCG Encyclopedia</Link>
          <span>/</span>
          <Link to="/Encyclopedia/magic" className="hover:text-slate-900">Magic</Link>
          <span>/</span>
          <span>Learn to Play</span>
        </div>
        {topic ? (
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <article className="min-w-0 max-w-full break-words">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Lesson {topic.order}</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">{topic.title}</h2>
              <p className="mt-4 max-w-3xl break-words text-base leading-7 text-slate-700">{topic.article?.introduction || topic.summary}</p>
              <LessonVisual visual={topic.visual} />
              <ArticleBody article={topic.article} />
              {relatedTopics.length > 0 && (
                <div className="mt-8 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Deeper Rules</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {relatedTopics.map((entry) => (
                      <Link key={entry.slug} to={entry.path} className="min-w-0 break-words border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:border-slate-400">
                        {entry.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <LessonNav previousTopic={previousTopic} nextTopic={nextTopic} />
              <SourceList sources={topic.sources.slice(0, 1)} className="mt-8 border-t border-slate-200 pt-5" title="Official Rules Reference" />
            </article>
            <aside className="h-fit border-y border-slate-200 py-5">
              <h2 className="text-lg font-black tracking-tight">Course Progress</h2>
              <div className="mt-4 divide-y divide-slate-200">
                {lessons.map((lesson) => (
                  <Link key={lesson.slug} to={lesson.path} className={`grid grid-cols-[30px_minmax(0,1fr)] gap-3 py-3 text-sm hover:bg-white ${lesson.slug === topic.slug ? 'text-slate-950' : 'text-slate-600'}`}>
                    <span className="font-black text-slate-400">{lesson.order}</span>
                    <span className="font-bold">{lesson.title}</span>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <h2 className="text-3xl font-black tracking-tight">Learn to Play</h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">Start with the table basics, then move through turns, combat, responses, the stack, abilities, and first deck building.</p>
              <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
                {lessons.map((lesson) => (
                  <Link key={lesson.slug} to={lesson.path} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-start gap-3 py-4 hover:bg-white">
                    <span className="text-sm font-black text-slate-400">{lesson.order}</span>
                    <span className="min-w-0">
                      <span className="block font-black text-slate-950">{lesson.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">{lesson.summary}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>
            <aside className="h-fit border-y border-slate-200 py-5">
              <h2 className="text-lg font-black tracking-tight">Course Shape</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{lessons.length} lessons with real-card examples for card anatomy, mana, combat, responses, triggers, and Commander color identity.</p>
              {lessons[0] && (
                <Link to={lessons[0].path}>
                  <Button className="mt-5 w-full rounded bg-slate-900 text-white hover:bg-slate-800">Start lesson 1</Button>
                </Link>
              )}
            </aside>
          </div>
        )}
      </SectionShell>
    </main>
  );
}

function RulesPage({ game, topicSlug }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMagic = game.id === 'magic';
  const rulesQuery = isMagic ? (searchParams.get('q') || '') : '';
  const topics = isMagic ? gameKnowledgeOwner.searchRulesTopics(game.id, rulesQuery) : gameKnowledgeOwner.getRulesTopics(game.id);
  const topic = topicSlug ? gameKnowledgeOwner.getRulesTopic(game.id, topicSlug) : null;
  const article = topic?.article || null;
  if (isMagic && topic?.category === 'learn') return <Navigate to={`/Encyclopedia/magic/learn/${topic.slug}`} replace />;
  const categoryLabel = isMagic ? 'Game Rules' : 'Rules Reference';
  const learnLessons = isMagic ? gameKnowledgeOwner.getRulesTopicsByCategory(game.id, 'learn') : [];
  const referenceGroups = isMagic ? (() => {
    const groups = new Map();
    topics.forEach((entry) => {
      const key = entry.referenceGroup || entry.sectionId || 'reference';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    return [...groups.entries()].map(([key, entries]) => ({ key, entries }));
  })() : [];
  const relatedTopics = (topic?.relatedTopics || [])
    .map((slug) => gameKnowledgeOwner.getRulesTopic(game.id, slug))
    .filter(Boolean)
    .slice(0, 6);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <GameHero game={game} eyebrow="Encyclopedia rules" />
      <SectionShell className="grid min-w-0 gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 max-w-full break-words">
          {topic ? (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {isMagic && (
                  <>
                    <Link to="/Encyclopedia" className="hover:text-slate-900">TCG Encyclopedia</Link>
                    <span>/</span>
                  </>
                )}
                <Link to={`/Encyclopedia/${game.routeKey}`} className="hover:text-slate-900">{game.shortLabel || game.label}</Link>
                <span>/</span>
                <Link to={`/Encyclopedia/${game.routeKey}/rules`} className="hover:text-slate-900">{isMagic ? categoryLabel : 'Rules'}</Link>
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Rules topic</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">{topic.title}</h2>
              <p className="mt-4 max-w-3xl break-words text-base leading-7 text-slate-700">{article?.introduction || topic.summary}</p>
              {Array.isArray(article?.terminology) && article.terminology.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {article.terminology.map((term) => (
                    <span key={term} className="border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{term}</span>
                  ))}
                </div>
              )}
              <LessonVisual visual={topic.visual} />
              <ArticleBody article={article} />
              {relatedTopics.length > 0 && (
                <div className="mt-8 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Related Topics</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {relatedTopics.map((entry) => (
                      <Link key={entry.slug} to={entry.path} className="min-w-0 break-words border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:border-slate-400">
                        {entry.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {isMagic && topic.category === 'learn' && <LessonNav previousTopic={previousTopic} nextTopic={nextTopic} />}
              <SourceList sources={topic.sources.slice(0, 1)} className="mt-8 border-t border-slate-200 pt-5" title={isMagic ? 'Official Rules Reference' : 'Sources'} />
            </>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {isMagic && (
                  <>
                    <Link to="/Encyclopedia" className="hover:text-slate-900">TCG Encyclopedia</Link>
                    <span>/</span>
                  </>
                )}
                <Link to={`/Encyclopedia/${game.routeKey}`} className="hover:text-slate-900">{game.shortLabel || game.label}</Link>
                <span>/</span>
                <span>Rules</span>
              </div>
              <h2 className="text-3xl font-black tracking-tight">{isMagic ? 'Game Rules' : 'Rules / How to Play'}</h2>
              {isMagic ? (
                <>
                  <label className="mt-5 flex min-w-0 items-center gap-2 border border-slate-300 bg-white px-3 py-2">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={rulesQuery}
                      onChange={(event) => updateBrowseParams(searchParams, setSearchParams, { q: event.target.value })}
                      placeholder="Search topic, alias, keyword, or mechanic"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>
                  <div className="mt-6 space-y-6">
                    {referenceGroups.map((group) => (
                      <section key={group.key} className="border-y border-slate-200 py-3">
                        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{MAGIC_REFERENCE_GROUP_LABELS[group.key] || fieldLabel(group.key)}</h3>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {group.entries.map((entry) => (
                            <Link key={entry.slug} to={entry.path} className="min-w-0 break-words border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:border-slate-400">
                              <span className="block text-slate-950">{entry.title}</span>
                              <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-slate-500">{entry.summary}</span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    ))}
                    {referenceGroups.length === 0 && (
                      <div className="border-y border-slate-200 py-10 text-sm font-semibold text-slate-500">No rules topics match that search.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                  {topics.map((entry) => (
                    <Link key={entry.slug} to={entry.path} className="block py-4 hover:bg-white">
                      <p className="font-bold text-slate-950">{entry.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{entry.summary}</p>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <aside className="h-fit border-y border-slate-200 py-5">
          <h2 className="text-lg font-black tracking-tight">{game.shortLabel || game.label} Rules</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Browse learning topics for play, deck construction, and common table interactions.</p>
          {isMagic && (
            <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Learn Path</h3>
                <Link to="/Encyclopedia/magic/learn" className="mt-1 block text-sm font-semibold text-slate-700 hover:text-slate-950">{learnLessons.length} sequential lessons</Link>
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Reference</h3>
                <p className="mt-1 text-sm font-semibold text-slate-700">{referenceGroups.reduce((sum, group) => sum + group.entries.length, 0)} searchable topics</p>
              </div>
            </div>
          )}
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
  const topicSlug = section === 'rules' || section === 'learn' ? segments[3] : '';
  if (params.cardId && params.setSlug) return <EncyclopediaCardRedirect game={game} setSlug={params.setSlug} cardId={params.cardId} />;
  if (params.setSlug) return <SetDetailPage game={game} setSlug={params.setSlug} />;
  if (section === 'sets') return <SetListPage game={game} />;
  if (section === 'learn') return game.id === 'magic' ? <LearnPage game={game} topicSlug={topicSlug} /> : <Navigate to={`/Encyclopedia/${game.routeKey}/rules`} replace />;
  if (section === 'rules') return <RulesPage game={game} topicSlug={topicSlug} />;
  return <GameLanding game={game} />;
}
