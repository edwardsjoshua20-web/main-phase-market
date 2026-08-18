import assert from 'node:assert/strict';
import {
  applyInventoryDecrease,
  buildInventoryIdentityKey,
  findInventoryMatch,
  getInventoryStockState,
  normalizeInventoryIdentity
} from '../src/services/inventory/inventoryCore.js';

const bronze = {
  id: 'card-1',
  game: 'magic',
  name: 'Bronze Sword',
  set_code: 'TST',
  card_number: '001',
  finish: 'nonfoil',
  condition: 'near_mint',
  language: 'en',
  quantity: 4,
  status: 'active'
};

assert.equal(normalizeInventoryIdentity({ game: 'MTG', name: ' Bronze Sword ' }).game, 'magic');
assert.equal(buildInventoryIdentityKey(bronze), 'card::magic::bronze sword::tst::001::nonfoil::near_mint::en');
assert.deepEqual(getInventoryStockState({ quantity: 2, status: 'active' }, 2), {
  quantity: 2,
  availableQuantity: 2,
  status: 'active',
  inStock: true,
  canFulfill: true
});
assert.equal(getInventoryStockState({ quantity: 2, status: 'inactive' }, 1).canFulfill, false);
assert.equal(applyInventoryDecrease(bronze, 3).quantity, 1);
assert.throws(() => applyInventoryDecrease(bronze, 5), /Insufficient inventory/);
assert.equal(applyInventoryDecrease(bronze, 3, { operationId: 'order-1', appliedOperationIds: ['order-1'] }).quantity, 4);
assert.equal(findInventoryMatch({ game: 'magic', name: 'Bronze Sword', set_code: 'TST', card_number: '001', lang: 'en' }, [bronze])?.id, 'card-1');
assert.equal(findInventoryMatch({ game: 'magic', name: 'Bronze Sword', set_code: 'TST', card_number: '002' }, [bronze]), null);

console.log('Inventory owner verification passed.');
