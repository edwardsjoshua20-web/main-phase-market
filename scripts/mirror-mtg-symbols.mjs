import fs from 'node:fs';
import path from 'node:path';

const SYMBOL_ROOT = path.resolve(process.cwd(), 'public/data/mtg/symbols');
const CARD_SYMBOL_ROOT = path.join(SYMBOL_ROOT, 'card');
const SYMBOLOGY_URL = 'https://api.scryfall.com/symbology';
const USER_AGENT = 'MainPhaseMarket/1.0 symbol mirror';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeToken(symbol) {
  return String(symbol || '').replace(/[{}]/g, '').trim().toUpperCase();
}

function getLocalSymbolFileName(token, svgUrl) {
  try {
    const fileName = path.basename(new URL(svgUrl).pathname);
    if (fileName) {
      return fileName;
    }
  } catch {}

  const compactToken = String(token || '').replace(/[^A-Z0-9]/g, '');
  return compactToken ? `${compactToken}.svg` : 'UNKNOWN.svg';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/svg+xml,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);
  if (fileBuffer.length === 0) {
    throw new Error(`Downloaded empty file from ${url}`);
  }

  ensureDir(path.dirname(destinationPath));
  const tempPath = `${destinationPath}.tmp`;
  fs.writeFileSync(tempPath, fileBuffer);
  fs.renameSync(tempPath, destinationPath);
}

async function main() {
  ensureDir(CARD_SYMBOL_ROOT);

  const payload = await fetchJson(SYMBOLOGY_URL);
  const symbols = Array.isArray(payload?.data) ? payload.data : [];
  const manifest = {
    generated_at: new Date().toISOString(),
    source: SYMBOLOGY_URL,
    total_symbols: symbols.length,
    symbols: {}
  };

  let downloaded = 0;
  let skippedExisting = 0;

  for (const symbol of symbols) {
    const token = normalizeToken(symbol.symbol);
    const svgUrl = symbol.svg_uri;
    if (!token || !svgUrl) {
      continue;
    }

    const fileName = getLocalSymbolFileName(token, svgUrl);
    const localPath = path.join(CARD_SYMBOL_ROOT, fileName);
    const localUrl = `/data/mtg/symbols/card/${fileName}`;

    manifest.symbols[token] = {
      symbol: symbol.symbol,
      english: symbol.english || symbol.transposable || '',
      svg_uri: svgUrl,
      local_url: localUrl
    };

    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
      skippedExisting += 1;
      continue;
    }

    await downloadFile(svgUrl, localPath);
    downloaded += 1;
  }

  fs.writeFileSync(path.join(SYMBOL_ROOT, 'card-symbols-manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('MTG symbol mirror complete.');
  console.log(JSON.stringify({
    generated_at: manifest.generated_at,
    total_symbols: symbols.length,
    downloaded,
    skipped_existing: skippedExisting
  }, null, 2));
}

main().catch((error) => {
  console.error('MTG symbol mirror failed:', error);
  process.exitCode = 1;
});
