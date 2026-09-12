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

const encyclopediaPageClass = 'min-h-screen overflow-x-hidden bg-[#070b14] text-slate-100';
const encyclopediaPanelClass = 'border border-slate-700/70 bg-slate-900/44 shadow-[0_18px_70px_rgba(0,0,0,0.22)]';
const encyclopediaDividerClass = 'border-slate-700/70';
const encyclopediaMutedTextClass = 'text-slate-400';
const encyclopediaSoftTextClass = 'text-slate-300';
const encyclopediaAccentTextClass = 'text-cyan-200';
const encyclopediaControlClass = 'border border-slate-700 bg-slate-950/70 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/70';
const encyclopediaButtonClass = 'rounded border-slate-700 bg-slate-950/70 text-slate-100 hover:border-cyan-300/70 hover:bg-slate-900 disabled:opacity-45';
const encyclopediaPrimaryButtonClass = 'rounded bg-cyan-200 text-slate-950 hover:bg-cyan-100';

function SectionShell({ children, className = '' }) {
  return <section className={`mx-auto box-border w-full max-w-[100vw] overflow-x-hidden px-4 2xl:max-w-[1480px] ${className}`}>{children}</section>;
}

function LoadingState() {
  return (
    <main className={encyclopediaPageClass}>
      <div className="mx-auto flex min-h-[420px] w-full max-w-[1480px] items-center justify-center px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-800 border-t-cyan-200" />
      </div>
    </main>
  );
}

function EmptyState({ title, body, to = '/Encyclopedia', action = 'Back to Encyclopedia' }) {
  return (
    <main className={encyclopediaPageClass}>
      <SectionShell className="py-16">
        <p className={`text-xs font-bold uppercase tracking-[0.18em] ${encyclopediaMutedTextClass}`}>Encyclopedia</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">{title}</h1>
        <p className={`mt-2 max-w-2xl text-sm leading-6 ${encyclopediaSoftTextClass}`}>{body}</p>
        <Link to={to}>
          <Button className={`mt-6 ${encyclopediaPrimaryButtonClass}`}>{action}</Button>
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
    return (
      <span className="flex h-9 w-9 items-center justify-center border border-cyan-200/35 bg-cyan-200/10 text-xs font-black uppercase tracking-[0.08em] text-cyan-100">
        MTG
      </span>
    );
  }

  return <img src={game.logoSrc} alt="" loading="lazy" className="max-h-9 max-w-[92px] object-contain opacity-95" />;
}

function GameHubHeader({ game }) {
  return (
    <section className="border-b border-slate-800 bg-slate-950/55 text-white">
      <SectionShell className="py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100/70">TCG Encyclopedia</p>
            <div className="mt-2 flex min-w-0 items-center gap-3">
              <GameIdentityMark game={game} />
              <h1 className="min-w-0 text-2xl font-black tracking-tight text-white md:text-3xl">{game.label}</h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-300">{LANDING_COPY_BY_GAME[game.id] || 'Browse sets, cards, and rules.'}</p>
          </div>
        </div>
      </SectionShell>
    </section>
  );
}

function PageHeader({ breadcrumbs = [], eyebrow, title, subtitle, actions = null }) {
  return (
    <SectionShell className="pt-6">
      <div className={`min-w-0 overflow-x-hidden border-b ${encyclopediaDividerClass} pb-5`}>
        <div className={`mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] ${encyclopediaMutedTextClass}`}>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {crumb.to ? <Link to={crumb.to} className="min-w-0 break-words hover:text-cyan-200">{crumb.label}</Link> : <span className="min-w-0 break-words">{crumb.label}</span>}
              {index < breadcrumbs.length - 1 ? <span>/</span> : null}
            </React.Fragment>
          ))}
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {eyebrow ? <p className={`text-xs font-bold uppercase tracking-[0.18em] ${encyclopediaMutedTextClass}`}>{eyebrow}</p> : null}
            <h1 className="mt-1 max-w-full break-words text-3xl font-black tracking-tight text-white">{title}</h1>
            {subtitle ? <p className={`mt-2 max-w-[min(22rem,calc(100vw-2rem))] break-words text-sm leading-6 ${encyclopediaSoftTextClass} sm:max-w-3xl`}>{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </SectionShell>
  );
}

