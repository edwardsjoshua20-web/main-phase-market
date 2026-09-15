import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENCYCLOPEDIA_GAMES, ENCYCLOPEDIA_RULE_TOPICS, MAGIC_KEYWORD_GLOSSARY, MAGIC_TEACHING_CARD_ORACLE_IDS } from '../src/services/knowledge/encyclopediaData.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredRoutes = [
  '/Encyclopedia',
  '/Encyclopedia/:game',
  '/Encyclopedia/:game/sets',
  '/Encyclopedia/:game/sets/:setSlug',
  '/Encyclopedia/:game/sets/:setSlug/cards/:cardId',
  '/Encyclopedia/:game/learn',
  '/Encyclopedia/:game/learn/:topicSlug',
  '/Encyclopedia/:game/rules',
  '/Encyclopedia/:game/rules/:topicSlug'
];

const failures = [];
const MTG_REPRESENTATIVE_SETS = [
  { code: 'LEA', slug: 'limited-edition-alpha', minCards: 250 },
  { code: 'LEB', slug: 'limited-edition-beta', minCards: 250 },
  { code: '2ED', slug: 'unlimited-edition', minCards: 250 },
  { code: 'ARN', slug: 'arabian-nights', minCards: 70 },
  { code: 'ATQ', slug: 'antiquities', minCards: 70 },
  { code: 'INV', slug: 'invasion', minCards: 250 },
  { code: 'RTR', slug: 'return-to-ravnica', minCards: 250 },
  { code: 'FDN', slug: 'foundations', minCards: 250 },
  { code: 'CMM', slug: 'commander-masters', minCards: 250 },
  { code: 'SLD', slug: 'secret-lair-drop', minCards: 100 }
];
const MTG_DEDUPE_SAMPLE_SETS = [
  { code: 'FIN', slug: 'final-fantasy' },
  { code: 'TRK', slug: 'star-trek' },
  { code: 'TDM', slug: 'tarkir-dragonstorm' }
];
const SET_ICON_EXPECTATIONS = Object.freeze({
  magic: { min: 20, source: 'Scryfall set_icon_svg_uri' },
  pokemon: { min: 20, source: 'PokemonTCG.io images.symbol/images.logo' },
  yugioh: { min: 20, source: 'YGOPRODeck set_image' },
  flesh_and_blood: { min: 20, source: 'FAB set_logo' },
  lorcana: { min: 0, source: 'Lorcast set export currently has no per-set symbol/logo' },
  onepiece: { min: 0, source: 'One Piece extracted set export currently has no per-set symbol/logo' },
  starwars: { min: 0, source: 'SWU set export currently has no per-set symbol/logo' }
});

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolute), `${relativePath} is missing`);
  if (!fs.existsSync(absolute)) return [];
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function compareCollector(left = '', right = '') {
  return String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function isCollectorOrdered(cards = []) {
  for (let index = 1; index < cards.length; index += 1) {
    if (compareCollector(cards[index - 1].collector_number, cards[index].collector_number) > 0) return false;
  }
  return true;
}

function hasUniqueGallerySlots(cards = []) {
  const seen = new Set();
  for (const card of cards) {
    const key = `${card.set_code || ''}:${card.collector_number || card.card_number || card.number || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function rulesArticleText(topic = {}) {
  return [
    topic.summary,
    topic.article?.introduction,
    ...(topic.article?.sections || []).flatMap((section) => [section.heading, ...(section.body || []), section.example || '']),
    ...(topic.article?.terminology || [])
  ].join(' ');
}

function iconSourceForSet(set = {}) {
  if (set.icon_svg_uri || set.set_icon_svg_uri || set.images?.symbol || set.images?.icon) return 'symbol';
  if (set.images?.logo || set.logo || set.set_logo) return 'logo';
  if (set.set_image || set.set_image_url || set.image_url) return 'product';
  return 'fallback';
}

function iconUrlForSet(set = {}) {
  return set.icon_svg_uri
    || set.set_icon_svg_uri
    || set.images?.symbol
    || set.images?.icon
    || set.images?.logo
    || set.logo
    || set.set_logo
    || set.set_image
    || set.set_image_url
    || set.image_url
    || '';
}

function assertTopicIncludes(topic, words = []) {
  assert(topic, `Magic representative topic is missing`);
  const text = rulesArticleText(topic).toLowerCase();
  for (const word of words) {
    assert(text.includes(String(word).toLowerCase()), `Magic topic ${topic?.slug || 'unknown'} missing representative content: ${word}`);
  }
}

function assertTopicCoverage(slug, required = []) {
  const topic = (ENCYCLOPEDIA_RULE_TOPICS.magic || []).find((entry) => entry.slug === slug);
  assert(topic, `Magic topic ${slug} is missing`);
  assertTopicIncludes(topic, required);
  assert(Array.isArray(topic?.article?.sections) && topic.article.sections.length >= 4, `Magic topic ${slug} needs at least four meaningful sections`);
  assert((topic?.article?.sections || []).every((section) => section.heading && Array.isArray(section.body) && section.body.length >= 2), `Magic topic ${slug} has shallow section content`);
}

function textForTopic(slug) {
  const topic = (ENCYCLOPEDIA_RULE_TOPICS.magic || []).find((entry) => entry.slug === slug);
  return rulesArticleText(topic).toLowerCase();
}

const routeFile = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8');
for (const route of requiredRoutes) {
  assert(routeFile.includes(`path="${route}"`) || routeFile.includes(`path='${route}'`), `Route missing: ${route}`);
}

const pageFile = fs.readFileSync(path.join(repoRoot, 'src/pages/Encyclopedia.jsx'), 'utf8');
const searchOwnerFile = fs.readFileSync(path.join(repoRoot, 'src/services/search/searchOwner.js'), 'utf8');
const gameKnowledgeOwnerFile = fs.readFileSync(path.join(repoRoot, 'src/services/knowledge/gameKnowledgeOwner.js'), 'utf8');
assert(pageFile.includes('gameKnowledgeOwner'), 'Encyclopedia page must consume gameKnowledgeOwner');
assert(pageFile.includes('createPageUrl') && pageFile.includes('Shop'), 'Encyclopedia must expose Shop/listing paths without owning commerce');
assert(pageFile.includes('filterOptions') && pageFile.includes('Show more cards'), 'Encyclopedia set detail must expose set search, filters, and capped rendering');
assert(!pageFile.includes('View all sets'), 'Game landings must not gate the set browser behind View all sets');
assert(!pageFile.includes('function CardDetailPage'), 'Duplicate Encyclopedia card detail page must not be active');
assert(pageFile.includes('EncyclopediaCardRedirect') && pageFile.includes('<Navigate'), 'Legacy Encyclopedia card URLs must redirect to canonical CardDetail');
assert(pageFile.includes('returnTo') && pageFile.includes('returnLabel'), 'Encyclopedia card routes must preserve return context');
assert(pageFile.includes('function GameLanding') && pageFile.includes('HUB_CHOICES'), 'Game landings must render the shared three-destination hub');
assert(pageFile.includes('Sets & Cards') && pageFile.includes('Learn to Play') && pageFile.includes('Game Rules'), 'Game hubs must expose Sets & Cards, Learn to Play, and Game Rules choices');
assert(pageFile.includes('`/Encyclopedia/${game.routeKey}/${choice.section}`'), 'Game hub choices must use existing game route keys');
assert(pageFile.includes('function BreadcrumbTrail') && pageFile.includes('aria-label="Breadcrumb"'), 'Encyclopedia pages must render compact accessible breadcrumbs');
assert(pageFile.includes('BreadcrumbTrail breadcrumbs={encyclopediaBreadcrumbs(game)}'), 'Game hubs must provide a breadcrumb back to the main Encyclopedia landing');
assert(pageFile.includes('function encyclopediaBreadcrumbs') && pageFile.includes("to: entries.length > 0 ? gameHubPath(game) : undefined"), 'Encyclopedia breadcrumbs must keep the current page segment non-clickable');
assert(pageFile.includes("...(topic ? [{ label: topic.title }] : [])"), 'Learn and Rules article breadcrumbs must include the current topic as the final segment');
assert(pageFile.includes("{ label: detail.name }"), 'Set detail breadcrumbs must include the current set as the final segment');
assert(pageFile.includes('function LearnPage'), 'Magic Learn to Play route must render a dedicated course page');
assert(pageFile.includes('LessonVisual') && pageFile.includes('getMagicTeachingCards'), 'Magic lessons must render structured real-card teaching visuals');
assert(pageFile.includes('searchRulesTopics') && pageFile.includes('Search topic, alias, keyword, or mechanic'), 'Magic Game Rules must expose topic/alias/mechanic search');
assert(pageFile.includes('Previous lesson') && pageFile.includes('Next lesson'), 'Magic learn articles must render previous/next lesson navigation');
assert(pageFile.includes('Official Rules Reference'), 'Magic articles must use restrained official reference labeling');
assert(pageFile.includes('function WhatIsMagicLesson') && pageFile.includes("topic?.slug === 'learn-what-is-magic'"), 'What Is Magic must use the focused prototype lesson experience');
assert(pageFile.includes('function LessonProgress') && pageFile.includes('Lesson {current} of {total}'), 'What Is Magic prototype must show compact lesson progress');
assert(pageFile.includes('function CardCalloutExample') && pageFile.includes('cardCalloutValue'), 'What Is Magic prototype must render a catalog-backed visual card callout area');
assert(pageFile.includes('function QuickCheck') && pageFile.includes('Battlefield'), 'What Is Magic prototype must render the interactive Quick Check');
assert(pageFile.includes('What It Is') && pageFile.includes('What You Do') && pageFile.includes('How You Win') && pageFile.includes('Quick Check'), 'What Is Magic prototype must use the required focused section labels');
assert(!pageFile.includes('Authority Boundary'), 'Rules page must not render the internal authority-boundary box');
assert(!/catalog-backed|Search owner|source-attributed summaries|Complete local card|MainPhase Search owner/i.test(pageFile), 'Public Encyclopedia UI contains internal owner/catalog wording');
assert(searchOwnerFile.includes('icon_url') && searchOwnerFile.includes('logo_url') && searchOwnerFile.includes('product_image_url') && searchOwnerFile.includes('icon_source'), 'Search owner must expose canonical set icon/logo/product image metadata');
assert(searchOwnerFile.includes('set.set_image') && searchOwnerFile.includes('set.set_logo'), 'Search owner must consume set product/logo fields from source set metadata');
assert(gameKnowledgeOwnerFile.includes('iconUrl') && gameKnowledgeOwnerFile.includes('logoUrl') && gameKnowledgeOwnerFile.includes('productImageUrl') && gameKnowledgeOwnerFile.includes('iconSource'), 'Game knowledge owner must preserve set icon metadata for Encyclopedia consumers');
assert(pageFile.includes('SET_ROW_VISUAL_ENABLED_GAMES') && pageFile.includes("'magic'") && pageFile.includes("'pokemon'"), 'Set rows must enable visual icons only for Magic and Pokemon');
assert(pageFile.includes('shouldRenderSetVisual') && pageFile.includes('SET_ROW_VISUAL_ENABLED_GAMES.has(set.game)'), 'Shared set-row renderer must allow the visual column by normalized game id');
assert(pageFile.includes('<img src={set.imageUrl}') && pageFile.includes("grid-cols-[46px_minmax(0,1fr)_auto]"), 'Shared set-row renderer must preserve set visuals for non-suppressed games');
assert(pageFile.includes("grid-cols-[minmax(0,1fr)_auto]"), 'Shared set-row renderer must remove the icon gutter when a set visual is suppressed or unavailable');
assert(!pageFile.includes('displayCode') && !pageFile.includes('text-[0.62rem]'), 'Set rows must not render code-badge fallbacks');
assert(!pageFile.includes('<Layers'), 'Set rows must not fall back to the generic stacked-layers icon');
assert(gameKnowledgeOwnerFile.includes('setRowVisualForGame') && gameKnowledgeOwnerFile.includes("gameMeta.id === 'magic'") && gameKnowledgeOwnerFile.includes("gameMeta.id === 'pokemon'"), 'Game knowledge owner must centralize the set-row visual policy for Magic and Pokemon only');
assert(gameKnowledgeOwnerFile.includes('searchMagicTeachingCards') && gameKnowledgeOwnerFile.includes('searchOwner.getMagicTeachingCardByName'), 'Magic lesson examples must resolve fallback teaching cards through Search Owner');
assert(searchOwnerFile.includes('getMagicTeachingCardByName') && searchOwnerFile.includes('getMtgTeachingCardByName'), 'Search Owner must expose the narrow MTG teaching-card catalog helper');

const cardDetailFile = fs.readFileSync(path.join(repoRoot, 'src/pages/CardDetail.jsx'), 'utf8');
assert(cardDetailFile.includes('getPreferredBackLink') && cardDetailFile.includes('returnTo') && cardDetailFile.includes('returnLabel'), 'Canonical CardDetail must honor Encyclopedia return context');

const encyclopediaManifest = readJson('public/data/encyclopedia/manifest.json');
assert(encyclopediaManifest?.games, 'Encyclopedia public data manifest is missing games');

const ids = new Set();
const routeKeys = new Set();

for (const game of ENCYCLOPEDIA_GAMES) {
  assert(game.id && !ids.has(game.id), `Duplicate or missing game id: ${game.id}`);
  assert(game.routeKey && !routeKeys.has(game.routeKey), `Duplicate or missing route key for ${game.id}`);
  assert(game.searchGame, `${game.id} missing searchGame`);
  assert(game.assetGame, `${game.id} missing assetGame`);
  assert(game.label && game.logoSrc, `${game.id} missing presentation metadata`);
  assert(Array.isArray(game.sourceRefs) && game.sourceRefs.length > 0, `${game.id} missing sourceRefs`);
  assert((ENCYCLOPEDIA_RULE_TOPICS[game.id] || []).length > 0, `${game.id} missing rules topics`);
  ids.add(game.id);
  routeKeys.add(game.routeKey);

  const sets = readJson(`public/data/${game.assetGame}/sets.json`);
  const iconExpectation = SET_ICON_EXPECTATIONS[game.id];
  const setsWithIconSource = sets.filter((set) => iconUrlForSet(set));
  assert(iconExpectation, `${game.id} missing set icon expectation`);
  assert(setsWithIconSource.length >= iconExpectation.min, `${game.id} should expose ${iconExpectation.source}; found ${setsWithIconSource.length} source icons`);
  if (iconExpectation.min > 0) {
    assert(setsWithIconSource.some((set) => iconSourceForSet(set) !== 'fallback'), `${game.id} source icon fields are present but not classifiable`);
  } else {
    assert(setsWithIconSource.length === 0, `${game.id} unexpectedly has source icons; update renderer certification to consume them instead of treating fallback as expected`);
  }
  assert(Array.isArray(sets) && sets.length > 0, `${game.id} has no public sets`);
  if (game.id === 'magic') {
    const manifest = readJson('public/data/mtg/manifest.json');
    const liteManifest = readJson('public/data/mtg/search-lite-manifest.json');
    const printingManifest = readJson('public/data/mtg/printing-index-manifest.json');
    const magicManifestEntry = encyclopediaManifest.games.magic;
    assert(Number(manifest.imported_cards || manifest.total_cards_seen || 0) > 0, 'magic has no manifest card count');
    assert(Object.keys(liteManifest.buckets || {}).length > 0, 'magic has no search-lite buckets');
    assert(Object.keys(printingManifest.shards || {}).length > 0, 'magic has no printing-index shards');
    assert(magicManifestEntry, 'magic missing encyclopedia generated manifest entry');
    assert(Number(magicManifestEntry.setCount || 0) > 0, 'magic has no encyclopedia set shards');
    assert(Number(magicManifestEntry.encyclopediaCardCount || 0) > 0, 'magic has no encyclopedia card rows');
    for (const expectedSet of MTG_REPRESENTATIVE_SETS) {
      const shard = readJson(`public/data/encyclopedia/magic/sets/${expectedSet.slug}.json`);
      assert(shard?.game === 'magic', `magic:${expectedSet.code} sample shard has wrong game`);
      assert(shard?.set?.code === expectedSet.code, `magic:${expectedSet.code} shard code mismatch`);
      assert(Array.isArray(shard?.cards), `magic:${expectedSet.code} shard has no cards array`);
      const cards = Array.isArray(shard?.cards) ? shard.cards : [];
      assert(cards.length >= expectedSet.minCards, `magic:${expectedSet.code} shard is incomplete: ${cards.length} cards`);
      assert(cards.every((card) => card.id && card.name && card.card_number && card.set_code === expectedSet.code), `magic:${expectedSet.code} shard has incomplete card identity`);
      assert(cards.every((card) => card.encyclopediaCard === true), `magic:${expectedSet.code} shard cards must be marked as encyclopedia cards`);
      assert(cards.some((card) => card.image_url), `magic:${expectedSet.code} shard has no card images`);
      assert(isCollectorOrdered(cards), `magic:${expectedSet.code} shard is not in collector order`);
      assert(hasUniqueGallerySlots(cards), `magic:${expectedSet.code} shard has duplicate gallery slots`);
      assert(cards.some((card) => card.representativeLanguage === 'en' || card.raw?.lang === 'en'), `magic:${expectedSet.code} shard has no English representative cards`);
    }
    for (const expectedSet of MTG_DEDUPE_SAMPLE_SETS) {
      const shard = readJson(`public/data/encyclopedia/magic/sets/${expectedSet.slug}.json`);
      const cards = Array.isArray(shard?.cards) ? shard.cards : [];
      assert(shard?.set?.code === expectedSet.code, `magic:${expectedSet.code} dedupe sample shard code mismatch`);
      assert(cards.length > 0, `magic:${expectedSet.code} dedupe sample has no cards`);
      assert(hasUniqueGallerySlots(cards), `magic:${expectedSet.code} dedupe sample has duplicate gallery slots`);
      assert(cards.every((card) => Number(card.printingCount || card.raw?.galleryPrintingCount || 1) >= 1), `magic:${expectedSet.code} dedupe sample lacks source printing counts`);
    }
  } else {
    const cards = readJson(`public/data/${game.assetGame}/cards.json`);
    assert(Array.isArray(cards) && cards.length > 0, `${game.id} has no public cards`);

    const publicGameId = game.id === 'flesh_and_blood' ? 'fab' : game.id;
    const manifestEntry = encyclopediaManifest.games[publicGameId];
    assert(manifestEntry, `${game.id} missing encyclopedia generated manifest entry`);
    assert(Number(manifestEntry.setCount || 0) > 0, `${game.id} has no encyclopedia set shards`);
    assert(Number(manifestEntry.encyclopediaCardCount || 0) > 0, `${game.id} has no encyclopedia card rows`);
    assert(Number(manifestEntry.printingVariantCount || 0) >= Number(manifestEntry.encyclopediaCardCount || 0), `${game.id} variant count is inconsistent`);
    assert(manifestEntry.sample?.setSlug && manifestEntry.sample?.cardId, `${game.id} missing sample route data`);

    const sampleShard = readJson(`public/data/encyclopedia/${publicGameId}/sets/${manifestEntry.sample.setSlug}.json`);
    assert(sampleShard?.game === publicGameId, `${game.id} sample shard has wrong game`);
    assert(Array.isArray(sampleShard?.cards) && sampleShard.cards.length >= 5, `${game.id} sample shard must expose at least five ordered cards`);
    assert(sampleShard.cards.every((card) => card.id && card.name && card.card_number && card.set_code), `${game.id} sample shard has incomplete card identity`);
    assert(sampleShard.cards.every((card) => card.encyclopediaCard === true), `${game.id} sample shard cards must be marked as encyclopedia cards`);
    assert(sampleShard.cards.some((card) => Array.isArray(card.fields) && card.fields.length > 0), `${game.id} sample shard has no detail fields`);
    assert(sampleShard.cards.some((card) => card.image_url), `${game.id} sample shard has no images`);
  }

  if (game.id === 'magic') {
    const symbolSets = sets.filter((set) => set.set_code && (set.image_url || set.icon_svg_uri || set.set_icon_svg_uri));
    assert(symbolSets.length >= Math.min(20, sets.length), 'Magic sets must expose real set symbols from canonical set metadata');
    for (const expectedSet of ['LEA', 'ARN', 'FDN', 'CMM', 'SLD', 'TRK']) {
      const matchingSet = sets.find((set) => String(set.set_code || set.code || '').toUpperCase() === expectedSet);
      assert(matchingSet, `Magic set ${expectedSet} is missing from sets.json`);
      assert(iconUrlForSet(matchingSet), `Magic set ${expectedSet} must expose its real Scryfall set symbol`);
      assert(iconSourceForSet(matchingSet) === 'symbol', `Magic set ${expectedSet} must classify as a set symbol`);
    }
  }

  const gameTopics = ENCYCLOPEDIA_RULE_TOPICS[game.id] || [];
  const topicSlugs = new Set();
  for (const topic of gameTopics) {
    assert(!topicSlugs.has(topic.slug), `${game.id}:${topic.slug} has a duplicate slug`);
    topicSlugs.add(topic.slug);
    assert(topic.slug && topic.title && topic.summary, `${game.id} has incomplete rules topic metadata`);
    assert(topic.gameId && topic.sectionId && topic.topicId, `${game.id}:${topic.slug} missing structured topic IDs`);
    assert(Array.isArray(topic.officialTerms) && topic.officialTerms.length > 0, `${game.id}:${topic.slug} missing official terminology`);
    assert(Array.isArray(topic.sourceLabels) && topic.sourceLabels.length > 0, `${game.id}:${topic.slug} missing source labels`);
    const knownLabels = new Set(game.sourceRefs.map((source) => source.label));
    for (const label of topic.sourceLabels) {
      assert(knownLabels.has(label), `${game.id}:${topic.slug} references unknown source ${label}`);
    }
    assert(topic.article?.introduction && topic.article.introduction.split(/\s+/).length >= 24, `${game.id}:${topic.slug} has a thin rules introduction`);
    assert(Array.isArray(topic.article?.sections) && topic.article.sections.length >= 3, `${game.id}:${topic.slug} rules article is missing hierarchy`);
    const articleText = [
      topic.article?.introduction,
      ...(topic.article?.sections || []).flatMap((section) => [section.heading, ...(section.body || []), section.example || ''])
    ].join(' ');
    assert(articleText.split(/\s+/).filter(Boolean).length >= 110, `${game.id}:${topic.slug} rules article is too thin`);
    assert((topic.article?.sections || []).every((section) => section.heading && Array.isArray(section.body) && section.body.length >= 2), `${game.id}:${topic.slug} has malformed rule hierarchy`);
    if (game.id === 'magic') {
      for (const relatedSlug of topic.relatedTopics || []) {
        assert(gameTopics.some((entry) => entry.slug === relatedSlug), `${game.id}:${topic.slug} has broken related topic ${relatedSlug}`);
      }
      assert(topic.sourceMeta?.rulesVersion && topic.sourceMeta?.lastVerified, `magic:${topic.slug} missing official source metadata`);
      if (topic.category === 'learn') {
        assert(topic.learningTrack === 'learn', `magic:${topic.slug} learn topic missing learningTrack`);
        if (topic.order > 1) assert(topic.previousSlug && gameTopics.some((entry) => entry.slug === topic.previousSlug), `magic:${topic.slug} missing previous lesson`);
        if (topic.order < 17) assert(topic.nextSlug && gameTopics.some((entry) => entry.slug === topic.nextSlug), `magic:${topic.slug} missing next lesson`);
      }
      if (topic.category === 'reference') {
        assert(topic.referenceGroup, `magic:${topic.slug} reference topic missing reference group`);
      }
    }
  }
}

assert(ENCYCLOPEDIA_GAMES.length === 7, `Expected 7 games, found ${ENCYCLOPEDIA_GAMES.length}`);
const magicTopics = ENCYCLOPEDIA_RULE_TOPICS.magic || [];
const magicLearnTopics = magicTopics.filter((topic) => topic.category === 'learn');
const magicReferenceTopics = magicTopics.filter((topic) => topic.category === 'reference');
const expectedLearnSequence = [
  'learn-what-is-magic',
  'learn-what-you-need',
  'learn-understanding-a-card',
  'learn-mana-and-colors',
  'learn-card-types',
  'learn-setting-up',
  'learn-zones',
  'learn-starting-hand-and-mulligans',
  'learn-taking-your-turn',
  'learn-casting-spells',
  'learn-combat',
  'learn-instants-and-responses',
  'learn-stack',
  'learn-abilities-and-triggers',
  'learn-winning-and-losing',
  'learn-building-first-deck',
  'learn-where-to-go-next'
];
assert(magicLearnTopics.length >= 17, 'Magic Learn to Play hierarchy is incomplete');
assert(magicReferenceTopics.length >= 40, 'Magic Rules Reference hierarchy is incomplete');
assert(new Set(magicLearnTopics.map((topic) => topic.order)).size === magicLearnTopics.length, 'Magic Learn to Play order values must be unique');
assert(expectedLearnSequence.every((slug, index) => magicLearnTopics.find((topic) => topic.slug === slug && topic.order === index + 1)), 'Magic Learn to Play sequence must match the required beginner journey');
assert(magicLearnTopics.some((topic) => topic.slug === 'learn-instants-and-responses'), 'Magic Learn to Play must split Instants and Responses into its own lesson');
assert(magicLearnTopics.some((topic) => topic.slug === 'learn-stack'), 'Magic Learn to Play must split The Stack into its own lesson');
assert(!magicLearnTopics.some((topic) => topic.slug === 'learn-stack-and-responses'), 'Magic Learn to Play must not keep the obsolete combined stack lesson');
const expectedVisualTypes = new Set(['card-anatomy', 'mana-payment', 'combat', 'stack', 'trigger', 'turn-timeline']);
for (const type of expectedVisualTypes) {
  assert(magicLearnTopics.some((topic) => topic.visual?.type === type), `Magic Learn to Play missing visual type: ${type}`);
}
const teachingOracleIds = new Set(Object.values(MAGIC_TEACHING_CARD_ORACLE_IDS));
for (const topic of magicTopics) {
  for (const oracleId of topic.visual?.oracleIds || []) {
    assert(teachingOracleIds.has(oracleId), `Magic visual ${topic.slug} references an unmanaged teaching oracle id`);
  }
  if (topic.visual?.type === 'card-anatomy') {
    const labels = (topic.visual.callouts || []).map((entry) => String(entry.label || entry).toLowerCase()).join(' ');
    for (const required of ['name', 'mana cost', 'type line', 'rules text', 'power / toughness', 'collector info']) {
      assert(labels.includes(required), `Magic card anatomy visual missing ${required}`);
    }
  }
  if (topic.visual?.type === 'turn-timeline') {
    const labels = (topic.visual.phases || []).map((entry) => `${entry.label} ${entry.detail}`.toLowerCase()).join(' ');
    for (const required of ['beginning phase', 'untap', 'upkeep', 'draw', 'first main', 'combat', 'second main', 'ending phase', 'end step', 'cleanup']) {
      assert(labels.includes(required), `Magic turn timeline visual missing ${required}`);
    }
  }
  if (topic.visual?.type === 'mana-payment') {
    const visualText = JSON.stringify(topic.visual).toLowerCase();
    for (const required of ['land', 'tap', 'colored mana', 'generic', 'colorless', '{1}{u}{u}']) {
      assert(visualText.includes(required), `Magic mana visual missing ${required}`);
    }
  }
}
assert(MAGIC_KEYWORD_GLOSSARY.length >= 10, 'Magic keyword glossary seed is incomplete');
assert(MAGIC_KEYWORD_GLOSSARY.every((entry) => entry.name && entry.category && entry.concise && Array.isArray(entry.relatedMechanics) && entry.sourceMeta?.lastVerified), 'Magic keyword glossary entries must be structured');
const requiredPracticalConcepts = [
  ['learn-what-you-need', ['deck', 'life total', 'table space']],
  ['learn-zones', ['library', 'hand', 'battlefield', 'graveyard', 'exile']],
  ['learn-setting-up', ['shuffle', 'opening seven', 'mulligan', '20 life', 'starting player', 'skips the draw']],
  ['learn-taking-your-turn', ['untap', 'upkeep', 'draw', 'first main', 'declare attackers', 'declare blockers', 'end step', 'cleanup', 'priority']],
  ['learn-mana-and-colors', ['tap', 'colored mana', 'generic', 'colorless', 'mana pool']],
  ['learn-casting-spells', ['playing a land', 'special action', 'casting a spell', 'pay costs', 'stack', 'resolve']],
  ['learn-card-types', ['land', 'creature', 'instant', 'sorcery', 'permanent']],
  ['learn-combat', ['summoning sickness', 'blocked', 'combat damage', 'lethal', 'state-based actions']],
  ['learn-instants-and-responses', ['respond', 'priority', 'resolves', 'does not use the stack']],
  ['learn-stack', ['top object resolves first', 'priority', 'does not use the stack']],
  ['learn-abilities-and-triggers', ['static ability', 'activated ability', 'triggered ability', 'mana ability', 'target']],
  ['learn-winning-and-losing', ['0 or less life', 'empty library', 'poison counters', 'concede']]
];
for (const [slug, concepts] of requiredPracticalConcepts) {
  assertTopicCoverage(slug, concepts);
  assert(textForTopic(slug).includes('what you do at the table'), `Magic lesson ${slug} must teach physical table actions`);
}
assertTopicCoverage('reference-priority', ['active player', 'nonactive player', 'pass priority', 'resolves', 'priority again', 'shortcut']);
assertTopicCoverage('reference-stack', ['last-in', 'first-out', 'top object', 'activated', 'triggered', 'playing a land', 'one at a time']);
assertTopicCoverage('reference-state-based-actions', ['do not use the stack', 'checked', 'zero life', 'lethal damage', 'checks again', 'trigger']);
assertTopicCoverage('reference-layers', ['continuous effects', 'timestamp', 'dependency', 'power and toughness', 'sublayers']);
assertTopicCoverage('reference-triggered-abilities', ['when', 'whenever', 'at', 'stack', 'intervening if']);
assertTopicCoverage('reference-replacement-effects', ['instead', 'prevent', 'before the event', 'trigger']);
assertTopicCoverage('reference-continuous-effects', ['duration', 'static ability', 'layers', 'timestamp']);
assertTopicCoverage('reference-combat-damage', ['unblocked', 'blocked', 'lethal damage', 'trample', 'deathtouch']);
assertTopicCoverage('reference-first-strike-double-strike', ['earlier combat damage step', 'regular combat damage step', 'double strike']);
assertTopicCoverage('reference-command-zone', ['starts the game', 'graveyard', 'exile', 'state-based actions']);
assertTopicCoverage('reference-commander-tax', ['additional cost', 'two generic', 'alternative cost', 'partner']);
assertTopicCoverage('reference-commander-damage', ['21', 'combat damage', 'same commander', 'track']);
assertTopicCoverage('reference-commander-brackets-game-changers', ['pregame', 'Game Changers', 'Bracket', 'table expectations']);
assertTopicCoverage('reference-deck-construction', ['minimum', 'sideboard', 'copy limits', 'basic-land']);
assertTopicCoverage('reference-color-identity', ['mana symbols', 'rules text', 'color indicator', 'reminder text', 'double-faced', 'commander deck', 'green mana symbol']);
assert((ENCYCLOPEDIA_RULE_TOPICS.pokemon || []).length >= 15, 'Pokemon rules hierarchy is incomplete');
assert((ENCYCLOPEDIA_RULE_TOPICS.yugioh || []).length >= 15, 'Yu-Gi-Oh rules hierarchy is incomplete');
assert((ENCYCLOPEDIA_RULE_TOPICS.lorcana || []).length >= 13, 'Lorcana rules hierarchy is incomplete');
assert((ENCYCLOPEDIA_RULE_TOPICS.flesh_and_blood || []).length >= 15, 'FAB rules hierarchy is incomplete');
assert((ENCYCLOPEDIA_RULE_TOPICS.onepiece || []).length >= 13, 'One Piece rules hierarchy is incomplete');
assert((ENCYCLOPEDIA_RULE_TOPICS.starwars || []).length >= 14, 'SWU rules hierarchy is incomplete');

if (failures.length) {
  console.error('Encyclopedia certification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Encyclopedia certification passed.');
for (const game of ENCYCLOPEDIA_GAMES) {
  const sets = readJson(`public/data/${game.assetGame}/sets.json`);
  const cardCount = game.id === 'magic'
    ? Number(readJson('public/data/mtg/manifest.json').imported_cards || 0)
    : readJson(`public/data/${game.assetGame}/cards.json`).length;
  console.log(`- ${game.label}: ${sets.length} sets, ${cardCount} catalog cards, ${(ENCYCLOPEDIA_RULE_TOPICS[game.id] || []).length} rule topics`);
}
