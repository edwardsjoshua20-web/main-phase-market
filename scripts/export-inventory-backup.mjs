import path from 'node:path';
import {
  createInventoryBackup,
  getInventoryBackupItems,
  getInventoryBackupRun,
  getSupabaseInventoryConfig,
  writeJsonArtifact
} from './lib/inventory-backup-client.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function main() {
  const config = getSupabaseInventoryConfig(process.cwd());
  const reason = argValue('reason', 'manual-export');
  const outputDir = argValue('out', path.join(process.cwd(), 'backups', 'inventory'));
  const backupId = await createInventoryBackup(config, {
    reason,
    createdBy: 'manual-export-script'
  });
  const [run, items] = await Promise.all([
    getInventoryBackupRun(config, backupId),
    getInventoryBackupItems(config, backupId)
  ]);
  const outputPath = path.join(outputDir, `inventory-backup-${backupId}.json`);

  writeJsonArtifact(outputPath, {
    exportedAt: new Date().toISOString(),
    backup: run,
    items
  });

  console.log(JSON.stringify({
    ok: true,
    backupId,
    outputPath,
    entityCount: items.length
  }, null, 2));
}

main().catch((error) => {
  console.error('inventory export failed:', error);
  process.exit(1);
});
