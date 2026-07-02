import fs from 'node:fs';
import path from 'node:path';
import { getGameSourceConfig } from './lib/source-registry.mjs';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/yugioh');
const OUTPUT_SETS_PATH = path.join(OUTPUT_ROOT, 'sets.json');
const API_ROOT = getGameSourceConfig('yugioh', 'api')?.url || 'https://db.ygoprodeck.com/api/v7';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 yugioh sets sync',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

function normalizeSet(set) {
  return {
    set_name: set?.set_name || '',
    set_code: set?.set_code || '',
    num_of_cards: Number(set?.num_of_cards || 0),
    tcg_date: set?.tcg_date || '',
    set_image: set?.set_image || ''
  };
}

async function main() {
  ensureDir(OUTPUT_ROOT);
  const sets = await fetchJson(`${API_ROOT}/cardsets.php`);
  const normalized = (Array.isArray(sets) ? sets : []).map(normalizeSet).sort((a, b) => {
    const dateCompare = String(b.tcg_date || '').localeCompare(String(a.tcg_date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a.set_name || '').localeCompare(String(b.set_name || ''));
  });

  fs.writeFileSync(OUTPUT_SETS_PATH, JSON.stringify(normalized, null, 2));
  console.log(`Yu-Gi-Oh set sync complete. Wrote ${normalized.length} sets.`);
}

main().catch((error) => {
  console.error('Yu-Gi-Oh set sync failed:', error);
  process.exitCode = 1;
});
