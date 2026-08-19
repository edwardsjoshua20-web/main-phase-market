import {
  createInventoryBackup,
  getInventoryBackupRun,
  getSupabaseInventoryConfig,
  writeJsonArtifact
} from './lib/inventory-backup-client.mjs';

const ROOT = process.cwd();
const resultPath = process.env.MPM_AUTOMATION_RESULT_PATH || '';

async function main() {
  const config = getSupabaseInventoryConfig(ROOT);
  const backupId = await createInventoryBackup(config, {
    reason: process.env.MPM_INVENTORY_BACKUP_REASON || 'scheduled-automation',
    createdBy: process.env.GITHUB_RUN_ID ? `github-actions:${process.env.GITHUB_RUN_ID}` : 'automation-runner'
  });
  const backup = await getInventoryBackupRun(config, backupId);

  const result = {
    ok: true,
    backupId,
    createdAt: backup?.created_at || new Date().toISOString(),
    entityCount: Number(backup?.entity_count || 0),
    cardCount: Number(backup?.card_count || 0),
    productCount: Number(backup?.product_count || 0),
    reason: backup?.reason || 'scheduled-automation'
  };

  if (resultPath) {
    writeJsonArtifact(resultPath, result);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('inventory backup failed:', error);
  process.exit(1);
});
