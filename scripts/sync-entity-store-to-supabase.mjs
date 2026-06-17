import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}

const repoRoot = process.cwd();
const env = {
  ...parseEnvFile(path.join(repoRoot, '.env.local')),
  ...parseEnvFile(path.join(repoRoot, '.env')),
  ...process.env
};

const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const dbPath = path.join(repoRoot, 'server', 'data', 'main-phase-market.db');
if (!fs.existsSync(dbPath)) {
  throw new Error(`SQLite database not found at ${dbPath}`);
}

const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(`
  SELECT entity_name, id, data, created_date, updated_date
  FROM entity_records
  ORDER BY entity_name, created_date ASC
`).all();

const payload = rows.map((row) => ({
  entity_name: row.entity_name,
  id: row.id,
  created_date: row.created_date,
  updated_date: row.updated_date,
  data: JSON.parse(row.data)
}));

if (payload.length === 0) {
  console.log('No entity records found to sync.');
  process.exit(0);
}

const chunkSize = 250;
for (let i = 0; i < payload.length; i += chunkSize) {
  const chunk = payload.slice(i, i + chunkSize);
  const response = await fetch(`${supabaseUrl}/rest/v1/app_entities`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(chunk)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase sync failed at chunk ${i / chunkSize + 1}`);
  }

  console.log(`Synced ${Math.min(i + chunk.length, payload.length)} / ${payload.length} entity records`);
}

console.log('Entity store sync complete.');
