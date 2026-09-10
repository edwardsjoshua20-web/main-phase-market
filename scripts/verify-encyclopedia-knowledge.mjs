import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENCYCLOPEDIA_GAMES, ENCYCLOPEDIA_RULE_TOPICS } from '../src/services/knowledge/encyclopediaData.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredRoutes = [
  '/Encyclopedia',
  '/Encyclopedia/:game',
  '/Encyclopedia/:game/sets',
  '/Encyclopedia/:game/sets/:setSlug',
  '/Encyclopedia/:game/sets/:setSlug/cards/:cardId',
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

const routeFile = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8');
for (const route of requiredRoutes) {
  assert(routeFile.includes(`path="${route}"`) || routeFile.includes(`path='${route}'`), `Route missing: ${route}`);
}

const pageFile = fs.readFileSync(path.join(repoRoot, 'src/pages/Encyclopedia.jsx'), 'utf8');
assert(pageFile.includes('gameKnowledgeOwner'), 'Encyclopedia page must consume gameKnowledgeOwner');
assert(pageFile.includes('createPageUrl') && pageFile.includes('Shop'), 'Encyclopedia must expose Shop/listing paths without owning commerce');
assert(pageFile.includes('filterOptions') && pageFile.includes('Show more cards'), 'Encyclopedia set detail must expose set search, filters, and capped rendering');

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

  for (const topic of ENCYCLOPEDIA_RULE_TOPICS[game.id] || []) {
    assert(topic.slug && topic.title && topic.summary, `${game.id} has incomplete rules topic metadata`);
    assert(topic.gameId && topic.sectionId && topic.topicId, `${game.id}:${topic.slug} missing structured topic IDs`);
    assert(Array.isArray(topic.officialTerms) && topic.officialTerms.length > 0, `${game.id}:${topic.slug} missing official terminology`);
    assert(Array.isArray(topic.sourceLabels) && topic.sourceLabels.length > 0, `${game.id}:${topic.slug} missing source labels`);
    const knownLabels = new Set(game.sourceRefs.map((source) => source.label));
    for (const label of topic.sourceLabels) {
      assert(knownLabels.has(label), `${game.id}:${topic.slug} references unknown source ${label}`);
    }
  }
}

assert(ENCYCLOPEDIA_GAMES.length === 7, `Expected 7 games, found ${ENCYCLOPEDIA_GAMES.length}`);
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
