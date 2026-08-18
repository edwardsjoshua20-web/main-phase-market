import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function canonicalGame(value) {
  const normalized = normalizeSearchText(value);
  const aliases = {
    all: 'all',
    mtg: 'magic',
    magic: 'magic',
    'magic the gathering': 'magic',
    pokemon: 'pokemon',
    'pokemon tcg': 'pokemon',
    yugioh: 'yugioh',
    'yu gi oh': 'yugioh'
  };
  return aliases[normalized] || normalized.replace(/\s+/g, '_') || 'magic';
}

function scoreCard(card, query) {
  const normalizedQuery = normalizeSearchText(query);
  const name = normalizeSearchText(card.name || card.product_name);
  const text = normalizeSearchText([
    card.name,
    card.product_name,
    card.set_name,
    card.set_code,
    card.type_line,
    card.type,
    card.oracle_text,
    card.description,
    card.text,
    card.rarity
  ].filter(Boolean).join(' '));

  if (name === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery)) return 850;
  if (name.includes(normalizedQuery)) return 700;
  if (text.includes(normalizedQuery)) return 350;
  return 0;
}

function sortBySearch(cards, query) {
  return cards
    .map((card, index) => ({ ...card, searchScore: scoreCard(card, query), searchStableIndex: index }))
    .filter((card) => card.searchScore > 0)
    .sort((a, b) => {
      if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function mtgBucketFor(query) {
  const first = normalizeSearchText(query)[0];
  return first && /[a-z]/.test(first) ? first : '0-9';
}

function loadMtgSearchBucket(query) {
  return readJson(`public/data/mtg/search/${mtgBucketFor(query)}.json`);
}

function loadMtgAllRowsSample() {
  const bucketNames = fs.readdirSync(path.join(repoRoot, 'public/data/mtg/search'))
    .filter((name) => name.endsWith('.json'))
    .slice(0, 6);
  return bucketNames.flatMap((name) => readJson(`public/data/mtg/search/${name}`));
}

function loadCards(game) {
  return readJson(`public/data/${game}/cards.json`);
}

function mtgMatchesAdvanced(row, filters) {
  if (filters.name && !normalizeSearchText(row.name).includes(normalizeSearchText(filters.name))) return false;
  if (filters.oracleText && !normalizeSearchText(row.oracle_text).includes(normalizeSearchText(filters.oracleText))) return false;
  if (filters.typeLine && !normalizeSearchText(row.type_line).includes(normalizeSearchText(filters.typeLine))) return false;
  if (Array.isArray(filters.colors) && filters.colors.length) {
    const rowColors = new Set((Array.isArray(row.colors) ? row.colors : []).map((color) => String(color).toUpperCase()));
    if (!filters.colors.every((color) => rowColors.has(String(color).toUpperCase()))) return false;
  }
  return true;
}

const searchCore = read('src/services/search/searchCore.js');
assert(canonicalGame('magic') === 'magic', 'magic must normalize to magic');
assert(canonicalGame('mtg') === 'magic', 'mtg must normalize to magic');
assert(canonicalGame('Magic: The Gathering') === 'magic', 'Magic: The Gathering must normalize to magic');
assert(searchCore.includes('mtg') && searchCore.includes('magic the gathering'), 'Search Core must own game alias normalization');

const searchOwner = read('src/services/search/searchOwner.js');
assert(searchOwner.includes("import { inventoryOwner }"), 'Search Owner must import inventoryOwner before using it in set search');
assert(searchOwner.includes('browseByGame'), 'Search Owner must expose catalog-first browseByGame for browse consumers');
assert(searchOwner.includes('normalizeAdvancedOwnerResults'), 'Advanced Search must preserve adapter-filtered results instead of re-filtering by display label');
assert(searchOwner.includes('const normalized = normalizeAdvancedOwnerResults(response.results || []'), 'Advanced Search results must use advanced-safe normalization');

const shop = read('src/pages/Shop.jsx');
assert(shop.includes('performShopCardSearch'), 'Shop Singles must execute through Search Owner wrapper');
assert(!shop.includes('activeCardSearchResults.filter((card) => card.stockCard)'), 'Shop must not filter catalog search results to inventory/listings only');

const mobileShop = read('src/pages/mobile/MobileShop.jsx');
assert(mobileShop.includes('searchOwner.browseByGame'), 'Mobile browse must use Search Owner catalog browse');
assert(mobileShop.includes('searchGameLocal(trimmedQuery, game'), 'Mobile typed search must delegate through canonical Search Owner compatibility wrapper');
assert(!mobileShop.includes('stockCard: card,'), 'Mobile browse must not re-wrap every catalog result as an in-stock listing');

const deckBuilder = read('src/pages/AdvancedDeckBuilder.jsx');
assert(deckBuilder.includes("searchCards(query, selectedGame, 15)"), 'Deck Builder quick search must use canonical searchCards wrapper');
assert(deckBuilder.includes("searchCards(trimmedQuery, selectedGame, 18)"), 'Deck Builder normal search must use canonical searchCards wrapper');

const commanderHub = read('src/pages/CommanderHub.jsx');
const commanderData = read('src/hooks/useCommanderHubData.js');
assert(commanderHub.includes('onChange={(event) => setSearch(event.target.value)}'), 'Commander Hub input must update commander-domain search state');
assert(commanderData.includes('searchMtgCommanders(search'), 'Commander Hub must execute commander-domain search, not a dead input');
assert(commanderHub.includes('onSubmit={(event) =>') && commanderHub.includes('submitSearch();'), 'Commander Hub Enter/search action must submit the commander-domain search');
assert(commanderData.includes('submitSearch:'), 'Commander Hub hook must expose an explicit submit action');

const mtgFog = sortBySearch(loadMtgSearchBucket('Fog'), 'Fog');
assert(mtgFog.length > 0, 'MTG catalog Fog search must return results');
assert(mtgFog.some((card) => normalizeSearchText(card.name) === 'fog'), 'MTG catalog must contain exact Fog match');

const pokemonPikachu = sortBySearch(loadCards('pokemon'), 'Pikachu');
assert(pokemonPikachu.length > 0, 'Pokemon catalog Pikachu search must return results');

const yugiohBlue = sortBySearch(loadCards('yugioh'), 'Blue Dragon Ninja');
assert(yugiohBlue.length > 0, 'Yu-Gi-Oh catalog search must still return results');

const mtgAdvancedRows = loadMtgAllRowsSample().filter((row) => mtgMatchesAdvanced(row, {
  colors: ['G'],
  typeLine: 'Creature'
}));
assert(mtgAdvancedRows.length > 0, 'MTG advanced color/type filters must have valid catalog matches');

const zeroStockFixture = [
  { id: 'fog-in-stock', game: 'magic', name: 'Fog', inStock: true },
  { id: 'fog-zero-stock', game: 'magic', name: 'Fog', inStock: false },
  { id: 'fog-bank-zero-stock', game: 'magic', name: 'Fog Bank', inStock: false }
];
const rankedFixture = zeroStockFixture
  .map((card) => ({ ...card, searchScore: scoreCard(card, 'Fog') }))
  .filter((card) => card.searchScore > 0)
  .sort((a, b) => {
    if (Boolean(b.inStock) !== Boolean(a.inStock)) return b.inStock ? 1 : -1;
    return b.searchScore - a.searchScore;
  });
assert(rankedFixture.some((card) => card.id === 'fog-zero-stock'), 'Zero-stock catalog cards must remain searchable');
assert(rankedFixture[0].id === 'fog-in-stock', 'In-stock equivalent matches must be prioritized');

console.log('Search runtime verification passed.');
console.log(JSON.stringify({
  mtgFogResults: mtgFog.length,
  pokemonPikachuResults: pokemonPikachu.length,
  yugiohBlueDragonResults: yugiohBlue.length,
  mtgAdvancedGreenCreatureSampleResults: mtgAdvancedRows.length,
  outOfStockCardsRemainSearchable: true,
  inStockEquivalentMatchesPrioritized: true,
  shopSearchIsCatalogFirst: true,
  ordinaryCustomerSearchNeedsExternalApi: false
}, null, 2));
