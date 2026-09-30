import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { downloadCommanderCorpusState } from './lib/commander-corpus-state.mjs';
import { readSupabaseUploadConfig } from './lib/supabase-public-data-upload.mjs';

function parseArgs(argv) {
  const args = {
    statePath: process.env.MPM_DB_PATH || path.join(process.cwd(), '.runtime', 'commander', 'commander-corpus.db'),
    manifestPath: path.join(process.cwd(), 'public', 'data', 'mtg', 'commander-manifest.json'),
    maxAgeHours: 48,
    minimumAttempted: 1,
    hosted: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--state') args.statePath = path.resolve(argv[index + 1]);
    if (token === '--manifest') args.manifestPath = path.resolve(argv[index + 1]);
    if (token === '--max-age-hours') args.maxAgeHours = Math.max(1, Number(argv[index + 1]) || args.maxAgeHours);
    if (token === '--minimum-attempted') args.minimumAttempted = Math.max(0, Number(argv[index + 1]) || 0);
    if (token === '--hosted') args.hosted = true;
  }

  return args;
}

function ageHours(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? (Date.now() - timestamp) / 3_600_000 : Number.POSITIVE_INFINITY;
}

function assertCheck(checks, condition, id, detail) {
  checks.push({ id, status: condition ? 'PASS' : 'FAIL', detail });
  return condition;
}

const args = parseArgs(process.argv.slice(2));
const checks = [];
let hostedTempDir = null;

if (args.hosted) {
  hostedTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpm-deck-chemistry-health-'));
  args.statePath = path.join(hostedTempDir, 'commander-corpus.db');
  args.manifestPath = path.join(hostedTempDir, 'commander-manifest.json');
  const state = await downloadCommanderCorpusState(args.statePath);
  const publicConfig = readSupabaseUploadConfig();
  const manifestUrl = `${String(state.config.supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/public/${encodeURIComponent(publicConfig.bucketName)}/data/mtg/commander-manifest.json`;
  const response = await fetch(manifestUrl, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`Hosted Commander manifest download failed: ${response.status}`);
  fs.writeFileSync(args.manifestPath, await response.text());
}

if (!fs.existsSync(args.statePath)) throw new Error(`Commander corpus state is missing: ${args.statePath}`);
if (!fs.existsSync(args.manifestPath)) throw new Error(`Commander manifest is missing: ${args.manifestPath}`);

