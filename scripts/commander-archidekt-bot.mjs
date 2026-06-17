import fs from 'node:fs';
import path from 'node:path';
import {
  cleanupCommanderCorpusSourceQueue,
  ensureCommanderCorpusTables,
  getCommanderCorpusStatus,
  loadCommanderSourceManifest,
  processCommanderCorpusSource,
  syncCommanderCorpusSources
} from '../server/mtgCommanderCorpus.mjs';

const repoRoot = process.cwd();
const ingestDir = path.join(repoRoot, 'tmp', 'commander-ingest');
const manifestPath = path.join(ingestDir, 'sources.json');
const statusPath = path.join(ingestDir, 'archidekt-bot-status.json');

function parseArgs(argv) {
  const args = {
    pollMs: 60000,
    batchSize: 10,
    pages: 10,
    orderBy: '-updatedAt',
    backoffMs: 300000,
    startPage: 1,
    maxPage: 200,
    maxQueue: 1500,
    discoverMode: 'api'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--poll-ms') args.pollMs = Math.max(10000, Number(argv[i + 1]) || args.pollMs);
    if (token === '--batch-size') args.batchSize = Math.max(1, Number(argv[i + 1]) || args.batchSize);
    if (token === '--pages') args.pages = Math.max(1, Number(argv[i + 1]) || args.pages);
    if (token === '--order-by') args.orderBy = String(argv[i + 1] || args.orderBy);
    if (token === '--backoff-ms') args.backoffMs = Math.max(30000, Number(argv[i + 1]) || args.backoffMs);
    if (token === '--start-page') args.startPage = Math.max(1, Number(argv[i + 1]) || args.startPage);
    if (token === '--max-page') args.maxPage = Math.max(1, Number(argv[i + 1]) || args.maxPage);
    if (token === '--max-queue') args.maxQueue = Math.max(1, Number(argv[i + 1]) || args.maxQueue);
    if (token === '--discover-mode') args.discoverMode = String(argv[i + 1] || args.discoverMode);
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeStatus(payload) {
  ensureDir(ingestDir);
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2));
}

function readStatus() {
  if (!fs.existsSync(statusPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeArchidektDeckUrl(url) {
  const match = String(url).match(/archidekt\.com\/decks\/(\d+)/i);
  if (!match) return null;
  return `https://archidekt.com/decks/${match[1]}`;
}

function isCloudflareBlockPage(text) {
  const value = String(text || '');
  return value.includes('Attention Required! | Cloudflare')
    || value.includes('Sorry, you have been blocked')
    || value.includes('cf-error-details');
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/json',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after')) || 0;
    const retryMs = retryAfter > 0 ? retryAfter * 1000 : 0;
    const error = new Error(`Fetch failed for ${url}: 429 Too Many Requests`);
    error.code = 'RATE_LIMITED';
    error.retryAfterMs = retryMs;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (isCloudflareBlockPage(text)) {
    throw new Error(`Cloudflare blocked access to ${url}`);
  }

  return text;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after')) || 0;
    const retryMs = retryAfter > 0 ? retryAfter * 1000 : 0;
    const error = new Error(`Fetch failed for ${url}: 429 Too Many Requests`);
    error.code = 'RATE_LIMITED';
    error.retryAfterMs = retryMs;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (isCloudflareBlockPage(text)) {
    throw new Error(`Cloudflare blocked access to ${url}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Fetch failed for ${url}: invalid JSON`);
  }
}

function extractArchidektDeckUrls(text) {
  const matches = text.match(/https?:\/\/archidekt\.com\/decks\/\d+/gi) || [];
  const relativeMatches = [...text.matchAll(/\/decks\/(\d+)/gi)].map((match) => `https://archidekt.com/decks/${match[1]}`);
  return [...new Set([...matches, ...relativeMatches].map(normalizeArchidektDeckUrl).filter(Boolean))];
}

function extractArchidektDeckUrlsFromApi(payload) {
  if (!payload) return [];
  const candidates = [];
  const rows = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.decks)
      ? payload.decks
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  for (const row of rows) {
    const id = row?.id ?? row?.deckId ?? row?.deck_id;
    if (!id) continue;
    candidates.push(`https://archidekt.com/decks/${id}`);
  }

  return [...new Set(candidates.map(normalizeArchidektDeckUrl).filter(Boolean))];
}

