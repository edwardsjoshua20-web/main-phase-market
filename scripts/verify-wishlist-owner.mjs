import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  addWishlistItem,
  buildWishlistItemKey,
  containsWishlistItem,
  getWishlistCount,
  normalizeWishlistItem,
  normalizeWishlistItems,
  removeWishlistItem,
  toggleWishlistItem,
} from '../src/services/wishlist/wishlistCore.js';

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
  'src/services/wishlist/wishlistOwner.js',
  'src/services/wishlist/wishlistCore.js',
  'src/hooks/useWishlistOwner.js',
  'src/components/utils/guestStorage.jsx',
]);

const classifyFile = (filePath, source) => {
  const rel = toPosix(filePath);
  const allowedOwner = ownerFiles.has(rel);
  return {
    rel,
    allowedOwner,
    directWishlist: /backend\.data\.Wishlist\.(filter|create|update|delete)/.test(source),
    guestWishlistHelperImport: /import\s*\{[^}]*\b(getGuestWishlist|setGuestWishlist|addToGuestWishlist|removeFromGuestWishlist)\b[^}]*\}\s*from\s*['"]@\/components\/utils\/guestStorage['"]/.test(source),
    guestWishlistPersistence: /localStorage\.(getItem|setItem|removeItem)\([^)]*guestWishlist/.test(source),
    membershipBypass: /wishlistItems\.some\s*\(/.test(source),
    directCountBypass: /wishlistItems\.length/.test(source),
  };
};

const scan = () => {
  const findings = walkFiles(srcRoot).map((filePath) => classifyFile(filePath, fs.readFileSync(filePath, 'utf8')));

  return {
    directWishlist: findings.filter((finding) => finding.directWishlist && !finding.allowedOwner),
    guestWishlistHelperImport: findings.filter((finding) => finding.guestWishlistHelperImport && !finding.allowedOwner),
    guestWishlistPersistence: findings.filter((finding) => finding.guestWishlistPersistence && finding.rel !== 'src/services/wishlist/wishlistOwner.js'),
    membershipBypass: findings.filter((finding) => finding.membershipBypass && !finding.allowedOwner),
    directCountBypass: findings.filter((finding) => finding.directCountBypass && !finding.allowedOwner),
  };
};

const verifyCoreRules = () => {
  const lightningBolt = {
    id: 'mtg-lightning-bolt-m10-146',
    product_name: 'Lightning Bolt',
    product_image: '/images/lightning-bolt.jpg',
    price: 1.25,
    product_type: 'card',
    game: 'magic',
    set_code: 'm10',
    collector_number: '146',
    finish: 'nonfoil',
    condition: 'Near Mint',
    language: 'en',
  };

  const lightningBoltFoil = { ...lightningBolt, id: 'mtg-lightning-bolt-m10-146-foil', finish: 'foil', price: 3.5 };
  const pikachu = {
    id: 'pokemon-pikachu-base-58',
    product_name: 'Pikachu',
    product_image: '/images/pikachu.jpg',
    price: 2.25,
    product_type: 'card',
    game: 'pokemon',
    set_code: 'base',
    collector_number: '58',
    finish: 'normal',
    condition: 'Near Mint',
    language: 'en',
  };

  let wishlist = [];
  wishlist = addWishlistItem(wishlist, lightningBolt);
  assert.equal(wishlist.length, 1, 'add new item');

  wishlist = addWishlistItem(wishlist, lightningBolt);
  assert.equal(wishlist.length, 1, 'add same item again does not duplicate');

  assert.equal(containsWishlistItem(wishlist, lightningBolt), true, 'contains returns true for existing item');
  assert.equal(containsWishlistItem(wishlist, pikachu), false, 'contains returns false for missing item');

  wishlist = toggleWishlistItem(wishlist, pikachu);
  assert.equal(containsWishlistItem(wishlist, pikachu), true, 'toggle on');

  wishlist = toggleWishlistItem(wishlist, pikachu);
  assert.equal(containsWishlistItem(wishlist, pikachu), false, 'toggle off');

  wishlist = addWishlistItem(wishlist, lightningBoltFoil);
  assert.equal(wishlist.length, 2, 'distinct intended identities stay distinct');

  wishlist = removeWishlistItem(wishlist, lightningBoltFoil);
  assert.equal(wishlist.length, 1, 'remove item');

  const roundTrip = normalizeWishlistItems(JSON.parse(JSON.stringify(wishlist)));
  assert.deepEqual(roundTrip, normalizeWishlistItems(wishlist), 'guest persistence round trip normalizes behind owner/core shape');

  const accountWishlist = addWishlistItem([], lightningBolt);
  const guestWishlist = addWishlistItem(addWishlistItem([], lightningBolt), pikachu);
  const merged = guestWishlist.reduce((items, item) => addWishlistItem(items, item), accountWishlist);
  const repeatedMerge = guestWishlist.reduce((items, item) => addWishlistItem(items, item), merged);
  assert.equal(merged.length, 2, 'guest to authenticated merge adds only missing identities');
  assert.equal(repeatedMerge.length, 2, 'repeated merge does not duplicate rows');

  assert.equal(getWishlistCount(repeatedMerge), 2, 'wishlist count derives from canonical wishlist');

  const normalized = normalizeWishlistItem({ card_name: 'Display Only', market_price: 99, stock_quantity: 0 });
  assert.equal(normalized.price, 99, 'display price can be carried as metadata');
  assert.equal(normalized.stock_quantity, 0, 'inventory value can be carried as metadata');
  assert.equal(buildWishlistItemKey(normalized).includes('stock'), false, 'price/inventory values are not wishlist identity truth');
};

verifyCoreRules();
const result = scan();

const activeReadBypasses = result.directWishlist.length
  + result.guestWishlistHelperImport.length
  + result.membershipBypass.length
  + result.directCountBypass.length;
const activeWriteBypasses = result.directWishlist.length + result.guestWishlistHelperImport.length;
const directPersistenceBypasses = result.guestWishlistPersistence.length;
const duplicatedBusinessRules = activeReadBypasses + activeWriteBypasses + directPersistenceBypasses;

console.log('Wishlist owner verification');
console.log(`ACTIVE WISHLIST READ BYPASSES: ${activeReadBypasses}`);
console.log(`ACTIVE WISHLIST WRITE BYPASSES: ${activeWriteBypasses}`);
console.log(`DIRECT WISHLIST PERSISTENCE BYPASSES: ${directPersistenceBypasses}`);
console.log(`DUPLICATED WISHLIST BUSINESS-RULE IMPLEMENTATIONS: ${duplicatedBusinessRules}`);

if (activeReadBypasses || activeWriteBypasses || directPersistenceBypasses || duplicatedBusinessRules) {
  for (const [label, findings] of Object.entries(result)) {
    if (findings.length === 0) continue;
    console.error(`${label}:`);
    for (const finding of findings) console.error(`- ${finding.rel}`);
  }
  process.exit(1);
}

console.log('WISHLIST OWNERSHIP: COMPLETE');
