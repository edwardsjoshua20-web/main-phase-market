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

function readCorpusCounts() {
  const database = new Database(statePath, { readonly: true });
  try {
    const row = database.prepare(`
      SELECT
        COUNT(*) stored_decks,
        SUM(CASE WHEN lifecycle_status = 'active' AND quality_status = 'valid' THEN 1 ELSE 0 END) active_decks,
        SUM(CASE WHEN lifecycle_status = 'active' AND quality_status = 'valid' AND chemistry_weight > 0 THEN 1 ELSE 0 END) unique_configurations,
        SUM(CASE WHEN lifecycle_status = 'quarantined' THEN 1 ELSE 0 END) quarantined_decks,
        SUM(CASE WHEN lifecycle_status = 'retired' THEN 1 ELSE 0 END) retired_decks
      FROM mtg_commander_corpus_decks
    `).get();
    const sourceFailures = database.prepare(`SELECT COUNT(*) count FROM mtg_commander_corpus_sources WHERE status = 'error'`).get().count;
    return {
      stored_decks: Number(row.stored_decks || 0),
      active_decks: Number(row.active_decks || 0),
      unique_configurations: Number(row.unique_configurations || 0),
      duplicate_observations: Math.max(0, Number(row.active_decks || 0) - Number(row.unique_configurations || 0)),
      quarantined_decks: Number(row.quarantined_decks || 0),
      retired_decks: Number(row.retired_decks || 0),
      source_failures: Number(sourceFailures || 0)
    };
  } finally {
    database.close();
  }
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

function certifyCorpusStorage() {
  const database = new Database(statePath);
  try {
    database.exec('REINDEX');
    const integrity = database.pragma('integrity_check');
    const failures = integrity.filter((row) => row.integrity_check !== 'ok');
    if (failures.length > 0) {
      throw new Error(`Commander corpus integrity check failed: ${failures[0].integrity_check}`);
    }
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

async function uploadFilteredCommanderState() {
  certifyCorpusStorage();
  exportCommanderCorpusState(statePath, uploadStatePath);
  return uploadCommanderCorpusState(uploadStatePath);
}

await downloadCommanderCorpusState(statePath);
certifyCorpusStorage();
const before = readCorpusCounts();
const previousDatasetVersion = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).dataset_version || null
  : null;

runNode('scripts/commander-archidekt-bot.mjs', [
  '--once',
  '--pages', '1',
  '--start-page', '1',
  '--max-page', '1',
  '--batch-size', '5',
  '--order-by', '-viewCount',
  '--request-delay-ms', '1500',
  '--max-retries', '2'
]);
runNode('scripts/certify-commander-ingestion.mjs');
runNode('scripts/build-mtg-commander-public-data.mjs');
runNode('scripts/certify-commander-analytics.mjs');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
setFreshness({ last_analytics_rebuild_time: manifest.generated_at });
await uploadFilteredCommanderState();

const publicationTime = new Date().toISOString();
manifest.last_publication_time = publicationTime;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
runNode('scripts/publish-mtg-commander-public-data.mjs');
setFreshness({ last_publication_time: publicationTime });
const stateUpload = await uploadFilteredCommanderState();
const after = readCorpusCounts();

if (manifest.dataset_version === previousDatasetVersion && after.active_decks !== before.active_decks) {
  throw new Error('Commander corpus changed but the analytics dataset version did not advance.');
}

console.log(JSON.stringify({
  status: 'PASS',
  previous_dataset_version: previousDatasetVersion,
  dataset_version: manifest.dataset_version,
  analytics_version: manifest.analytics_version,
  publication_time: publicationTime,
  before,
  after,
  state: stateUpload
}, null, 2));