const database = new Database(args.statePath, { readonly: true, fileMustExist: true });
let report;
try {
  const integrity = database.pragma('integrity_check');
  const meta = Object.fromEntries(database.prepare(
    'SELECT key, value FROM mtg_commander_pipeline_meta ORDER BY key'
  ).all().map((row) => [row.key, row.value]));
  const totals = database.prepare(`
    SELECT
      COUNT(*) stored_decks,
      SUM(lifecycle_status = 'active' AND quality_status = 'valid') active_decks,
      SUM(lifecycle_status = 'active' AND quality_status = 'valid' AND chemistry_weight > 0) unique_configurations,
      SUM(lifecycle_status = 'quarantined') quarantined_decks,
      SUM(lifecycle_status = 'retired') retired_decks
    FROM mtg_commander_corpus_decks
  `).get();
  const sources = database.prepare(`
    SELECT
      SUM(status = 'queued') queued,
      SUM(status = 'running') running,
      SUM(status = 'error') errors,
      MAX(last_finished_at) latest_finished_at
    FROM mtg_commander_corpus_sources
  `).get();
  const manifest = JSON.parse(fs.readFileSync(args.manifestPath, 'utf8'));
  const attempted = Number(meta.last_ingestion_attempted_count || 0);
  const activeDecks = Number(totals.active_decks || 0);
  const uniqueConfigurations = Number(totals.unique_configurations || 0);

  assertCheck(checks, integrity.every((row) => row.integrity_check === 'ok'), 'state-integrity', 'SQLite integrity check');
  assertCheck(
    checks,
    ageHours(meta.last_successful_discovery_time) <= args.maxAgeHours,
    'discovery-freshness',
    `last=${meta.last_successful_discovery_time || 'missing'} ageHours=${ageHours(meta.last_successful_discovery_time).toFixed(2)}`
  );
  assertCheck(
    checks,
    ageHours(meta.last_successful_ingestion_time) <= args.maxAgeHours,
    'ingestion-freshness',
    `last=${meta.last_successful_ingestion_time || 'missing'} ageHours=${ageHours(meta.last_successful_ingestion_time).toFixed(2)}`
  );
  assertCheck(
    checks,
    ageHours(meta.last_analytics_rebuild_time) <= args.maxAgeHours,
    'aggregation-freshness',
    `last=${meta.last_analytics_rebuild_time || 'missing'} ageHours=${ageHours(meta.last_analytics_rebuild_time).toFixed(2)}`
  );
  assertCheck(
    checks,
    ageHours(meta.last_publication_time) <= args.maxAgeHours,
    'publication-freshness',
    `last=${meta.last_publication_time || 'missing'} ageHours=${ageHours(meta.last_publication_time).toFixed(2)}`
  );
  if (Object.hasOwn(meta, 'last_ingestion_attempted_count')) {
    assertCheck(
      checks,
      attempted >= args.minimumAttempted,
      'bounded-throughput',
      `attempted=${attempted} minimum=${args.minimumAttempted}`
    );
  } else {
    checks.push({
      id: 'bounded-throughput',
      status: 'WARN',
      detail: 'The latest hosted state predates per-run throughput telemetry; the next repaired refresh will populate it.'
    });
  }
  assertCheck(
    checks,
    Number(manifest.active_deck_count || 0) === activeDecks,
    'manifest-active-count',
    `manifest=${Number(manifest.active_deck_count || 0)} corpus=${activeDecks}`
  );
  assertCheck(
    checks,
    Number(manifest.unique_content_configuration_count || 0) === uniqueConfigurations,
    'manifest-unique-count',
    `manifest=${Number(manifest.unique_content_configuration_count || 0)} corpus=${uniqueConfigurations}`
  );
  assertCheck(
    checks,
    Number(manifest.index_deck_total || 0) === activeDecks,
    'index-denominator',
    `index=${Number(manifest.index_deck_total || 0)} corpus=${activeDecks}`
  );

  report = {
    status: checks.every((check) => check.status !== 'FAIL') ? 'PASS' : 'FAIL',
    generated_at: new Date().toISOString(),
    thresholds: {
      max_age_hours: args.maxAgeHours,
      minimum_attempted: args.minimumAttempted
    },
    state: {
      stored_decks: Number(totals.stored_decks || 0),
      active_decks: activeDecks,
      unique_configurations: uniqueConfigurations,
      quarantined_decks: Number(totals.quarantined_decks || 0),
      retired_decks: Number(totals.retired_decks || 0),
      queued_sources: Number(sources.queued || 0),
      running_sources: Number(sources.running || 0),
      error_sources: Number(sources.errors || 0),
      latest_source_finish: sources.latest_finished_at || null
    },
    last_run: {
      started_at: meta.last_ingestion_start_time || null,
      succeeded_at: meta.last_successful_ingestion_time || null,
      attempted: attempted,
      fetched: Number(meta.last_ingestion_fetched_count || 0),
      accepted: Number(meta.last_ingestion_accepted_count || 0),
      rejected: Number(meta.last_ingestion_rejected_count || 0),
      deduplicated: Number(meta.last_ingestion_deduplicated_count || 0),
      errors: Number(meta.last_ingestion_error_count || 0),
      latest_error_at: meta.last_ingestion_error_time || null,
      latest_error: meta.last_ingestion_error || null,
      next_archidekt_page: Number(meta.archidekt_next_start_page || 1)
    },
    freshness: {
      discovery: meta.last_successful_discovery_time || null,
      ingestion: meta.last_successful_ingestion_time || null,
      aggregation: meta.last_analytics_rebuild_time || null,
      publication: meta.last_publication_time || null,
      dataset_generated: manifest.generated_at || null
    },
    checks
  };
} finally {
  database.close();
}

console.log(JSON.stringify(report, null, 2));
if (hostedTempDir) fs.rmSync(hostedTempDir, { recursive: true, force: true });
if (report.status !== 'PASS') process.exitCode = 1;
