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
assert.equal(layout.assignments['sol-ring'], 'custom:ramp');
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

console.log('Deck modular workflow verification: PASS');
