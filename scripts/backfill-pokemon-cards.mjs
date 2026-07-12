import fs from 'node:fs';
import path from 'node:path';
import { getGameSourceConfig, resolveConfiguredSourcePath } from './lib/source-registry.mjs';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/pokemon');
const OUTPUT_CARDS_PATH = path.join(OUTPUT_ROOT, 'cards.json');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_ROOT, 'cards-manifest.json');
const DEFAULT_SOURCE_PATH = resolveConfiguredSourcePath('pokemon', 'catalogSource');
const API_ROOT = getGameSourceConfig('pokemon', 'api')?.url || 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 250;
const CONCURRENCY = Number(process.env.POKEMON_BACKFILL_CONCURRENCY || 4);
const DEFAULT_MAX_MISSING = Number(process.env.POKEMON_BACKFILL_MAX_MISSING || 500);
const MAX_RETRIES = Number(process.env.POKEMON_BACKFILL_MAX_RETRIES || 4);
const BASE_DELAY_MS = Number(process.env.POKEMON_BACKFILL_BASE_DELAY_MS || 1500);
const FETCH_TIMEOUT_MS = Number(process.env.POKEMON_BACKFILL_FETCH_TIMEOUT_MS || 20000);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 pokemon backfill',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const error = new Error(`Failed to fetch ${url}: ${response.status}`);
    error.status = response.status;
    error.retryAfter = response.headers.get('retry-after');
    throw error;
  }

  return response.json();
}

function parseArgs(argv) {
  const options = {
    sourcePath: null,
    maxMissing: DEFAULT_MAX_MISSING
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--max-missing') {
      options.maxMissing = Number(argv[index + 1] || DEFAULT_MAX_MISSING);
      index += 1;
      continue;
    }

    if (!options.sourcePath && !String(arg).startsWith('--')) {
      options.sourcePath = arg;
    }
  }

  return options;
}

function getRetryDelayMs(error, attempt) {
  const retryAfterHeader = error?.retryAfter;
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  return BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
}

async function fetchJsonWithRetry(url, label = 'Pokemon API request') {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fetchJson(url);
    } catch (error) {
      const retryable = error?.status === 429 || error?.status === 504 || (error?.status >= 500 && error?.status < 600);
      if (!retryable || attempt === MAX_RETRIES) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt);
      console.warn(`${label} hit ${error.status}. Retry ${attempt}/${MAX_RETRIES - 1} after ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  return null;
}

async function fetchAllLiveIds() {
  const firstPage = await fetchJsonWithRetry(`${API_ROOT}/cards?page=1&pageSize=${PAGE_SIZE}&select=id`, 'Pokemon live index page 1');
  const totalCount = Number(firstPage.totalCount || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const ids = new Set((firstPage.data || []).map((card) => card.id).filter(Boolean));

  console.log(`Pokemon live index page 1/${totalPages} loaded.`);

  for (let page = 2; page <= totalPages; page += 1) {
    const payload = await fetchJsonWithRetry(`${API_ROOT}/cards?page=${page}&pageSize=${PAGE_SIZE}&select=id`, `Pokemon live index page ${page}`);
    for (const card of payload.data || []) {
      if (card?.id) ids.add(card.id);
    }

    if (page % 10 === 0 || page === totalPages) {
      console.log(`Pokemon live index page ${page}/${totalPages} loaded.`);
    }
  }

  return {
    totalCount,
    ids: [...ids],
    totalPages
  };
}

async function fetchCardByIdWithRetry(id) {
  const payload = await fetchJsonWithRetry(`${API_ROOT}/cards/${encodeURIComponent(id)}`, `Pokemon card ${id}`);
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
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = process.env.POKEMON_SOURCE_PATH || options.sourcePath || DEFAULT_SOURCE_PATH;
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
  let liveIndex;
  try {
    liveIndex = await fetchAllLiveIds();
  } catch (error) {
    if (existingCards.length === 0) {
      throw error;
    }

    const finalCards = sortCards(existingCards);
    fs.writeFileSync(OUTPUT_CARDS_PATH, JSON.stringify(finalCards, null, 2));

    const manifest = {
      generated_at: new Date().toISOString(),
      status: 'source-preserved-live-index-unavailable',
      source_path: sourcePath,
      source_entries: sourceEntries.length,
      source_card_entries: existingCards.length,
      live_total_count: null,
      live_total_pages: null,
      missing_ids_discovered: null,
      max_missing_per_run: 0,
      queued_missing_ids: 0,
      fetched_missing_cards: 0,
      failed_missing_ids: 0,
      final_card_count: finalCards.length,
      queue_completed: false,
      warning: `Live Pokemon index unavailable; preserved existing source catalog. ${error.message}`,
      retry_policy: {
        concurrency: CONCURRENCY,
        max_retries: MAX_RETRIES,
        base_delay_ms: BASE_DELAY_MS,
        fetch_timeout_ms: FETCH_TIMEOUT_MS
      }
    };

    fs.writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.warn(manifest.warning);
    console.log('Pokemon card backfill completed with preserved source catalog.');
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  const { totalCount: liveTotalCount, ids: liveIds, totalPages } = liveIndex;

  const missingIds = liveIds.filter((id) => !existingIds.has(id));
  const maxMissing = Number.isFinite(options.maxMissing) && options.maxMissing > 0 ? options.maxMissing : DEFAULT_MAX_MISSING;
  const queuedMissingIds = missingIds.slice(0, maxMissing);

  console.log(`Live API reports ${liveTotalCount} cards across ${totalPages} pages.`);
  console.log(`Found ${missingIds.length} missing card IDs; queueing ${queuedMissingIds.length} this run.`);

  const fetchedCards = [];
  const failedIds = [];

  await runPool(queuedMissingIds, CONCURRENCY, async (id, completedIndex) => {
    try {
      const card = await fetchCardByIdWithRetry(id);
      if (card) {
        fetchedCards.push(card);
      } else {
        failedIds.push(id);
      }

      if (completedIndex % 25 === 0 || completedIndex === queuedMissingIds.length) {
        console.log(`Fetched ${completedIndex}/${queuedMissingIds.length} queued Pokemon cards...`);
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
    live_total_pages: totalPages,
    missing_ids_discovered: missingIds.length,
    max_missing_per_run: maxMissing,
    queued_missing_ids: queuedMissingIds.length,
    fetched_missing_cards: fetchedCards.length,
    failed_missing_ids: failedIds.length,
    final_card_count: finalCards.length,
    queue_completed: queuedMissingIds.length >= missingIds.length,
    retry_policy: {
      concurrency: CONCURRENCY,
      max_retries: MAX_RETRIES,
      base_delay_ms: BASE_DELAY_MS,
      fetch_timeout_ms: FETCH_TIMEOUT_MS
    }
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
