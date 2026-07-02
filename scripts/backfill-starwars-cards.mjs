import fs from 'node:fs';
import path from 'node:path';
import { getGameSourceConfig } from './lib/source-registry.mjs';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/starwars');
const OUTPUT_CARDS_PATH = path.join(OUTPUT_ROOT, 'cards.json');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_ROOT, 'cards-manifest.json');
const EXPORT_URL = getGameSourceConfig('starwars', 'exportApi')?.url || 'https://api.swuapi.com/export/all';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 starwars backfill',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

function sortCards(cards) {
  return [...cards].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''))
    || String(a?.setCode || '').localeCompare(String(b?.setCode || ''))
    || String(a?.cardNumber || '').localeCompare(String(b?.cardNumber || ''), undefined, { numeric: true, sensitivity: 'base' })
  );
}

async function main() {
  ensureDir(OUTPUT_ROOT);

  console.log('Fetching live Star Wars Unlimited export...');
  const payload = await fetchJson(EXPORT_URL);
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  const normalizedCards = sortCards(cards);

  fs.writeFileSync(OUTPUT_CARDS_PATH, JSON.stringify(normalizedCards, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    source_url: EXPORT_URL,
    final_card_count: normalizedCards.length,
    total_sets: Array.isArray(payload?.sets) ? payload.sets.length : 0,
    source_meta: payload?.meta || null
  };

  fs.writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Star Wars card backfill complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Star Wars card backfill failed:', error);
  process.exitCode = 1;
});
