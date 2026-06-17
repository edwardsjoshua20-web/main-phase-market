import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/fab');
const OUTPUT_CARDS_PATH = path.join(OUTPUT_ROOT, 'cards.json');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_ROOT, 'cards-manifest.json');
const FAB_CARDS_URL = 'https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/develop/json/english/card.json';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 fab backfill',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

function sortCards(cards) {
  return [...cards].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))
    || String(a?.unique_id || '').localeCompare(String(b?.unique_id || '')));
}

async function main() {
  ensureDir(OUTPUT_ROOT);

  console.log('Fetching live Flesh and Blood cards...');
  const cards = await fetchJson(FAB_CARDS_URL);
  const normalizedCards = Array.isArray(cards) ? sortCards(cards) : [];

  fs.writeFileSync(OUTPUT_CARDS_PATH, JSON.stringify(normalizedCards, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    source_url: FAB_CARDS_URL,
    final_card_count: normalizedCards.length
  };

  fs.writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('FAB card backfill complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('FAB card backfill failed:', error);
  process.exitCode = 1;
});
