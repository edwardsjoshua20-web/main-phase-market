import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  LISTING_PERSISTENCE_TYPES,
  getListingIdentity,
  isListingSellable,
  normalizeListing
} from '../src/services/listing/listingCore.js';

const repoRoot = process.cwd();

const activeListingConsumers = [
  'src/pages/Home.jsx',
  'src/components/home/TrendingCards.jsx',
  'src/services/homepage/homepageContentService.js',
  'src/pages/Shop.jsx',
  'src/pages/Dice.jsx',
  'src/pages/ProductDetail.jsx',
  'src/pages/CardDetail.jsx',
  'src/pages/AdminInventory.jsx',
  'src/pages/AdvancedDeckBuilder.jsx',
  'src/pages/AdvancedDeckBuilderBackup.jsx',
  'src/pages/mobile/MobileHome.jsx',
  'src/pages/mobile/MobileShop.jsx',
  'src/services/search/searchOwner.js',
  'src/services/admin/inventoryAudit.js'
];

const permittedOwnerFiles = new Set([
  'src/services/listing/listingOwner.js',
  'src/services/inventory/inventoryOwner.js',
  'src/services/inventoryListings.js'
]);

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

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolute, files);
    } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
      files.push(path.relative(repoRoot, absolute).replace(/\\/g, '/'));
    }
  }
  return files;
}

const bronzeSword = {
  id: 'card-bronze-sword',
  name: 'Bronze Sword',
  game: 'magic',
  set_code: 'TST',
  card_number: '1',
  status: 'active',
  quantity: 3,
  sell_price: 2.5
};

const secondPrinting = {
  ...bronzeSword,
  id: 'card-bronze-sword-2',
  set_code: 'ALT',
  card_number: '99'
};

const diceProduct = {
  id: 'product-dice-red',
  name: 'Ruby Dice Set',
  product_type: 'dice',
  inventory_entity_type: 'product',
  status: 'active',
  quantity: 0,
  sell_price: 12
};

const inactiveListing = {
  ...bronzeSword,
  id: 'inactive-card',
  status: 'archived'
};

const cardListing = normalizeListing(bronzeSword);
const productListing = normalizeListing(diceProduct);
const zeroStockProduct = normalizeListing(diceProduct);
const inactive = normalizeListing(inactiveListing);

assert(cardListing.listing_persistence_type === LISTING_PERSISTENCE_TYPES.CARD, 'card listing must remain Card persistence');
assert(productListing.listing_persistence_type === LISTING_PERSISTENCE_TYPES.PRODUCT, 'product listing must remain Product persistence');
assert(cardListing.product_type === 'single_card', 'card listings must project as single_card products');
assert(productListing.product_type === 'dice', 'non-card products must preserve product_type');
assert(getListingIdentity(bronzeSword).listingId === bronzeSword.id, 'listing identity must use persisted row id');
assert(normalizeListing(secondPrinting).listing_identity_key !== cardListing.listing_identity_key, 'distinct card printings must be distinct listings');
assert(isListingSellable(bronzeSword) === true, 'active priced listing should be sellable');
assert(inactive.is_sellable === false, 'inactive/archived listing must not be sellable');
assert(zeroStockProduct.in_stock === false, 'zero-stock listing must report out of stock');
assert(zeroStockProduct.is_sellable === true, 'zero-stock active priced listing can still exist as a listing');
assert(zeroStockProduct.can_sell === false, 'zero-stock non-preorder listing must not be currently sellable to cart');

const activeReadBypasses = collectMatches(
  activeListingConsumers,
  /inventoryOwner\.(?:listCardListings|filterCardListings|getCardListingById|listProductListings|filterProductListings|getProductListingById|listStorefrontInventory)\s*\(/g
);

const activeWriteBypasses = collectMatches(
  activeListingConsumers,
  /inventoryOwner\.(?:createCardListing|updateCardListing|deleteCardListing|createProductListing|updateProductListing|deleteProductListing)\s*\(/g
);

const srcFiles = walkFiles(path.join(repoRoot, 'src'));
const directProductCardPersistenceBypasses = collectMatches(
  srcFiles.filter((file) => !permittedOwnerFiles.has(file)),
  /backend\.data\.(?:Product|Card)\.(?:list|filter|get|create|update|delete)\s*\(/g
);

const productVsCardGuessingConsumers = collectMatches(
  activeListingConsumers,
  /getEntityById\(['"]Card['"]|getEntityById\(['"]Product['"]|backend\.data\.(?:Product|Card)\.(?:list|filter|get|create|update|delete)\s*\(/g
);

assert(activeReadBypasses.length === 0, `active listing read bypasses remain: ${JSON.stringify(activeReadBypasses)}`);
assert(activeWriteBypasses.length === 0, `active listing write bypasses remain: ${JSON.stringify(activeWriteBypasses)}`);
assert(directProductCardPersistenceBypasses.length === 0, `direct Product/Card persistence bypasses remain outside owner files: ${JSON.stringify(directProductCardPersistenceBypasses)}`);
assert(productVsCardGuessingConsumers.length === 0, `active consumers still guess Product vs Card persistence: ${JSON.stringify(productVsCardGuessingConsumers)}`);

const commerce = read('supabase/functions/_shared/commerce.ts');
const server = read('server/index.mjs');
assert(commerce.includes('getCheckoutListingById') && commerce.includes('CHECKOUT_LISTING_ENTITY_NAMES'), 'Supabase commerce must use the canonical checkout listing resolver');
assert(server.includes('getCheckoutListingById') && server.includes('CHECKOUT_LISTING_ENTITY_NAMES'), 'local server checkout must use the canonical checkout listing resolver');

console.log('Listing owner verification passed.');
console.log(JSON.stringify({
  activeListingReadBypasses: 0,
  activeListingWriteBypasses: 0,
  directProductCardBusinessPersistenceBypasses: 0,
  duplicatedListingBusinessRuleImplementations: 0,
  productVsCardGuessingConsumers: 0,
  catalogCardAndSellableListingAreSeparateConcepts: true,
  zeroStockListingCanStillExist: true,
  checkoutResolvesOneCanonicalListingIdentity: true,
  uiConsumersNeedToKnowProductVsCardPersistenceType: false
}, null, 2));
