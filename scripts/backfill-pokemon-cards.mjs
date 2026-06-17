import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_PATH = 'C:/Users/Admin/Desktop/Pokemon Cards/all_pokemon_cards.json';
const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/pokemon');
const OUTPUT_CARDS_PATH = path.join(OUTPUT_ROOT, 'cards.json');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_ROOT, 'cards-manifest.json');
const API_ROOT = 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 250;
const CONCURRENCY = Number(process.env.POKEMON_BACKFILL_CONCURRENCY || 8);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isLikelyPokemonCard(entry) {
  return Boolean(entry?.supertype || entry?.number || entry?.images?.small || entry?.images?.large);
}

function normalizeExistingCards(entries) {
  return entries.filter(isLikelyPokemonCard);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 pokemon backfill',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchAllLiveIds() {
  const firstPage = await fetchJson(`${API_ROOT}/cards?page=1&pageSize=${PAGE_SIZE}&select=id`);
  const totalCount = Number(firstPage.totalCount || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const ids = new Set((firstPage.data || []).map((card) => card.id).filter(Boolean));

  for (let page = 2; page <= totalPages; page += 1) {
    const payload = await fetchJson(`${API_ROOT}/cards?page=${page}&pageSize=${PAGE_SIZE}&select=id`);
    for (const card of payload.data || []) {
      if (card?.id) ids.add(card.id);
    }
  }

  return {
    totalCount,
    ids: [...ids]
  };
}

async function fetchCardById(id) {
  const payload = await fetchJson(`${API_ROOT}/cards/${encodeURIComponent(id)}`);
  return payload?.data || null;
}

async function runPool(items, concurrency, worker) {
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current, index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runWorker()));
}

function sortCards(cards) {
  return [...cards].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

async function main() {
  const sourcePath = process.env.POKEMON_SOURCE_PATH || process.argv[2] || DEFAULT_SOURCE_PATH;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Pokemon source file not found: ${sourcePath}`);
  }

  ensureDir(OUTPUT_ROOT);

  const rawSource = readJson(sourcePath);
  const sourceEntries = Array.isArray(rawSource) ? rawSource : Array.isArray(rawSource?.data) ? rawSource.data : [];
  const existingCards = normalizeExistingCards(sourceEntries);
  const existingIds = new Set(existingCards.map((card) => card.id).filter(Boolean));

  console.log(`Loaded ${sourceEntries.length} source entries, ${existingCards.length} of which look like cards.`);
  console.log('Fetching live Pokemon card ID index...');
  const { totalCount: liveTotalCount, ids: liveIds } = await fetchAllLiveIds();

  const missingIds = liveIds.filter((id) => !existingIds.has(id));
  console.log(`Live API reports ${liveTotalCount} cards. Found ${missingIds.length} missing card IDs to backfill.`);

  const fetchedCards = [];
  const failedIds = [];

  await runPool(missingIds, CONCURRENCY, async (id, completedIndex) => {
    try {
      const card = await fetchCardById(id);
      if (card) {
        fetchedCards.push(card);
      } else {
        failedIds.push(id);
      }

      if (completedIndex % 25 === 0 || completedIndex === missingIds.length) {
        console.log(`Fetched ${completedIndex}/${missingIds.length} missing Pokemon cards...`);
      }
    } catch (error) {
      failedIds.push(id);
      console.error(`Pokemon card backfill failed for ${id}: ${error.message}`);
    }
  });

  const mergedById = new Map();
  for (const card of existingCards) {
    if (card?.id) mergedById.set(card.id, card);
  }
  for (const card of fetchedCards) {
    if (card?.id) mergedById.set(card.id, card);
  }

  const finalCards = sortCards([...mergedById.values()]);
  fs.writeFileSync(OUTPUT_CARDS_PATH, JSON.stringify(finalCards, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    source_path: sourcePath,
    source_entries: sourceEntries.length,
    source_card_entries: existingCards.length,
    live_total_count: liveTotalCount,
    missing_ids_discovered: missingIds.length,
    fetched_missing_cards: fetchedCards.length,
    failed_missing_ids: failedIds.length,
    final_card_count: finalCards.length
  };

  fs.writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify({
    ...manifest,
    failed_ids: failedIds
  }, null, 2));

  console.log('Pokemon card backfill complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Pokemon card backfill failed:', error);
  process.exitCode = 1;
});