function buildSearchUrls(args, startPage) {
  const urls = [];
  for (let offset = 0; offset < args.pages; offset += 1) {
    const page = startPage + offset;
    if (args.discoverMode === 'html') {
      const url = new URL('https://archidekt.com/search/decks');
      url.searchParams.set('orderBy', args.orderBy);
      if (page > 1) {
        url.searchParams.set('page', String(page));
      }
      urls.push(url.toString());
    } else {
      const url = new URL('https://archidekt.com/api/decks/search/');
      url.searchParams.set('orderBy', args.orderBy);
      if (page > 1) {
        url.searchParams.set('page', String(page));
      }
      urls.push(url.toString());
    }
  }
  return urls;
}

function toManifestEntry(url) {
  return {
    label: `Archidekt Deck ${url.split('/').at(-1)}`,
    source_type: 'archidekt_deck',
    source_name: 'archidekt',
    location: url
  };
}

function mergeEntries(existingEntries, newEntries) {
  const byLocation = new Map(existingEntries.map((entry) => [entry.location, entry]));
  for (const entry of newEntries) {
    if (!byLocation.has(entry.location)) {
      byLocation.set(entry.location, entry);
    }
  }
  return [...byLocation.values()].sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
}

async function discoverEntries(args, corpusStatus) {
  const queuedArchidekt = Array.isArray(corpusStatus?.sources)
    ? corpusStatus.sources.filter((source) => source.source_name === 'archidekt' && source.source_type === 'archidekt_deck' && source.status === 'queued' && source.source_id).length
    : 0;

  if (queuedArchidekt >= args.maxQueue) {
    const status = readStatus();
    const pausedStartPage = Math.max(1, Number(status?.next_start_page) || args.startPage);
    return {
      deckUrls: [],
      pageResults: [],
      rateLimited: false,
      retryAfterMs: 0,
      startPage: pausedStartPage,
      nextStartPage: pausedStartPage,
      discoveryPaused: true,
      queuedArchidekt
    };
  }

  const status = readStatus();
  const startPage = Math.max(1, Number(status?.next_start_page) || args.startPage);
  const urls = buildSearchUrls(args, startPage);
  const discovered = new Set();
  const pageResults = [];
  let rateLimited = false;
  let retryAfterMs = 0;
  let highestSucceededPage = startPage - 1;

  for (const url of urls) {
    try {
      let deckUrls = [];
      if (args.discoverMode === 'html') {
        const text = await fetchText(url);
        deckUrls = extractArchidektDeckUrls(text);
      } else {
        const payload = await fetchJson(url);
        deckUrls = extractArchidektDeckUrlsFromApi(payload);
        if (deckUrls.length === 0) {
          const text = await fetchText(url.replace('/api', ''));
          deckUrls = extractArchidektDeckUrls(text);
        }
      }
      pageResults.push({ url, discovered: deckUrls.length });
      const currentPage = Number(new URL(url).searchParams.get('page') || '1');
      highestSucceededPage = Math.max(highestSucceededPage, currentPage);
      for (const deckUrl of deckUrls) {
        discovered.add(deckUrl);
      }
    } catch (error) {
      if (error.code === 'RATE_LIMITED') {
        rateLimited = true;
        retryAfterMs = Math.max(retryAfterMs, Number(error.retryAfterMs) || 0);
        pageResults.push({ url, error: error.message, rate_limited: true });
        break;
      }
      pageResults.push({ url, error: error.message });
    }
  }

  return {
    deckUrls: [...discovered],
    pageResults,
    rateLimited,
    retryAfterMs,
    startPage,
    nextStartPage: rateLimited
      ? startPage
      : highestSucceededPage >= args.maxPage
        ? 1
        : highestSucceededPage + 1,
    discoveryPaused: false,
    queuedArchidekt
  };
}

