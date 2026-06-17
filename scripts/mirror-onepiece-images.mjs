import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_PATH = path.resolve(process.cwd(), 'public/data/onepiece/cards.json');
const IMAGE_ROOT = path.resolve(process.cwd(), 'public/data/onepiece/images');
const CONCURRENCY = Number(process.env.ONEPIECE_IMAGE_CONCURRENCY || 8);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readCards(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getFileExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return path.extname(pathname) || '.png';
  } catch {
    return '.png';
  }
}

function getLocalImagePath(cardId, extension) {
  const prefix = String(cardId).slice(0, 2).toLowerCase();
  return path.join(IMAGE_ROOT, prefix, `${encodeURIComponent(String(cardId || 'unknown'))}${extension}`);
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 onepiece image mirror'
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
  const sourcePath = process.env.ONEPIECE_SOURCE_PATH || process.argv[2] || DEFAULT_SOURCE_PATH;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`One Piece source file not found: ${sourcePath}`);
  }

  ensureDir(IMAGE_ROOT);
  const cards = readCards(sourcePath);
  const tasks = [];
  const stats = {
    cardsSeen: 0,
    downloadsQueued: 0,
    downloaded: 0,
    skippedExisting: 0,
    missingSourceUrl: 0,
    failed: 0
  };

  for (const card of Array.isArray(cards) ? cards : []) {
    stats.cardsSeen += 1;
    const sourceUrl = card?.image_url;
    if (!sourceUrl) {
      stats.missingSourceUrl += 1;
      continue;
    }

    const extension = getFileExtension(sourceUrl);
    const destinationPath = getLocalImagePath(card.id, extension);

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
          console.log(`Downloaded ${stats.downloaded}/${stats.downloadsQueued} One Piece images...`);
        }
      } catch (error) {
        stats.failed += 1;
        console.error(`One Piece image download failed for ${card.name} [${card.id}]: ${error.message}`);
      }
    });
  }

  console.log(`Found ${stats.cardsSeen} One Piece cards.`);
  console.log(`Queueing ${stats.downloadsQueued} image downloads.`);
  await runPool(tasks, CONCURRENCY);

  const manifest = {
    generated_at: new Date().toISOString(),
    source_path: sourcePath,
    cards_seen: stats.cardsSeen,
    downloads_queued: stats.downloadsQueued,
    downloaded: stats.downloaded,
    skipped_existing: stats.skippedExisting,
    missing_source_url: stats.missingSourceUrl,
    failed: stats.failed
  };

  fs.writeFileSync(path.join(IMAGE_ROOT, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('One Piece image mirror complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('One Piece image mirror failed:', error);
  process.exitCode = 1;
});
