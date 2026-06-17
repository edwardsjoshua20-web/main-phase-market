import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const ingestDir = path.join(repoRoot, 'tmp', 'commander-ingest');
const manifestPath = path.join(ingestDir, 'sources.json');

function parseArgs(argv) {
  const args = {
    source: '',
    urls: [],
    limit: 250,
    appendDeckUrls: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source') args.source = String(argv[index + 1] || '').toLowerCase();
    if (token === '--url') args.urls.push(String(argv[index + 1] || '').trim());
    if (token === '--limit') args.limit = Math.max(1, Number(argv[index + 1]) || args.limit);
    if (token === '--deck-url') args.appendDeckUrls.push(String(argv[index + 1] || '').trim());
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

function writeManifest(filePath, entries) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/json',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (isCloudflareBlockPage(text)) {
    throw new Error(`Cloudflare blocked access to ${url}`);
  }

  return text;
}

function isCloudflareBlockPage(text) {
  const value = String(text || '');
  return value.includes('Attention Required! | Cloudflare')
    || value.includes('Sorry, you have been blocked')
    || value.includes('cf-error-details');
}

function normalizeArchidektDeckUrl(url) {
  const match = String(url).match(/archidekt\.com\/decks\/(\d+)/i);
  if (!match) return null;
  return `https://archidekt.com/decks/${match[1]}`;
}

function normalizeMoxfieldDeckUrl(url) {
  const match = String(url).match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  if (!match) return null;
  return `https://moxfield.com/decks/${match[1]}`;
}

function extractArchidektDeckUrls(text) {
  const matches = text.match(/https?:\/\/archidekt\.com\/decks\/\d+/gi) || [];
  const relativeMatches = [...text.matchAll(/\/decks\/(\d+)/gi)].map((match) => `https://archidekt.com/decks/${match[1]}`);
  return [...new Set([...matches, ...relativeMatches].map(normalizeArchidektDeckUrl).filter(Boolean))];
}

function extractMoxfieldDeckUrls(text) {
  const matches = text.match(/https?:\/\/moxfield\.com\/decks\/[A-Za-z0-9_-]+/gi) || [];
  const relativeMatches = [...text.matchAll(/\/decks\/([A-Za-z0-9_-]+)/gi)].map((match) => `https://moxfield.com/decks/${match[1]}`);
  return [...new Set([...matches, ...relativeMatches].map(normalizeMoxfieldDeckUrl).filter(Boolean))];
}

function toManifestEntry(source, url) {
  if (source === 'archidekt') {
    return {
      label: `Archidekt Deck ${url.split('/').at(-1)}`,
      source_type: 'archidekt_deck',
      source_name: 'archidekt',
      location: url
    };
  }

  if (source === 'moxfield') {
    return {
      label: `Moxfield Deck ${url.split('/').at(-1)}`,
      source_type: 'moxfield_deck',
      source_name: 'moxfield',
      location: url
    };
  }

  throw new Error(`Unsupported source: ${source}`);
}

async function discoverDeckUrls(source, pageUrls, limit) {
  const collected = new Set();

  for (const pageUrl of pageUrls) {
    const text = await fetchText(pageUrl);
    const urls = source === 'archidekt'
      ? extractArchidektDeckUrls(text)
      : extractMoxfieldDeckUrls(text);

    for (const url of urls) {
      collected.add(url);
      if (collected.size >= limit) {
        return [...collected];
      }
    }
  }

  return [...collected];
}

function mergeEntries(existingEntries, newEntries) {
  const byLocation = new Map(existingEntries.map((entry) => [entry.location, entry]));
  for (const entry of newEntries) {
    byLocation.set(entry.location, entry);
  }
  return [...byLocation.values()].sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['archidekt', 'moxfield'].includes(args.source)) {
    throw new Error('Use --source archidekt or --source moxfield');
  }

  const existing = readManifest(manifestPath);
  const directUrls = args.appendDeckUrls
    .map((url) => (args.source === 'archidekt' ? normalizeArchidektDeckUrl(url) : normalizeMoxfieldDeckUrl(url)))
    .filter(Boolean);
  const discoveredUrls = args.urls.length > 0
    ? await discoverDeckUrls(args.source, args.urls, args.limit)
    : [];
  const deckUrls = [...new Set([...directUrls, ...discoveredUrls])].slice(0, args.limit);
  const newEntries = deckUrls.map((url) => toManifestEntry(args.source, url));
  const merged = mergeEntries(existing, newEntries);

  writeManifest(manifestPath, merged);

  console.log(JSON.stringify({
    source: args.source,
    discovered: discoveredUrls.length,
    appended: directUrls.length,
    added: newEntries.length,
    manifest_entries: merged.length,
    manifest_path: manifestPath
  }, null, 2));
}

main().catch((error) => {
  console.error('Commander candidate discovery failed:', error);
  process.exitCode = 1;
});
