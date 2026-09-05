import assert from 'node:assert/strict';
import {
  addCustomSection,
  applySectionLayout,
  applySectionTemplate,
  assignCardsToSection,
  createSectionLayout,
  createSectionTemplate,
  removeCustomSection,
} from '../src/lib/deckSectionLayout.js';
import { reconcileDeckImport } from '../src/lib/deckImportReconciliation.js';
import { getEffectiveDeckCopyLimit } from '../src/lib/deckCopyLimits.js';
import { createBasicLandDistribution } from '../src/lib/deckLandCompletion.js';

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const defaultColumns = [
  [{ type: 'commander', canonicalKey: 'Commander' }, { type: 'stack', label: 'Creatures', canonicalKey: 'Creatures' }],
  [{ type: 'stack', label: 'Artifacts', canonicalKey: 'Artifacts' }],
];

const attemptedMove = createSectionLayout([
  [{ type: 'stack', label: 'Artifacts', canonicalKey: 'Artifacts' }],
  [{ type: 'commander', canonicalKey: 'Commander' }, { type: 'stack', label: 'Creatures', canonicalKey: 'Creatures' }],
], null);
const anchored = applySectionLayout(defaultColumns, attemptedMove);
assert.equal(anchored[0][0].canonicalKey, 'Commander', 'Commander must remain anchored');

let layout = addCustomSection(null, defaultColumns, 'custom:ramp', 'Ramp');
layout = assignCardsToSection(layout, ['sol-ring'], 'custom:ramp');
layout = createSectionLayout(defaultColumns.map((column, index) => index === 1 ? [...column, { type: 'custom', canonicalKey: 'custom:ramp', label: 'custom:ramp' }] : column), layout, { 'custom:ramp': 'Mana Ramp' });
assert.equal(layout.assignments['sol-ring'], 'custom:ramp');
assert.equal(layout.customSections[0].displayName, 'Mana Ramp', 'Custom section rename must persist into templates');
const template = createSectionTemplate(layout, 'magic', 'Commander Template');
const reapplied = applySectionTemplate(layout, template);
assert.equal(reapplied.customSections.length, 1, 'Applying a template must not duplicate named custom sections');
const removed = removeCustomSection(reapplied, 'custom:ramp');
assert.equal(removed.assignments['sol-ring'], undefined, 'Deleting a custom section must restore default grouping');

const current = [
  { product_id: 'old-sol-ring-printing', product_name: 'Sol Ring', oracle_id: 'oracle-sol', quantity: 1 },
  { product_id: 'extra', product_name: 'Goblin Matron', oracle_id: 'oracle-extra', quantity: 1 },
];
const results = [
  { name: 'Sol Ring', qty: 1, card: { id: 'new-sol-ring-printing', name: 'Sol Ring', oracle_id: 'oracle-sol' } },
  { name: 'Lightning Bolt', qty: 3, card: { id: 'bolt', name: 'Lightning Bolt', oracle_id: 'oracle-bolt' } },
  { name: 'Not A Card', qty: 1, card: null, error: 'Not found' },
];
const reconciliation = reconcileDeckImport(results, current, normalize);
assert.equal(reconciliation.already.length, 1);
assert.equal(reconciliation.already[0].existing.product_id, 'old-sol-ring-printing', 'Existing printing must be preserved');
assert.equal(reconciliation.willAdd[0].missingQuantity, 3);
assert.equal(reconciliation.unresolved.length, 1);
assert.equal(reconciliation.extras.length, 1);

const commanderConfig = { maxCopies: 1 };
const commanderLimit = (card) => getEffectiveDeckCopyLimit(card, { game: 'magic', formatConfig: commanderConfig });
const duplicateShivan = reconcileDeckImport([
  { name: 'Shivan Harvest', qty: 1, card: { id: 'shivan-a', name: 'Shivan Harvest', oracle_id: 'oracle-shivan', type: 'Enchantment' } },
  { name: 'shivan harvest', qty: 1, card: { id: 'shivan-b', name: 'Shivan Harvest', oracle_id: 'oracle-shivan', type: 'Enchantment' } },
], [], normalize, { getCopyLimit: commanderLimit });
assert.equal(duplicateShivan.willAdd.length, 1, 'Canonical duplicate lines must aggregate before reconciliation');
assert.equal(duplicateShivan.willAdd[0].missingQuantity, 1, 'Commander import should add the legal copy');
assert.equal(duplicateShivan.conflicts[0].conflictQuantity, 1, 'Commander import should report the excess copy');

const existingShivan = reconcileDeckImport([
  { name: 'Shivan Harvest', qty: 2, card: { id: 'shivan-new', name: 'Shivan Harvest', oracle_id: 'oracle-shivan', type: 'Enchantment' } },
], [{ product_id: 'shivan-existing', product_name: 'Shivan Harvest', oracle_id: 'oracle-shivan', type: 'Enchantment', quantity: 1 }], normalize, { getCopyLimit: commanderLimit });
assert.equal(existingShivan.already[0].alreadyQuantity, 1);
assert.equal(existingShivan.willAdd.length, 0);
assert.equal(existingShivan.conflicts[0].conflictQuantity, 1);

const petitioners = reconcileDeckImport([
  { name: 'Persistent Petitioners', qty: 8, card: { id: 'petitioners', name: 'Persistent Petitioners', oracle_id: 'oracle-petitioners', type: 'Creature' } },
], [], normalize, { getCopyLimit: commanderLimit });
assert.equal(petitioners.willAdd[0].missingQuantity, 8, 'Any-number exceptions must use the shared copy-limit owner');
assert.equal(petitioners.conflicts.length, 0);

const mountains = reconcileDeckImport([
  { name: 'Mountain', qty: 32, card: { id: 'mountain', name: 'Mountain', oracle_id: 'oracle-mountain', type: 'Basic Land — Mountain' } },
], [], normalize, { getCopyLimit: commanderLimit });
assert.equal(mountains.willAdd[0].missingQuantity, 32, 'Basic lands must remain exempt from Commander singleton limits');
assert.equal(mountains.conflicts.length, 0);

const monoRedLands = createBasicLandDistribution({
  items: [{ product_name: 'Krenko, Mob Boss', is_commander: true, color_identity: ['R'], mana_cost: '{2}{R}{R}', quantity: 1 }],
}, 32);
assert.deepEqual(monoRedLands, { Mountain: 32 }, 'Mono-red land completion should suggest Mountains');

const weightedLands = createBasicLandDistribution({
  items: [
    { product_name: 'Two-color Commander', is_commander: true, color_identity: ['U', 'R'], quantity: 1 },
    { product_name: 'Blue Spell', mana_cost: '{U}{U}', quantity: 3 },
    { product_name: 'Red Spell', mana_cost: '{R}', quantity: 1 },
  ],
}, 21);
assert.equal(weightedLands.Island, 18);
assert.equal(weightedLands.Mountain, 3);

console.log('Deck modular workflow verification: PASS');
