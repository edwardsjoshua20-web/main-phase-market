import fs from 'node:fs';
import path from 'node:path';

const snapshotPath = path.resolve(process.env.KAZAKARI_SNAPSHOT_PATH || path.join(process.cwd(), 'server', 'data', 'kazakari-preview.json'));
if (!/^D:\\/i.test(snapshotPath)) throw new Error('Kazakari snapshot input must remain on D:.');
const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const payload = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const response = await fetch(`${url}/rest/v1/kazakari_preview_snapshots?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify({ id: 'current', payload, generated_at: payload.generatedAt, updated_at: new Date().toISOString() }),
});
if (!response.ok) throw new Error(await response.text() || `Snapshot sync failed: ${response.status}`);
console.log(JSON.stringify({ synced: true, generatedAt: payload.generatedAt, products: payload.summary?.currentProducts ?? 0 }, null, 2));
