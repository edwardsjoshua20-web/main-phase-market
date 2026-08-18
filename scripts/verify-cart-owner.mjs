import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  addOrMergeCartItem,
  buildCheckoutPayload,
  getCartItemCount,
  getCartSubtotal,
  normalizeCartItem,
  removeCartItem,
  setCartItemQuantity,
} from '../src/services/cart/cartCore.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const srcRoot = path.join(repoRoot, 'src');

const toPosix = (filePath) => path.relative(repoRoot, filePath).replaceAll(path.sep, '/');

const walkFiles = (root) => {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
};

const ownerFiles = new Set([
  'src/services/cart/cartOwner.js',
  'src/services/cart/cartCore.js',
  'src/hooks/useCartOwner.js',
  'src/components/utils/guestStorage.jsx',
]);

const classifyFile = (filePath, source) => {
  const rel = toPosix(filePath);
  const allowedOwner = ownerFiles.has(rel);
  return {
    rel,
    source,
    allowedOwner,
    directCartItem: /backend\.data\.CartItem\.(filter|create|update|delete)/.test(source),
    guestCartHelperImport: /import\s*\{[^}]*\b(getGuestCart|addToGuestCart|removeFromGuestCart|updateGuestCartQuantity|clearGuestStorage)\b[^}]*\}\s*from\s*['"]@\/components\/utils\/guestStorage['"]/.test(source),
    guestCartPersistence: /localStorage\.(getItem|setItem|removeItem)\(\s*['"]guestCart['"]/.test(source),
    cartCountReducer: /cartItems\.reduce\s*\(/.test(source),
  };
};

const scan = () => {
  const findings = walkFiles(srcRoot).map((filePath) => classifyFile(filePath, fs.readFileSync(filePath, 'utf8')));

  const readBypasses = findings.filter((finding) => finding.directCartItem && !finding.allowedOwner);
  const guestHelperBypasses = findings.filter((finding) => finding.guestCartHelperImport && !finding.allowedOwner);
  const persistenceBypasses = findings.filter((finding) => finding.guestCartPersistence && finding.rel !== 'src/services/cart/cartOwner.js');
  const directCountBypasses = findings.filter((finding) => finding.cartCountReducer && !finding.allowedOwner);

  return {
    readBypasses,
    writeBypasses: readBypasses,
    persistenceBypasses,
    directCountBypasses,
    guestHelperBypasses,
  };
};

const verifyCoreRules = () => {
  const bronzeSword = {
    id: 'listing-bronze',
    card_name: 'Bronze Sword',
    price: 2,
    game: 'rpg',
    set_code: 'gear',
    collector_number: '001',
    finish: 'normal',
    condition: 'Near Mint',
    language: 'en',
  };

  const bronzeFoil = { ...bronzeSword, id: 'listing-bronze-foil', finish: 'foil', price: 4 };
  const ironSword = {
    id: 'listing-iron',
    card_name: 'Iron Sword',
    price: 5,
    game: 'rpg',
    set_code: 'gear',
    collector_number: '002',
    finish: 'normal',
    condition: 'Near Mint',
    language: 'en',
  };

  let cart = [];
  cart = addOrMergeCartItem(cart, bronzeSword, 1);
  assert.equal(cart.length, 1, 'first add creates one cart row');
  assert.equal(cart[0].quantity, 1, 'first add preserves quantity');

  cart = addOrMergeCartItem(cart, bronzeSword, 2);
  assert.equal(cart.length, 1, 'same sellable identity merges into one row');
  assert.equal(cart[0].quantity, 3, 'same sellable identity increments quantity');

  cart = addOrMergeCartItem(cart, bronzeFoil, 1);
  assert.equal(cart.length, 2, 'different finish remains a distinct cart row');

  cart = addOrMergeCartItem(cart, ironSword, 2);
  assert.equal(cart.length, 3, 'different listing remains a distinct cart row');
  assert.equal(getCartItemCount(cart), 6, 'cart count is derived from canonical quantities');
  assert.equal(getCartSubtotal(cart), 20, 'display subtotal is derived in cart core only');

  cart = setCartItemQuantity(cart, ironSword, 4);
  assert.equal(getCartItemCount(cart), 8, 'quantity update flows through cart core');

  cart = setCartItemQuantity(cart, ironSword, -2);
  assert.equal(cart.some((item) => item.card_name === 'Iron Sword'), false, 'zero/negative quantity removes the row');

  cart = removeCartItem(cart, bronzeFoil);
  assert.equal(cart.length, 1, 'remove flows through cart core');

  const payload = buildCheckoutPayload(cart);
  assert.deepEqual(Object.keys(payload[0]).sort(), ['card_id', 'cart_item_key', 'quantity'].sort(), 'checkout payload keeps identity + quantity only');
  assert.equal('price' in payload[0], false, 'checkout payload does not trust client price');
  assert.equal('card_name' in payload[0], false, 'checkout payload does not send display names as authority');

  const normalized = normalizeCartItem({ product_name: 'Starter Deck', sell_price: 12.99, quantity: '2' });
  assert.equal(normalized.card_name, 'Starter Deck', 'cart item normalization preserves display name');
  assert.equal(normalized.price, 12.99, 'cart item normalization preserves display price snapshot');
  assert.equal(normalized.quantity, 2, 'cart item normalization normalizes quantity');
};

verifyCoreRules();
const result = scan();

const activeReadBypasses = result.readBypasses.length + result.guestHelperBypasses.length + result.directCountBypasses.length;
const activeWriteBypasses = result.writeBypasses.length + result.guestHelperBypasses.length;
const directPersistenceBypasses = result.persistenceBypasses.length;
const duplicatedBusinessRules = activeReadBypasses + activeWriteBypasses + directPersistenceBypasses;

console.log('Cart owner verification');
console.log(`ACTIVE CART READ BYPASSES: ${activeReadBypasses}`);
console.log(`ACTIVE CART WRITE BYPASSES: ${activeWriteBypasses}`);
console.log(`DIRECT CART PERSISTENCE BYPASSES: ${directPersistenceBypasses}`);
console.log(`DUPLICATED CART BUSINESS-RULE IMPLEMENTATIONS: ${duplicatedBusinessRules}`);

if (activeReadBypasses || activeWriteBypasses || directPersistenceBypasses || duplicatedBusinessRules) {
  for (const [label, findings] of Object.entries(result)) {
    if (findings.length === 0) continue;
    console.error(`${label}:`);
    for (const finding of findings) console.error(`- ${finding.rel}`);
  }
  process.exit(1);
}

console.log('CART OWNERSHIP: COMPLETE');