async function processQueuedSources(args, corpusStatus) {
  const queued = corpusStatus.sources
    .filter((source) => (
      source.source_name === 'archidekt'
      && source.source_type === 'archidekt_deck'
      && source.source_id
      && source.status === 'queued'
    ))
    .slice(0, args.batchSize);

  const processed = [];
  for (const source of queued) {
    try {
      processed.push(await processCommanderCorpusSource(source.source_id, {
        downloadsDir: path.join(ingestDir, 'downloads')
      }));
    } catch (error) {
      processed.push({
        source_id: source.source_id,
        status: 'error',
        error: error.message
      });
    }
  }

  return processed;
}

async function tick(args) {
  cleanupCommanderCorpusSourceQueue();
  const corpusBefore = getCommanderCorpusStatus();
  const existing = loadCommanderSourceManifest(manifestPath);
  const discovery = await discoverEntries(args, corpusBefore);
  const newEntries = discovery.deckUrls.map(toManifestEntry);
  const merged = mergeEntries(existing, newEntries);
  ensureDir(ingestDir);
  fs.writeFileSync(manifestPath, JSON.stringify(merged, null, 2));
  syncCommanderCorpusSources(merged);

  const corpusQueued = getCommanderCorpusStatus();
  const processed = await processQueuedSources(args, corpusQueued);
  const corpus = getCommanderCorpusStatus();
  const processedSummary = processed.reduce((accumulator, item) => {
    const key = item.skipped
      ? `skipped:${item.skipped_reason || 'unknown'}`
      : `${item.status || 'unknown'}`;
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  writeStatus({
    generated_at: new Date().toISOString(),
    poll_ms: args.pollMs,
    pages: args.pages,
    start_page: discovery.startPage,
    next_start_page: discovery.nextStartPage,
    max_page: args.maxPage,
    order_by: args.orderBy,
    discovered_urls: discovery.deckUrls.length,
    page_results: discovery.pageResults,
    rate_limited: discovery.rateLimited,
    retry_after_ms: discovery.retryAfterMs,
    processed,
    processed_summary: processedSummary,
    discovery_paused: discovery.discoveryPaused,
    queued_archidekt: discovery.queuedArchidekt,
    corpus
  });

  return {
    addedCandidates: Math.max(0, merged.length - existing.length),
    processedCount: processed.length,
    corpus,
    rateLimited: discovery.rateLimited,
    retryAfterMs: discovery.retryAfterMs,
    processedSummary,
    discoveryPaused: discovery.discoveryPaused,
    queuedArchidekt: discovery.queuedArchidekt
  };
}

async function main() {
  ensureCommanderCorpusTables();
  const args = parseArgs(process.argv.slice(2));
  let extraSleepMs = 0;

  console.log(`[archidekt-bot] polling every ${args.pollMs}ms`);
  console.log(`[archidekt-bot] search pages per tick: ${args.pages}`);
  console.log(`[archidekt-bot] batch size: ${args.batchSize}`);

  while (true) {
    try {
      const result = await tick(args);
      const discoveryLabel = result.discoveryPaused
        ? `discovery=paused(queue:${result.queuedArchidekt})`
        : `candidates+${result.addedCandidates}`;
      console.log(
        `[archidekt-bot] ${discoveryLabel} | processed=${result.processedCount} | usable=${result.corpus.usable_deck_count} | invalid=${result.corpus.invalid_deck_count} | summary=${JSON.stringify(result.processedSummary)}`
      );
      extraSleepMs = result.rateLimited
        ? Math.max(result.retryAfterMs || 0, args.backoffMs)
        : 0;
      if (extraSleepMs > 0) {
        console.error(`[archidekt-bot] backing off for ${Math.round(extraSleepMs / 1000)}s`);
      }
    } catch (error) {
      console.error(`[archidekt-bot] ${error.message}`);
      if (error.code === 'RATE_LIMITED') {
        extraSleepMs = Math.max(error.retryAfterMs || 0, args.backoffMs);
        console.error(`[archidekt-bot] backing off for ${Math.round(extraSleepMs / 1000)}s`);
      }
    }

    await sleep(args.pollMs + extraSleepMs);
  }
}

main().catch((error) => {
  console.error('[archidekt-bot] fatal:', error);
  process.exitCode = 1;
});