function SourceList({ sources = [], className = '', title = 'Sources' }) {
  return (
    <div className={className}>
      <h3 className={`text-sm font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>{title}</h3>
      <div className="mt-3 space-y-3">
        {sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className={`block border-t ${encyclopediaDividerClass} pt-3 text-sm font-bold text-slate-100 hover:text-cyan-200`}>
            <span className="inline-flex items-center gap-2">{source.label}<ExternalLink className="h-3.5 w-3.5" /></span>
            <span className={`mt-1 block text-xs font-semibold ${encyclopediaMutedTextClass}`}>{source.freshness}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function MagicDestinationCard({ to, icon: Icon, eyebrow, title, body, meta }) {
  return (
    <Link to={to} className={`group flex min-h-[190px] min-w-0 flex-col justify-between p-5 transition hover:border-cyan-300/60 hover:bg-slate-900/70 ${encyclopediaPanelClass}`}>
      <span>
        <span className="inline-flex h-10 w-10 items-center justify-center border border-cyan-200/30 bg-cyan-200/10 text-cyan-100">
          <Icon className="h-5 w-5" />
        </span>
        <span className={`mt-5 block text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>{eyebrow}</span>
        <span className="mt-2 block text-2xl font-black tracking-tight text-white">{title}</span>
        <span className={`mt-2 block text-sm leading-6 ${encyclopediaSoftTextClass}`}>{body}</span>
      </span>
      <span className={`mt-5 flex items-center justify-between border-t ${encyclopediaDividerClass} pt-4 text-sm font-bold ${encyclopediaAccentTextClass}`}>
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
    <main className={encyclopediaPageClass}>
      <GameHubHeader game={game} />
      <SectionShell className="py-6">
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
    <Link to={set.path} state={{ encyclopediaReturnTo: returnTo }} className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-4 py-3 transition hover:bg-slate-900/62">
      <div className="flex h-10 w-10 items-center justify-center border border-slate-700/70 bg-slate-950/70">
        {set.imageUrl ? <img src={set.imageUrl} alt="" className="max-h-8 max-w-8 object-contain opacity-90 invert" /> : <Layers className="h-5 w-5 text-slate-500" />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold text-slate-100">{set.name}</p>
        <p className={`mt-0.5 text-xs font-semibold ${encyclopediaMutedTextClass}`}>
          {[set.setCode, set.releaseDate].filter(Boolean).join(' · ') || 'Set'}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-500" />
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
    <div className={`flex flex-col gap-3 border-t ${encyclopediaDividerClass} pt-4 sm:flex-row sm:items-center sm:justify-between`}>
      <p className={`text-sm font-semibold ${encyclopediaSoftTextClass}`}>Page {currentPage} of {totalPages}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className={encyclopediaButtonClass}>
          Previous
        </Button>
        <Button type="button" variant="outline" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className={encyclopediaButtonClass}>
          Next
        </Button>
      </div>
    </div>
  );
}

function EncyclopediaLanding() {
  const games = gameKnowledgeOwner.listGames();
  return (
    <main className={encyclopediaPageClass}>
      <section
        className="border-b border-slate-800 bg-cover bg-center text-white"
        style={{ backgroundImage: 'linear-gradient(90deg, rgba(7, 11, 20, 0.82), rgba(7, 11, 20, 0.44) 48%, rgba(7, 11, 20, 0.2)), url("/images/tcg-encyclopedia-banner.png")' }}
      >
        <SectionShell className="py-10 md:py-12">
          <h1
            className="max-w-4xl text-4xl font-semibold tracking-normal text-[#f4ead7] drop-shadow-[0_2px_18px_rgba(224,154,72,0.32)] md:text-5xl"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            TCG Encyclopedia
          </h1>
        </SectionShell>
      </section>

      <SectionShell className="py-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {games.map((game) => (
            <Link key={game.id} to={`/Encyclopedia/${game.routeKey}`} className={`group flex min-h-[210px] flex-col justify-between p-5 transition hover:border-cyan-300/60 hover:bg-slate-900/70 ${encyclopediaPanelClass}`}>
              <div>
                <div className={`flex h-20 items-center justify-start border border-slate-700/70 bg-gradient-to-br ${game.tintClassName} px-4`}>
                  <GameLogo game={game} />
                </div>
                <h2 className="mt-4 text-xl font-black tracking-tight text-white">{game.label}</h2>
                <p className={`mt-2 line-clamp-3 text-sm leading-6 ${encyclopediaSoftTextClass}`}>{LANDING_COPY_BY_GAME[game.id] || 'Browse sets, cards, and rules.'}</p>
              </div>
              <div className={`mt-5 flex items-center justify-between border-t ${encyclopediaDividerClass} pt-4 text-sm font-bold ${encyclopediaAccentTextClass}`}>
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

function SetBrowser({ game, title = 'Sets', showTitle = true }) {
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
      <div className={`flex flex-col gap-4 border-b ${encyclopediaDividerClass} pb-5 md:flex-row md:items-end md:justify-between`}>
        <div>
          {showTitle ? <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2> : null}
          <p className={`mt-1 text-sm ${encyclopediaSoftTextClass}`}>{filteredSets.length} set{filteredSets.length === 1 ? '' : 's'} visible.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:max-w-xl">
          <label className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 ${encyclopediaControlClass}`}>
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => handleBrowseChange({ q: event.target.value, page: 1 })}
              placeholder="Search set name or code"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </label>
          <select
            value={sortMode}
            onChange={(event) => handleBrowseChange({ sort: event.target.value, page: 1 })}
            className={`px-3 py-2 text-sm font-semibold ${encyclopediaControlClass}`}
          >
            <option value="newest">Newest to oldest</option>
            <option value="oldest">Oldest to newest</option>
          </select>
        </div>
      </div>
      {isLoading ? (
        <div className={`py-10 text-sm font-semibold ${encyclopediaMutedTextClass}`}>Loading sets...</div>
      ) : displaySets.length === 0 ? (
        <div className={`border-b ${encyclopediaDividerClass} py-10 text-sm font-semibold ${encyclopediaMutedTextClass}`}>No sets match that search.</div>
      ) : (
        <div className={`divide-y ${encyclopediaDividerClass}`}>{displaySets.map((set) => <SetRow key={set.id} set={set} />)}</div>
      )}
      {!isLoading && <SetPagination currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => handleBrowseChange({ page })} />}
    </div>
  );
}

function GameLanding({ game }) {
  if (game.id === 'magic') return <MagicHub game={game} />;
  const rules = gameKnowledgeOwner.getRulesTopics(game.id);

  return (
    <main className={encyclopediaPageClass}>
      <GameHubHeader game={game} />
      <SectionShell className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SetBrowser game={game} />
        <aside className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight text-white">Rules / How to Play</h2>
          <div className={`mt-4 divide-y border-y ${encyclopediaDividerClass}`}>
            {rules.map((topic) => (
              <Link key={topic.slug} to={topic.path} className="block py-4 transition hover:bg-slate-900/62">
                <p className="font-bold text-slate-100">{topic.title}</p>
                <p className={`mt-1 text-sm leading-6 ${encyclopediaSoftTextClass}`}>{topic.summary}</p>
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
    <main className={encyclopediaPageClass}>
      <PageHeader
        breadcrumbs={[
          { label: 'TCG Encyclopedia', to: '/Encyclopedia' },
          { label: game.shortLabel || game.label, to: `/Encyclopedia/${game.routeKey}` },
          { label: 'Sets' }
        ]}
        title="All Sets"
      />
      <SectionShell className="py-6">
        <SetBrowser game={game} title="All Sets" showTitle={false} />
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
      <div className="aspect-[63/88] overflow-hidden bg-slate-950/80 shadow-sm ring-1 ring-slate-700 transition group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-cyan-300/50">
        <CardImage card={card} alt={card.name} className="h-full w-full object-contain" fallbackClassName="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500" />
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-bold leading-5 text-slate-100">{card.name}</p>
        <p className={`mt-0.5 truncate text-xs font-semibold leading-4 ${encyclopediaMutedTextClass}`}>
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
    <main className={encyclopediaPageClass}>
      <PageHeader
        breadcrumbs={[
          { label: 'TCG Encyclopedia', to: '/Encyclopedia' },
          { label: game.shortLabel || game.label, to: `/Encyclopedia/${game.routeKey}` },
          { label: 'Sets', to: `/Encyclopedia/${game.routeKey}/sets` }
        ]}
        eyebrow={detail.setCode || game.shortLabel}
        title={detail.name}
        subtitle={`${detail.cardCatalog?.knownLabel || `${setCards.length} known cards`} in collector order.`}
        actions={(
          <>
            <Link to={detail.legacySetPath}>
              <Button variant="outline" className={encyclopediaButtonClass}>Retail set page</Button>
            </Link>
            <Link to={createPageUrl('Shop') + `?type=single_card&game=${encodeURIComponent(game.searchGame)}&search=${encodeURIComponent(detail.name)}`}>
              <Button className={encyclopediaPrimaryButtonClass}>
                {detail.availability?.activeListingCount > 0 ? `Shop ${detail.availability.activeListingCount} listing${detail.availability.activeListingCount === 1 ? '' : 's'}` : 'Shop this set'}
              </Button>
            </Link>
          </>
        )}
      />
      <SectionShell className="py-6">
        <div className="min-w-0">
          <div className={`flex flex-col gap-3 border-b ${encyclopediaDividerClass} py-4 lg:flex-row lg:items-center`}>
            <label className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 ${encyclopediaControlClass}`}>
              <Search className="h-4 w-4 text-slate-500" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(120); }} placeholder="Search this set" className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
            </label>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[680px] lg:grid-cols-4">
              {filterConfig.filter(({ key }) => filterOptions[key]?.length > 0).map(({ key, label }) => (
                <select key={key} value={activeFilters[key] || ''} onChange={(event) => { setActiveFilters((current) => ({ ...current, [key]: event.target.value })); setVisibleLimit(120); }} className={`min-w-0 px-3 py-2 text-sm font-semibold ${encyclopediaControlClass}`}>
                  <option value="">{label || fieldLabel(key)}</option>
                  {filterOptions[key].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className={`text-sm font-semibold ${encyclopediaSoftTextClass}`}>
              Showing {visibleCards.length} of {filteredCards.length} card{filteredCards.length === 1 ? '' : 's'}
            </p>
            {detail.cardCatalog?.printingLabel && <p className={`text-xs font-bold uppercase tracking-[0.14em] ${encyclopediaMutedTextClass}`}>{detail.cardCatalog.printingLabel}</p>}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(138px,1fr))] gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]">
            {visibleCards.map((card) => <CardGalleryTile key={card.id} card={card} setTotal={setCards.length} game={game} detail={detail} />)}
          </div>
          {visibleCards.length === 0 && (
            <div className={`border-y ${encyclopediaDividerClass} py-12 text-center text-sm font-semibold ${encyclopediaMutedTextClass}`}>No cards match those set filters.</div>
          )}
          {visibleCards.length < filteredCards.length && (
            <Button variant="outline" onClick={() => setVisibleLimit((current) => current + 120)} className={`mt-8 w-full ${encyclopediaButtonClass}`}>
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
      <div className="aspect-[63/88] overflow-hidden bg-slate-950/80 shadow-sm ring-1 ring-slate-700">
        <CardImage card={card} alt={card.name} className="h-full w-full object-contain" fallbackClassName="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500" />
      </div>
      <p className="mt-2 truncate text-sm font-black text-slate-100">{card.name}</p>
      <p className={`truncate text-xs font-semibold ${encyclopediaMutedTextClass}`}>{card.type_line || card.set_name || card.set_code}</p>
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
  const steps = visual.phases || visual.steps || visual.stack || visual.triggerWords || visual.callouts || visual.allowed || [];
  const visualLabel = {
    'card-anatomy': 'Card Anatomy',
    'mana-payment': 'Mana Payment',
    'turn-timeline': 'Turn Timeline',
    combat: 'Combat Walkthrough',
    stack: 'Stack Sequence',
    trigger: 'Triggered Ability',
    'commander-color-identity': 'Commander Identity'
  }[visual.type] || 'Visual Guide';

  return (
    <section className={`mt-8 max-w-[min(22rem,calc(100vw-2rem))] border-y ${encyclopediaDividerClass} bg-slate-900/30 py-5 sm:max-w-full`}>
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>{visualLabel}</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-white">{visual.title}</h3>
          {visual.cost && <p className={`mt-2 text-sm font-black ${encyclopediaSoftTextClass}`}>Cost: {visual.cost}</p>}
          <div className={`mt-4 grid gap-2 ${visual.type === 'turn-timeline' ? 'sm:grid-cols-2' : ''}`}>
            {steps.map((step, index) => (
              <div key={`${visual.type}-${step.label || step}`} className={`grid grid-cols-[30px_minmax(0,1fr)] items-start gap-3 border-t ${encyclopediaDividerClass} pt-2`}>
                <span className="text-sm font-black text-slate-400">{index + 1}</span>
                <span className={`min-w-0 break-words text-sm leading-6 ${encyclopediaSoftTextClass}`}>
                  <span className="block font-black text-slate-100">{step.label || step}</span>
                  {step.detail ? <span className="mt-0.5 block font-semibold">{step.detail}</span> : null}
                </span>
              </div>
            ))}
          </div>
          {Array.isArray(visual.allowed) && visual.allowed.length > 0 && visual.type === 'commander-color-identity' && (
            <div className={`mt-4 border-t ${encyclopediaDividerClass} pt-3`}>
              <p className={`text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Within Identity</p>
              <p className={`mt-1 text-sm font-semibold ${encyclopediaSoftTextClass}`}>{visual.allowed.join(', ')}</p>
            </div>
          )}
          {Array.isArray(visual.blocked) && visual.blocked.length > 0 && (
            <div className={`mt-4 border-t ${encyclopediaDividerClass} pt-3`}>
              <p className={`text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Outside Identity</p>
              <p className={`mt-1 text-sm font-semibold ${encyclopediaSoftTextClass}`}>{visual.blocked.join(', ')}</p>
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
    <div className="mt-8 min-w-0 max-w-full space-y-8 overflow-x-hidden">
      {(article?.sections || []).map((section) => (
        <section key={section.heading} className={`min-w-0 max-w-full border-t ${encyclopediaDividerClass} pt-5`}>
          <h3 className="text-xl font-black tracking-tight text-white">{section.heading}</h3>
          <div className="mt-3 space-y-3">
            {(section.body || []).map((paragraph, index) => (
              <p key={`${section.heading}-${index}`} className={`w-full max-w-[min(22rem,calc(100vw-2rem))] break-words text-sm leading-7 ${encyclopediaSoftTextClass} sm:max-w-full`}>{paragraph}</p>
            ))}
          </div>
          {section.example && (
            <p className="mt-4 break-words border-l-2 border-cyan-300/45 bg-slate-950/40 py-2 pl-4 pr-3 text-sm font-semibold leading-6 text-slate-300">{section.example}</p>
          )}
        </section>
      ))}
    </div>
  );
}

function LessonNav({ previousTopic, nextTopic }) {
  if (!previousTopic && !nextTopic) return null;
  return (
    <div className={`mt-8 grid gap-3 border-t ${encyclopediaDividerClass} pt-5 sm:grid-cols-2`}>
      {previousTopic ? (
        <Link to={previousTopic.path} className={`min-w-0 break-words p-4 transition hover:border-cyan-300/60 hover:bg-slate-900/70 ${encyclopediaPanelClass}`}>
          <span className={`text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Previous lesson</span>
          <span className="mt-1 block font-black text-white">{previousTopic.title}</span>
        </Link>
      ) : <div />}
      {nextTopic ? (
        <Link to={nextTopic.path} className={`min-w-0 break-words p-4 text-right transition hover:border-cyan-300/60 hover:bg-slate-900/70 ${encyclopediaPanelClass}`}>
          <span className={`text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Next lesson</span>
          <span className="mt-1 block font-black text-white">{nextTopic.title}</span>
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
    <main className={encyclopediaPageClass}>
      <PageHeader
        breadcrumbs={[
          { label: 'TCG Encyclopedia', to: '/Encyclopedia' },
          { label: 'Magic', to: '/Encyclopedia/magic' },
          { label: 'Learn to Play', to: topic ? '/Encyclopedia/magic/learn' : undefined }
        ]}
        eyebrow={topic ? `Lesson ${topic.order}` : undefined}
        title={topic ? topic.title : 'Learn to Play'}
        subtitle={topic ? (topic.article?.introduction || topic.summary) : 'Start with the table basics, then move through turns, combat, responses, the stack, abilities, and first deck building.'}
      />
      <SectionShell className="py-6">
        {topic ? (
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <article className="min-w-0 max-w-full break-words">
              <LessonVisual visual={topic.visual} />
              <ArticleBody article={topic.article} />
              {relatedTopics.length > 0 && (
                <div className={`mt-8 border-t ${encyclopediaDividerClass} pt-5`}>
                  <h3 className={`text-sm font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Deeper Rules</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {relatedTopics.map((entry) => (
                      <Link key={entry.slug} to={entry.path} className="min-w-0 break-words border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-bold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-slate-900">
                        {entry.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <LessonNav previousTopic={previousTopic} nextTopic={nextTopic} />
              <SourceList sources={topic.sources.slice(0, 1)} className={`mt-8 border-t ${encyclopediaDividerClass} pt-5`} title="Official Rules Reference" />
            </article>
            <aside className={`h-fit border-y ${encyclopediaDividerClass} py-5`}>
              <h2 className="text-lg font-black tracking-tight text-white">Course Progress</h2>
              <div className={`mt-4 divide-y ${encyclopediaDividerClass}`}>
                {lessons.map((lesson) => (
                  <Link key={lesson.slug} to={lesson.path} className={`grid grid-cols-[30px_minmax(0,1fr)] gap-3 py-3 text-sm transition hover:bg-slate-900/62 ${lesson.slug === topic.slug ? 'text-cyan-100' : 'text-slate-400'}`}>
                    <span className="font-black text-slate-500">{lesson.order}</span>
                    <span className="font-bold">{lesson.title}</span>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <div className={`divide-y border-y ${encyclopediaDividerClass}`}>
                {lessons.map((lesson) => (
                  <Link key={lesson.slug} to={lesson.path} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-start gap-3 py-4 transition hover:bg-slate-900/62">
                    <span className="text-sm font-black text-slate-500">{lesson.order}</span>
                    <span className="min-w-0">
                      <span className="block font-black text-slate-100">{lesson.title}</span>
                      <span className={`mt-1 block text-sm leading-6 ${encyclopediaSoftTextClass}`}>{lesson.summary}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 text-slate-500" />
                  </Link>
                ))}
              </div>
            </div>
            <aside className={`h-fit border-y ${encyclopediaDividerClass} py-5`}>
              <h2 className="text-lg font-black tracking-tight text-white">Course Shape</h2>
              <p className={`mt-2 text-sm leading-6 ${encyclopediaSoftTextClass}`}>{lessons.length} lessons with real-card examples for card anatomy, mana, combat, responses, triggers, and Commander color identity.</p>
              {lessons[0] && (
                <Link to={lessons[0].path}>
                  <Button className={`mt-5 w-full ${encyclopediaPrimaryButtonClass}`}>Start lesson 1</Button>
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
    <main className={encyclopediaPageClass}>
      <PageHeader
        breadcrumbs={[
          { label: 'TCG Encyclopedia', to: '/Encyclopedia' },
          { label: game.shortLabel || game.label, to: `/Encyclopedia/${game.routeKey}` },
          { label: isMagic ? categoryLabel : 'Rules', to: topic ? `/Encyclopedia/${game.routeKey}/rules` : undefined }
        ]}
        eyebrow={topic ? 'Rules topic' : undefined}
        title={topic ? topic.title : (isMagic ? 'Game Rules' : 'Rules / How to Play')}
        subtitle={topic ? (article?.introduction || topic.summary) : undefined}
      />
      <SectionShell className="grid min-w-0 gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 max-w-full break-words">
          {topic ? (
            <>
              {Array.isArray(article?.terminology) && article.terminology.length > 0 && (
                <div className="mt-5 flex max-w-[min(22rem,calc(100vw-2rem))] flex-wrap gap-2 overflow-hidden sm:max-w-full">
                  {article.terminology.map((term) => (
                    <span key={term} className="border border-cyan-300/30 bg-cyan-200/10 px-2.5 py-1 text-xs font-bold text-cyan-100">{term}</span>
                  ))}
                </div>
              )}
              <LessonVisual visual={topic.visual} />
              <ArticleBody article={article} />
              {relatedTopics.length > 0 && (
                <div className={`mt-8 border-t ${encyclopediaDividerClass} pt-5`}>
                  <h3 className={`text-sm font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Related Topics</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {relatedTopics.map((entry) => (
                      <Link key={entry.slug} to={entry.path} className="min-w-0 break-words border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-bold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-slate-900">
                        {entry.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <SourceList sources={topic.sources.slice(0, 1)} className={`mt-8 border-t ${encyclopediaDividerClass} pt-5`} title={isMagic ? 'Official Rules Reference' : 'Sources'} />
            </>
          ) : (
            <>
              {isMagic ? (
                <>
                  <label className={`flex min-w-0 items-center gap-2 px-3 py-2 ${encyclopediaControlClass}`}>
                    <Search className="h-4 w-4 text-slate-500" />
                    <input
                      value={rulesQuery}
                      onChange={(event) => updateBrowseParams(searchParams, setSearchParams, { q: event.target.value })}
                      placeholder="Search topic, alias, keyword, or mechanic"
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                  </label>
                  <div className="mt-6 space-y-6">
                    {referenceGroups.map((group) => (
                      <section key={group.key} className={`border-y ${encyclopediaDividerClass} py-3`}>
                        <h3 className={`text-sm font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>{MAGIC_REFERENCE_GROUP_LABELS[group.key] || fieldLabel(group.key)}</h3>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {group.entries.map((entry) => (
                            <Link key={entry.slug} to={entry.path} className={`min-w-0 break-words px-3 py-2 text-sm font-bold transition hover:border-cyan-300/60 hover:bg-slate-900/70 ${encyclopediaPanelClass}`}>
                              <span className="block text-slate-100">{entry.title}</span>
                              <span className={`mt-1 line-clamp-2 block text-xs font-semibold leading-5 ${encyclopediaMutedTextClass}`}>{entry.summary}</span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    ))}
                    {referenceGroups.length === 0 && (
                      <div className={`border-y ${encyclopediaDividerClass} py-10 text-sm font-semibold ${encyclopediaMutedTextClass}`}>No rules topics match that search.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className={`mt-5 divide-y border-y ${encyclopediaDividerClass}`}>
                  {topics.map((entry) => (
                    <Link key={entry.slug} to={entry.path} className="block py-4 transition hover:bg-slate-900/62">
                      <p className="font-bold text-slate-100">{entry.title}</p>
                      <p className={`mt-1 text-sm leading-6 ${encyclopediaSoftTextClass}`}>{entry.summary}</p>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <aside className={`h-fit border-y ${encyclopediaDividerClass} py-5`}>
          <h2 className="text-lg font-black tracking-tight text-white">{game.shortLabel || game.label} Rules</h2>
          <p className={`mt-2 text-sm leading-6 ${encyclopediaSoftTextClass}`}>Browse learning topics for play, deck construction, and common table interactions.</p>
          {isMagic && (
            <div className={`mt-5 space-y-4 border-t ${encyclopediaDividerClass} pt-4`}>
              <div>
                <h3 className={`text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Learn Path</h3>
                <Link to="/Encyclopedia/magic/learn" className="mt-1 block text-sm font-semibold text-cyan-100 hover:text-cyan-200">{learnLessons.length} sequential lessons</Link>
              </div>
              <div>
                <h3 className={`text-xs font-black uppercase tracking-[0.16em] ${encyclopediaMutedTextClass}`}>Reference</h3>
                <p className={`mt-1 text-sm font-semibold ${encyclopediaSoftTextClass}`}>{referenceGroups.reduce((sum, group) => sum + group.entries.length, 0)} searchable topics</p>
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
