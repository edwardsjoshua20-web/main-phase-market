import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createInventoryBackup,
  deleteInventoryEntity,
  getInventoryAuditRows,
  getInventoryBackupItems,
  getInventoryBackupRun,
  getInventoryEntity,
  getSupabaseInventoryConfig,
  patchInventoryEntityData,
  restoreInventoryBackupItems,
  upsertInventoryEntity
} from './lib/inventory-backup-client.mjs';

const ROOT = process.cwd();
const timestamp = Date.now();
const primaryId = `qa-inventory-durability-${timestamp}`;
const controlId = `qa-inventory-control-${timestamp}`;

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertNoGeneratedAutomationInventoryMutation() {
  const automationFiles = [
    'scripts/run-card-backfill-refresh.mjs',
    'scripts/run-catalog-refresh.mjs',
    'scripts/run-image-refresh.mjs',
    'scripts/run-pricing-source-refresh.mjs',
    'scripts/build-pricing-snapshot.mjs',
    'scripts/run-homepage-refresh.mjs',
    'scripts/build-site-health-report.mjs'
  ];

  const suspicious = [];
  for (const file of automationFiles) {
    const text = readFile(file);
    const mutatesRestEntities = /\/rest\/v1\/app_entities/i.test(text)
      && /\b(method|Method)\s*:\s*['"`](POST|PATCH|PUT|DELETE)['"`]/i.test(text);
    const mutatesSupabaseEntities = /\.from\(['"]app_entities['"]\)[\s\S]{0,400}\.(insert|upsert|update|delete)\s*\(/i.test(text);
    if (mutatesRestEntities || mutatesSupabaseEntities) {
      suspicious.push(file);
    }
  }

  assert.deepEqual(
    suspicious,
    [],
    `Generated-data automations must not mutate physical inventory app_entities. Found mutating app_entities access in ${suspicious.join(', ')}`
  );
}

function qaData(id, quantity) {
  return {
    id,
    name: `QA Inventory Durability ${id}`,
    game: 'magic',
    status: 'active',
    listing_status: 'active',
    quantity,
    sell_price: 1,
    price: 1,
    market_price: 1,
    cost: 0.25,
    sku: id,
    card_name: `QA Inventory Durability ${id}`,
    set_name: 'QA Durability',
    source: 'inventory-durability-verify'
  };
}

async function cleanup(config) {
  await Promise.allSettled([
    deleteInventoryEntity(config, 'Card', primaryId),
    deleteInventoryEntity(config, 'Card', controlId)
  ]);
}

async function main() {
  assertNoGeneratedAutomationInventoryMutation();
  const config = getSupabaseInventoryConfig(ROOT);

  await cleanup(config);

  try {
    await upsertInventoryEntity(config, {
      entity_name: 'Card',
      id: primaryId,
      data: qaData(primaryId, 7)
    });
    await upsertInventoryEntity(config, {
      entity_name: 'Card',
      id: controlId,
      data: qaData(controlId, 3)
    });

    const created = await getInventoryEntity(config, 'Card', primaryId);
    assert.equal(Number(created?.data?.quantity), 7, 'QA inventory row was not created.');

    const backupId = await createInventoryBackup(config, {
      reason: 'durability-qa-restore-test',
      createdBy: 'verify-inventory-durability'
    });
    const backupRun = await getInventoryBackupRun(config, backupId);
    const backupItems = await getInventoryBackupItems(config, backupId, primaryId);
    assert.equal(backupRun?.status, 'ok', 'Backup run did not complete ok.');
    assert.equal(backupItems.length, 1, 'Backup does not contain the QA inventory row.');
    assert.equal(Number(backupItems[0]?.data?.quantity), 7, 'Backup captured the wrong QA quantity.');

    await deleteInventoryEntity(config, 'Card', primaryId);
    await patchInventoryEntityData(config, 'Card', controlId, {
      ...qaData(controlId, 99),
      note: 'control row should not be overwritten by targeted restore'
    });

    const deleted = await getInventoryEntity(config, 'Card', primaryId);
    assert.equal(deleted, null, 'QA inventory row was not deleted before restore.');

    const restoreResult = await restoreInventoryBackupItems(config, {
      backupId,
      entityIds: [primaryId],
      reason: 'durability-qa-targeted-restore'
    });
    assert.equal(Number(restoreResult?.restored || 0), 1, 'Targeted restore did not restore exactly one row.');

    const restored = await getInventoryEntity(config, 'Card', primaryId);
    assert.equal(Number(restored?.data?.quantity), 7, 'QA inventory row did not restore its backed-up quantity.');

    const control = await getInventoryEntity(config, 'Card', controlId);
    assert.equal(Number(control?.data?.quantity), 99, 'Targeted restore overwrote unrelated QA business data.');

    const auditRows = await getInventoryAuditRows(config, primaryId);
    assert.ok(auditRows.length >= 2, 'Inventory mutation audit did not capture QA mutations.');

    console.log(JSON.stringify({
      ok: true,
      backupId,
      backupEntityCount: Number(backupRun?.entity_count || 0),
      qaEntity: primaryId,
      restoredQuantity: restored?.data?.quantity,
      unrelatedControlQuantity: control?.data?.quantity,
      auditRows: auditRows.length,
      automationIsolation: 'generated catalog/pricing/search/image/homepage jobs do not access app_entities'
    }, null, 2));
  } finally {
    await cleanup(config);
  }
}

main().catch((error) => {
  console.error('inventory durability verification failed:', error);
  process.exit(1);
});
