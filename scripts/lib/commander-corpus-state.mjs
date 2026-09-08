import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { readSupabaseUploadConfig, toObjectKey } from './supabase-public-data-upload.mjs';

const STATE_TABLES = [
  'mtg_commander_corpus_sources',
  'mtg_commander_corpus_decks',
  'mtg_commander_corpus_cards',
  'mtg_commander_pipeline_meta'
];

function stateConfig(projectRoot = process.cwd()) {
  const config = readSupabaseUploadConfig(projectRoot);
  return {
    ...config,
    bucketName: config.env.MPM_COMMANDER_STATE_BUCKET || 'main-phase-market-automation',
    objectPath: config.env.MPM_COMMANDER_STATE_OBJECT || 'commander/commander-corpus.db'
  };
}

function objectUrl(config) {
  return `${String(config.supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(config.bucketName)}/${toObjectKey(config.objectPath)}`;
}

function authHeaders(config) {
  return {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey
  };
}

export async function downloadCommanderCorpusState(destinationPath, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const config = stateConfig(projectRoot);
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error('Supabase Commander state credentials are required.');
  const response = await fetch(objectUrl(config), { headers: authHeaders(config) });
  if (response.status === 404 && options.allowMissing) return { found: false, config };
  if (!response.ok) throw new Error(`Commander state download failed: ${response.status} ${await response.text()}`);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, Buffer.from(await response.arrayBuffer()));
  return { found: true, bytes: fs.statSync(destinationPath).size, config };
}

export async function uploadCommanderCorpusState(sourcePath, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const config = stateConfig(projectRoot);
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error('Supabase Commander state credentials are required.');
  const response = await fetch(objectUrl(config), {
    method: 'POST',
    headers: {
      ...authHeaders(config),
      'Content-Type': 'application/vnd.sqlite3',
      'x-upsert': 'true'
    },
    body: fs.readFileSync(sourcePath)
  });
  if (!response.ok) throw new Error(`Commander state upload failed: ${response.status} ${await response.text()}`);
  return { bytes: fs.statSync(sourcePath).size, bucketName: config.bucketName, objectPath: config.objectPath };
}

export function exportCommanderCorpusState(sourcePath, destinationPath) {
  const source = new Database(sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (fs.existsSync(destinationPath)) fs.rmSync(destinationPath);
  try {
    source.pragma('wal_checkpoint(PASSIVE)');
    source.prepare('ATTACH DATABASE ? AS commander_state').run(destinationPath);
    for (const table of STATE_TABLES) {
      const schema = source.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)?.sql;
      if (!schema) throw new Error(`Commander state export is missing required table ${table}.`);
      source.exec(schema.replace(/^CREATE TABLE(?: IF NOT EXISTS)?\s+/i, 'CREATE TABLE commander_state.'));
      source.exec(`INSERT INTO commander_state.${table} SELECT * FROM main.${table}`);
    }
    source.exec('DETACH DATABASE commander_state');
  } finally {
    source.close();
  }
  return { tables: [...STATE_TABLES], bytes: fs.statSync(destinationPath).size };
}
