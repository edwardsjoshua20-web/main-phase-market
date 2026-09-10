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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolute), `${relativePath} is missing`);
  if (!fs.existsSync(absolute)) return [];
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

const routeFile = fs.readFileSync(path.join(repoRoot, 'src/App.jsx'), 'utf8');
for (const route of requiredRoutes) {
  assert(routeFile.includes(`path="${route}"`) || routeFile.includes(`path='${route}'`), `Route missing: ${route}`);
}

const pageFile = fs.readFileSync(path.join(repoRoot, 'src/pages/Encyclopedia.jsx'), 'utf8');
assert(pageFile.includes('gameKnowledgeOwner'), 'Encyclopedia page must consume gameKnowledgeOwner');
assert(pageFile.includes('createPageUrl') && pageFile.includes('Shop'), 'Encyclopedia must expose Shop/listing paths without owning commerce');

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
    assert(Number(manifest.imported_cards || manifest.total_cards_seen || 0) > 0, 'magic has no manifest card count');
    assert(Object.keys(liteManifest.buckets || {}).length > 0, 'magic has no search-lite buckets');
  } else {
    const cards = readJson(`public/data/${game.assetGame}/cards.json`);
    assert(Array.isArray(cards) && cards.length > 0, `${game.id} has no public cards`);
  }

  for (const topic of ENCYCLOPEDIA_RULE_TOPICS[game.id] || []) {
    assert(topic.slug && topic.title && topic.summary, `${game.id} has incomplete rules topic metadata`);
    assert(Array.isArray(topic.sourceLabels) && topic.sourceLabels.length > 0, `${game.id}:${topic.slug} missing source labels`);
    const knownLabels = new Set(game.sourceRefs.map((source) => source.label));
    for (const label of topic.sourceLabels) {
      assert(knownLabels.has(label), `${game.id}:${topic.slug} references unknown source ${label}`);
    }
  }
}

assert(ENCYCLOPEDIA_GAMES.length === 7, `Expected 7 games, found ${ENCYCLOPEDIA_GAMES.length}`);

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
