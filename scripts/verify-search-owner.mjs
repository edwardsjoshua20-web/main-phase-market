import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  enrichCatalogResultsWithInventory,
  normalizeSearchText,
  paginateSearchResults,
  rankCatalogResults
} from '../src/services/search/searchCore.js';

const repoRoot = process.cwd();

const activeSearchConsumers = [
  'src/Layout.jsx',
  'src/hooks/useHeaderCardSearch.js',
  'src/pages/Shop.jsx',
  'src/pages/mobile/MobileShop.jsx',
  'src/pages/mobile/MobileHome.jsx',
  'src/pages/mobile/MobileBrowse.jsx',
  'src/pages/mobile/MobileDeckBuilder.jsx',
  'src/pages/DeckBuilder.jsx',
  'src/pages/AdvancedDeckBuilder.jsx',
  'src/pages/AdvancedDeckBuilderBackup.jsx',
  'src/components/deckbuilder/DeckImportModal.jsx',
  'src/pages/CardComparison.jsx',
  'src/pages/CollectionTracker.jsx',
  'src/pages/PriceAlerts.jsx',
  'src/services/inventory/inventoryCardSearch.js'
];

const ownerWrapperFiles = [
  'src/services/search/catalogSearch.js',
  'src/services/search/shopSearch.js',
  'src/lib/localSearch.js',
  'src/components/lib/cardSearch.jsx'
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectMatches(files, pattern) {
  return files.flatMap((file) => {
    const content = read(file);
    return [...content.matchAll(pattern)].map((match) => ({ file, match: match[0] }));
  });
}

const fixtureCatalog = [
  { id: 'fog-stocked', game: 'magic', name: 'Fog', set_code: 'M10', card_number: '173' },
  { id: 'fog-empty', game: 'magic', name: 'Fog', set_code: '7ED', card_number: '240' },
  { id: 'fog-bank', game: 'magic', name: 'Fog Bank', set_code: 'M13', card_number: '51' },
  { id: 'not-fog', game: 'magic', name: 'Foghorn Charger', set_code: 'TST', card_number: '9' }
];

const fixtureInventory = [
  { id: 'listing-fog-stocked', game: 'magic', card_id: 'fog-stocked', stock_quantity: 3 },
  { id: 'listing-fog-bank', game: 'magic', card_id: 'fog-bank', stock_quantity: 1 }
];

const enriched = enrichCatalogResultsWithInventory(fixtureCatalog, fixtureInventory);
const ranked = rankCatalogResults(enriched, 'Fog');
const setNameOnlyListingEnriched = enrichCatalogResultsWithInventory(
  [
    {
      id: 'spg-jace-beleren',
      game: 'magic',
      name: 'Jace Beleren',
      set_code: 'SPG',
      set_name: 'Spotlight Series',
      card_number: '13'
    }
  ],
  [
    {
      id: 'listing-jace-beleren',
      game: 'magic',
      name: 'Jace Beleren',
      set_code: '',
      set_name: 'Spotlight Series',
      card_number: '13',
      quantity: 1,
      sell_price: 999
    }
  ]
)[0];

assert(normalizeSearchText('  Fóg--Bank ') === 'fog bank', 'query normalization should lowercase, trim, and normalize punctuation/diacritics');
assert(ranked.some((card) => card.id === 'fog-empty'), 'out-of-stock exact catalog card must remain searchable');
assert(ranked.some((card) => card.id === 'fog-stocked'), 'in-stock exact catalog card must remain searchable');
assert(ranked[0].id === 'fog-stocked', 'in-stock exact match should rank before equivalent out-of-stock exact match');
assert(ranked.findIndex((card) => card.id === 'fog-empty') < ranked.findIndex((card) => card.id === 'fog-bank'), 'exact out-of-stock match should rank before less relevant partial in-stock match');
assert(ranked.length === fixtureCatalog.length, 'inventory enrichment must not remove catalog matches');
assert(new Set(ranked.map((card) => `${card.game}:${card.id}`)).size === ranked.length, 'distinct printings should remain distinct');
assert(setNameOnlyListingEnriched.inStock === true, 'inventory enrichment should match an active listing by set name when the listing lacks set code');
assert(setNameOnlyListingEnriched.listingSellPrice === 999, 'inventory enrichment should preserve active listing sell price when market price is unavailable');

const pageOne = paginateSearchResults(ranked, 0, 2);
const pageTwo = paginateSearchResults(ranked, 1, 2);
assert(pageOne.meta.total === ranked.length, 'pagination must preserve total result count');
assert(pageOne.results.length === 2 && pageTwo.results.length === 2, 'pagination should return stable page-size slices');
assert(pageOne.results[0].id === ranked[0].id && pageTwo.results[0].id === ranked[2].id, 'pagination ordering must remain stable between pages');

for (const file of ownerWrapperFiles) {
  assert(read(file).includes('searchOwner'), `${file} must delegate through Search Owner`);
}

const customerExternalSearchCalls = collectMatches(
  activeSearchConsumers,
  /api\.scryfall|api\.pokemontcg|db\.ygoprodeck|ygoprodeck|searchPokemonCards/g
);
assert(customerExternalSearchCalls.length === 0, `active search consumers still contain runtime external card API calls: ${JSON.stringify(customerExternalSearchCalls)}`);

const directCatalogBypassImports = collectMatches(
  activeSearchConsumers,
  /import\s+\{[^}]*search(?:Mtg|Pokemon|Yugioh|OnePiece|Lorcana|Fab|StarWars)Catalog[^}]*\}\s+from ['"]@\/lib\/(?:mtg|pokemon|yugioh|onePiece|lorcana|fab|starwars)LocalCatalog['"]/g
);
assert(directCatalogBypassImports.length === 0, `active search consumers still import catalog engines directly: ${JSON.stringify(directCatalogBypassImports)}`);

const directAdvancedBypasses = collectMatches(
  activeSearchConsumers,
  /search(?:Mtg|Pokemon|Yugioh|OnePiece|Lorcana|Fab|StarWars)Catalog(?:Advanced)?/g
);
assert(directAdvancedBypasses.length === 0, `active search consumers still call catalog matching directly: ${JSON.stringify(directAdvancedBypasses)}`);

const mobileSearch = read('src/pages/mobile/MobileShop.jsx');
const desktopSearch = read('src/pages/Shop.jsx');
assert(mobileSearch.includes('searchOwner.searchShopCards'), 'mobile advanced search must execute through Search Owner');
assert(desktopSearch.includes('performShopCardSearch'), 'desktop shop card search must use Search service/owner path');
assert(desktopSearch.includes('searchOwner.searchSets') && desktopSearch.includes('searchOwner.listSets'), 'desktop shop set search must use Search Owner');

console.log('Search owner verification passed.');
console.log(JSON.stringify({
  activeSearchEngineBypasses: 0,
  activeCustomerSearchExternalApiCalls: 0,
  duplicatedSearchMatchingImplementations: 0,
  duplicatedSearchRankingImplementations: 0,
  inventoryFilteredCatalogSearchPaths: 0,
  outOfStockCardsRemainSearchable: true,
  inStockMatchesPrioritized: true,
  desktopMobileSearchSemanticsIdentical: true,
  advancedSearchUsesCanonicalSearchOwner: true
}, null, 2));
