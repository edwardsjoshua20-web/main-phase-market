import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_PATH = path.resolve(process.cwd(), 'public/data/lorcana/cards.json');
const IMAGE_ROOT = path.resolve(process.cwd(), 'public/data/lorcana/images');
const DEFAULT_KINDS = ['normal', 'large'];
const KIND_MAP = {
  normal: ['image_uris', 'digital', 'normal'],
  large: ['image_uris', 'digital', 'large']
};
const CONCURRENCY = Number(process.env.LORCANA_IMAGE_CONCURRENCY || 8);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readCards(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getNestedValue(obj, pathParts) {
  return pathParts.reduce((current, part) => current?.[part], obj);
}

function getFileExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return path.extname(pathname) || '.avif';
  } catch {
    return '.avif';
  }
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
      'User-Agent': 'MainPhaseMarket/1.0 lorcana image mirror'
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
    console.log('Usage: node scripts/mirror-lorcana-images.mjs [normal,large] [sourcePath]');
    process.exit(0);
  }

  const requestedKinds = (firstArg || process.env.LORCANA_IMAGE_KINDS || DEFAULT_KINDS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const validKinds = requestedKinds.filter((kind) => Object.hasOwn(KIND_MAP, kind));
  if (!validKinds.length) {
    throw new Error(`No valid image kinds requested. Use one of: ${Object.keys(KIND_MAP).join(', ')}`);
  }

  const sourcePath = process.env.LORCANA_SOURCE_PATH || process.argv[3] || DEFAULT_SOURCE_PATH;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Lorcana source file not found: ${sourcePath}`);
  }

  ensureDir(IMAGE_ROOT);

  const cards = readCards(sourcePath);
  const uniqueById = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card?.id || uniqueById.has(card.id)) continue;
    uniqueById.set(card.id, {
      id: card.id,
      name: card.name || '',
      urls: {
        normal: getNestedValue(card, KIND_MAP.normal) || null,
        large: getNestedValue(card, KIND_MAP.large) || null
      }
    });
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
      const sourceUrl = row.urls?.[kind];
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
          if (stats.downloaded % 500 === 0) {
            console.log(`Downloaded ${stats.downloaded}/${stats.downloadsQueued} Lorcana images...`);
          }
        } catch (error) {
          stats.failed += 1;
          console.error(`Lorcana image download failed for ${row.name} [${row.id}] ${kind}: ${error.message}`);
        }
      });
    }
  }

  console.log(`Found ${stats.cardsSeen} unique Lorcana cards.`);
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
  console.log('Lorcana image mirror complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Lorcana image mirror failed:', error);
  process.exitCode = 1;
});
