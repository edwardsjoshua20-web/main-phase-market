import fs from 'node:fs';
import path from 'node:path';
import { resolveConfiguredSourcePath } from './lib/source-registry.mjs';

const DEFAULT_SOURCE_PATH = resolveConfiguredSourcePath('pokemon', 'catalogSource');
const IMAGE_ROOT = path.resolve(process.cwd(), 'public/data/pokemon/images');
const DEFAULT_KINDS = ['small', 'large'];
const KIND_MAP = ['small', 'large'];
const CONCURRENCY = Number(process.env.POKEMON_IMAGE_CONCURRENCY || 8);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readPokemonCards(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
}

function getFileExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return path.extname(pathname) || '.png';
  } catch {
    return '.png';
  }
}

function getCardSetId(card) {
  return String(card?.id || '').split('-')[0] || 'unknown';
}

function getSafeCardFileName(cardId, extension) {
  return `${encodeURIComponent(String(cardId || 'unknown'))}${extension}`;
}

function getLocalImagePath(cardId, kind, extension) {
  const prefix = String(cardId).slice(0, 2).toLowerCase();
  return path.join(IMAGE_ROOT, kind, prefix, getSafeCardFileName(cardId, extension));
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 pokemon image mirror'
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

async function runPool(tasks, concurrency) {
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = tasks[index];
      index += 1;
      await current();
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}

async function main() {
  const firstArg = process.argv[2];
  if (firstArg === '--help' || firstArg === '-h') {
    console.log('Usage: node scripts/mirror-pokemon-images.mjs [small,large] [sourcePath]');
    process.exit(0);
  }

  const requestedKinds = (firstArg || process.env.POKEMON_IMAGE_KINDS || DEFAULT_KINDS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const validKinds = requestedKinds.filter((kind) => KIND_MAP.includes(kind));
  if (!validKinds.length) {
    throw new Error(`No valid image kinds requested. Use one of: ${KIND_MAP.join(', ')}`);
  }

  const sourcePath = process.env.POKEMON_SOURCE_PATH || process.argv[3] || DEFAULT_SOURCE_PATH;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Pokemon source file not found: ${sourcePath}`);
  }

  ensureDir(IMAGE_ROOT);

  const cards = readPokemonCards(sourcePath);
  const uniqueById = new Map();
  for (const card of cards) {
    if (!card?.id) continue;
    if (!uniqueById.has(card.id)) {
      uniqueById.set(card.id, {
        id: card.id,
        name: card.name || '',
        setId: getCardSetId(card),
        images: {
          small: card.images?.small || null,
          large: card.images?.large || null
        }
      });
    }
  }

  const tasks = [];
  const stats = {
    cardsSeen: uniqueById.size,
    downloadsQueued: 0,
    downloaded: 0,
    skippedExisting: 0,
    missingSourceUrl: 0,
    failed: 0
  };

  for (const row of uniqueById.values()) {
    for (const kind of validKinds) {
      const sourceUrl = row.images?.[kind];
      if (!sourceUrl) {
        stats.missingSourceUrl += 1;
        continue;
      }

      const extension = getFileExtension(sourceUrl);
      const destinationPath = getLocalImagePath(row.id, kind, extension);

      if (fs.existsSync(destinationPath)) {
        const existingSize = fs.statSync(destinationPath).size;
        if (existingSize > 0) {
          stats.skippedExisting += 1;
          continue;
        }
        fs.rmSync(destinationPath, { force: true });
      }

      stats.downloadsQueued += 1;
      tasks.push(async () => {
        try {
          await downloadFile(sourceUrl, destinationPath);
          stats.downloaded += 1;
          if (stats.downloaded % 1000 === 0) {
            console.log(`Downloaded ${stats.downloaded}/${stats.downloadsQueued} Pokemon images...`);
          }
        } catch (error) {
          stats.failed += 1;
          console.error(`Pokemon image download failed for ${row.name} [${row.id}] ${kind}: ${error.message}`);
        }
      });
    }
  }

  console.log(`Found ${stats.cardsSeen} unique Pokemon cards.`);
  console.log(`Queueing ${stats.downloadsQueued} image downloads for kinds: ${validKinds.join(', ')}.`);

  await runPool(tasks, CONCURRENCY);

  const manifest = {
    generated_at: new Date().toISOString(),
    source_path: sourcePath,
    kinds: validKinds,
    cards_seen: stats.cardsSeen,
    downloads_queued: stats.downloadsQueued,
    downloaded: stats.downloaded,
    skipped_existing: stats.skippedExisting,
    missing_source_url: stats.missingSourceUrl,
    failed: stats.failed
  };

  fs.writeFileSync(path.join(IMAGE_ROOT, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Pokemon image mirror complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Pokemon image mirror failed:', error);
  process.exitCode = 1;
});
