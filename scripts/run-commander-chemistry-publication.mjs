import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import {
  downloadCommanderCorpusState,
  exportCommanderCorpusState,
  uploadCommanderCorpusState
} from './lib/commander-corpus-state.mjs';

const projectRoot = process.cwd();
const statePath = path.join(projectRoot, '.runtime', 'commander', 'commander-corpus.db');
const uploadStatePath = path.join(projectRoot, '.runtime', 'commander', 'commander-corpus-upload.db');
const manifestPath = path.join(projectRoot, 'public', 'data', 'mtg', 'commander-manifest.json');
const childEnv = {
  ...process.env,
  MPM_DB_PATH: statePath,
  MPM_DISABLE_COMMANDER_PREWARM: '1'
};

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    env: childEnv,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}.`);
}

function setFreshness(values) {
  const database = new Database(statePath);
  try {
    const statement = database.prepare(`
      INSERT INTO mtg_commander_pipeline_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const transaction = database.transaction(() => {
      for (const [key, value] of Object.entries(values)) statement.run(key, String(value));
    });
    transaction();
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

async function uploadState() {
  exportCommanderCorpusState(statePath, uploadStatePath);
  return uploadCommanderCorpusState(uploadStatePath);
}

await downloadCommanderCorpusState(statePath);
// Match the scheduled runner's catalog inputs without invoking discovery or ingestion.
runNode('scripts/hydrate-supabase-public-data.mjs');
runNode('scripts/build-mtg-commander-public-data.mjs');
runNode('scripts/certify-commander-analytics.mjs');

const builtManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
setFreshness({
  last_analytics_rebuild_time: builtManifest.generated_at,
  last_successful_aggregation_time: builtManifest.generated_at,
  latest_built_dataset_id: builtManifest.dataset_version,
  publication_status: 'pending'
});

try {
  runNode('scripts/publish-mtg-commander-public-data.mjs');
  runNode('scripts/verify-deck-chemistry-pipeline.mjs', [
    '--state', statePath,
    '--manifest', manifestPath,
    '--minimum-attempted', '0'
  ]);
} catch (error) {
  await uploadState();
  throw error;
}

const stateUpload = await uploadState();
const publishedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(JSON.stringify({
  status: 'PASS',
  mode: 'publication-only',
  ingestion_run: false,
  dataset_version: publishedManifest.dataset_version,
  publication_time: publishedManifest.last_publication_time,
  commander_profiles: publishedManifest.detail_count,
  state: stateUpload
}, null, 2));
