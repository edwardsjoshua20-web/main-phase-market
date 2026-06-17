import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/fab');
const OUTPUT_SETS_PATH = path.join(OUTPUT_ROOT, 'sets.json');
const FAB_SETS_URL = 'https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/develop/json/english/set.json';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 fab sets',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

function normalizeSet(entry) {
  const firstPrinting = Array.isArray(entry?.printings) ? entry.printings[0] : null;
  return {
    id: entry?.id || '',
    code: entry?.id || '',
    name: entry?.name || entry?.id || '',
    released_at: firstPrinting?.initial_release_date || null,
    out_of_print: Boolean(firstPrinting?.out_of_print),
    set_logo: firstPrinting?.set_logo || null,
    card_gallery: firstPrinting?.card_gallery || null,
    product_page: firstPrinting?.product_page || null,
    card_database: firstPrinting?.card_database || null
  };
}

async function main() {
  ensureDir(OUTPUT_ROOT);

  console.log('Fetching live Flesh and Blood sets...');
  const sets = await fetchJson(FAB_SETS_URL);
  const normalizedSets = (Array.isArray(sets) ? sets : [])
    .map(normalizeSet)
    .filter((set) => set.code)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  fs.writeFileSync(OUTPUT_SETS_PATH, JSON.stringify(normalizedSets, null, 2));

  console.log('FAB set extraction complete.');
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    source_url: FAB_SETS_URL,
    final_set_count: normalizedSets.length
  }, null, 2));
}

main().catch((error) => {
  console.error('FAB set extraction failed:', error);
  process.exitCode = 1;
});
