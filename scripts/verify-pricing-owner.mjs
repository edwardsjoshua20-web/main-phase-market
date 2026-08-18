import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pricingCore = await import(pathToFileURL(path.join(ROOT, 'src/services/pricing/pricingCore.js')).href);

const { resolvePricingState, assertSellPriceAvailable } = pricingCore;

const sample = {
  id: 'card-1',
  game: 'magic',
  name: 'Cyclonic Rift',
  set_code: 'RTR',
  card_number: '35',
  finish: 'nonfoil',
  language: 'en',
  price: 12,
  cardkingdom_price: 13.75,
  tcgplayer_price: 12.49,
  starcitygames_price: 14.25
};

const foil = { ...sample, id: 'card-2', finish: 'foil', price: 24 };
const baseState = resolvePricingState(sample);
const foilState = resolvePricingState(foil);
const listingState = resolvePricingState({ ...sample, quantity: 2, status: 'active' });
const catalogState = resolvePricingState({
  id: 'catalog-card-1',
  game: 'magic',
  name: 'Catalog Card',
  price: 9.25
});

assert(baseState.identity_key !== foilState.identity_key, 'Pricing identity must distinguish finish/printing variants.');
assert(listingState.sell_price === 12, 'Explicit Main Phase sell price must be authoritative for inventory/listing records.');
assert(catalogState.market_price === 9.25, 'Loose catalog price fields must be treated as advisory source data.');
assert(listingState.market_price === 13.75, 'Merged external source median should remain available as market reference.');
assert(assertSellPriceAvailable(listingState).sell_price === 12, 'Valid listings must produce an authoritative sell price.');

let unavailableFailed = false;
try {
  assertSellPriceAvailable({ id: 'empty', name: 'No Price', game: 'magic' });
} catch (error) {
  unavailableFailed = /No canonical sell price/.test(String(error?.message || ''));
}
assert(unavailableFailed, 'Missing canonical sell price must fail explicitly.');

const pricingPipeline = read('src/services/pricing/pricingPipeline.js');
assert(pricingPipeline.includes('resolvePricingState'), 'Legacy pricing pipeline must delegate to canonical pricing core.');

const inventoryOwner = read('src/services/inventory/inventoryOwner.js');
assert(inventoryOwner.includes('pricingOwner.applyPricingProjection'), 'Inventory owner must project canonical pricing for storefront listings.');

const supabaseCheckout = read('supabase/functions/create-checkout/index.ts');
assert(supabaseCheckout.includes('resolveTrustedCartItems'), 'Hosted checkout must resolve trusted cart prices server-side.');
assert(!supabaseCheckout.includes('payload.cartItems.map(normalizeCartItem)'), 'Hosted checkout must not build Stripe prices directly from client cart prices.');

const commerce = read('supabase/functions/_shared/commerce.ts');
assert(commerce.includes('assertSellPriceAvailable'), 'Hosted commerce runtime must enforce canonical sell price availability.');
assert(commerce.includes('price: pricing.sell_price'), 'Hosted commerce runtime must write canonical sell price to checkout metadata.');

const server = read('server/index.mjs');
assert(server.includes('resolveTrustedCheckoutCartItems'), 'Local checkout must resolve trusted cart prices server-side.');
assert(server.includes('assertSellPriceAvailable'), 'Local checkout must enforce canonical sell price availability.');

const activeExternalPricingCalls = [
  'src/pages/PriceAlerts.jsx',
  'src/pages/CollectionTracker.jsx',
  'src/pages/CardComparison.jsx'
].filter((filePath) => {
  const source = read(filePath);
  return /tcgplayer_price|cardmarket|prices\?\.usd/.test(source) && !source.includes('pricingOwner.resolvePricingState');
});

assert(!activeExternalPricingCalls.includes('src/pages/PriceAlerts.jsx'), 'Price alerts must consume canonical pricing owner.');

console.log(JSON.stringify({
  status: 'ok',
  checks: [
    'pricing identity distinguishes variants',
    'Main Phase sell price is authoritative for inventory/listing records',
    'loose catalog price fields remain advisory',
    'external market references remain advisory',
    'missing sell price fails explicitly',
    'legacy pricing pipeline delegates to pricing core',
    'inventory owner projects canonical pricing',
    'hosted checkout resolves trusted server-side prices',
    'local checkout resolves trusted server-side prices',
    'price alerts consume pricing owner'
  ],
  knownNonStorefrontPricingLookups: activeExternalPricingCalls
}, null, 2));
