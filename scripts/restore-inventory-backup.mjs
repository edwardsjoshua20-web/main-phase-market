import {
  getSupabaseInventoryConfig,
  restoreInventoryBackupItems
} from './lib/inventory-backup-client.mjs';

function valuesFor(name) {
  const prefix = `--${name}=`;
  return process.argv
    .filter((arg) => arg.startsWith(prefix))
    .flatMap((arg) => arg.slice(prefix.length).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function valueFor(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

async function main() {
  const backupId = valueFor('backup-id');
  const entityIds = valuesFor('entity-id');
  const reason = valueFor('reason', 'manual-restore');

  if (!backupId) {
    throw new Error('Usage: npm run inventory:restore -- --backup-id=<uuid> --entity-id=<id>');
  }
  if (entityIds.length === 0) {
    throw new Error('Restore requires at least one explicit --entity-id. Full-store restore is intentionally not exposed.');
  }

  const result = await restoreInventoryBackupItems(getSupabaseInventoryConfig(process.cwd()), {
    backupId,
    entityIds,
    reason
  });

  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((error) => {
  console.error('inventory restore failed:', error);
  process.exit(1);
});
