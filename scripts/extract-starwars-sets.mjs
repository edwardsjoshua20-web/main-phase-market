import fs from 'node:fs';
import path from 'node:path';
import { getGameSourceConfig } from './lib/source-registry.mjs';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/starwars');
const OUTPUT_SETS_PATH = path.join(OUTPUT_ROOT, 'sets.json');
const EXPORT_URL = getGameSourceConfig('starwars', 'exportApi')?.url || 'https://api.swuapi.com/export/all';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 starwars sets',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

function sortSets(sets) {
  return [...sets].sort((a, b) =>
    String(b?.release_date || '').localeCompare(String(a?.release_date || ''))
    || String(a?.code || '').localeCompare(String(b?.code || ''))
  );
}

async function main() {
  ensureDir(OUTPUT_ROOT);

  console.log('Fetching live Star Wars Unlimited sets...');
  const payload = await fetchJson(EXPORT_URL);
  const sets = Array.isArray(payload?.sets) ? payload.sets : [];
  const normalizedSets = sortSets(sets);

  fs.writeFileSync(OUTPUT_SETS_PATH, JSON.stringify(normalizedSets, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    source_url: EXPORT_URL,
    final_set_count: normalizedSets.length
  };

  console.log('Star Wars set extraction complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Star Wars set extraction failed:', error);
  process.exitCode = 1;
});
