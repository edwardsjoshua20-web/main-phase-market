import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const migration = read('supabase/migrations/20260813_create_checkout_finalizations.sql');
const finalizer = read('supabase/functions/finalize-checkout-session/index.ts');
const commerce = read('supabase/functions/_shared/commerce.ts');

assert.match(migration, /create table if not exists public\.checkout_finalizations/i);
assert.match(migration, /idempotency_key text primary key/i);
assert.match(migration, /create or replace function public\.finalize_checkout_order_atomic/i);
assert.match(migration, /on conflict \(idempotency_key\) do nothing/i);
assert.match(migration, /for update/i);
assert.match(migration, /insert into public\.app_entities \(entity_name, id, created_date, updated_date, data\)/i);
assert.match(migration, /update public\.app_entities[\s\S]*jsonb_set\(v_inventory_data, '\{quantity\}'/i);
assert.match(migration, /update public\.checkout_finalizations[\s\S]*status = 'finalized'/i);
assert.doesNotMatch(migration, /pg_sleep|advisory|process-local|in-memory/i);

assert.match(commerce, /finalizeCheckoutOrderAtomically/);
assert.match(commerce, /\/rest\/v1\/rpc\/finalize_checkout_order_atomic/);
assert.match(finalizer, /finalizeCheckoutOrderAtomically\(sessionId, orderPayload\)/);
assert.doesNotMatch(finalizer, /filterEntities\('Order'/);
assert.doesNotMatch(finalizer, /createEntity\('Order'/);
assert.doesNotMatch(finalizer, /decrementInventoryForOrder\(order\)/);
assert.match(finalizer, /if \(!finalization\.alreadyFinalized\)[\s\S]*sendOrderConfirmationEmail/);

console.log('Checkout/order idempotency verification passed.');
