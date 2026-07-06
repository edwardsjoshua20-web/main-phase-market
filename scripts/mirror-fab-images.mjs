import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_PATH = path.resolve(process.cwd(), 'public/data/fab/cards.json');
const IMAGE_ROOT = path.resolve(process.cwd(), 'public/data/fab/images');
const CONCURRENCY = Number(process.env.FAB_IMAGE_CONCURRENCY || 8);

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

function getPrimaryPrinting(card) {
  return Array.isArray(card?.printings) ? card.printings.find((printing) => printing?.image_url) || card.printings[0] : null;
}

function getLocalImagePath(cardId, extension) {
  const prefix = String(cardId || 'unknown').slice(0, 2).toLowerCase();
  return path.join(IMAGE_ROOT, prefix, `${encodeURIComponent(String(cardId || 'unknown'))}${extension}`);
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 fab image mirror'
    }
  });

  if (!response.ok) {
    const error = new Error(`Failed to download ${url}: ${response.status}`);
    error.status = response.status;
    throw error;
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
  const sourcePath = process.env.FAB_SOURCE_PATH || process.argv[2] || DEFAULT_SOURCE_PATH;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`FAB source file not found: ${sourcePath}`);
  }

  ensureDir(IMAGE_ROOT);

  const cards = readCards(sourcePath);
  const tasks = [];
  const stats = {
    cards_seen: Array.isArray(cards) ? cards.length : 0,
    downloads_queued: 0,
    downloaded: 0,
    skipped_existing: 0,
    missing_source_url: 0,
    failed: 0,
    upstream_404: 0,
    upstream_403: 0,
    unexpected_failures: 0
  };

  for (const card of Array.isArray(cards) ? cards : []) {
    const cardId = card?.unique_id;
    const primaryPrinting = getPrimaryPrinting(card);
    const sourceUrl = primaryPrinting?.image_url;

    if (!cardId || !sourceUrl) {
      stats.missing_source_url += 1;
      continue;
    }

    const extension = getFileExtension(sourceUrl);
    const destinationPath = getLocalImagePath(cardId, extension);

    if (fs.existsSync(destinationPath)) {
      try {
        if (fs.statSync(destinationPath).size > 0) {
          stats.skipped_existing += 1;
          continue;
        }
      } catch {}
      fs.rmSync(destinationPath, { force: true });
    }

    stats.downloads_queued += 1;
    tasks.push(async () => {
      try {
        await downloadFile(sourceUrl, destinationPath);
        stats.downloaded += 1;
        if (stats.downloaded % 500 === 0) {
          console.log(`Downloaded ${stats.downloaded}/${stats.downloads_queued} FAB images...`);
        }
      } catch (error) {
        stats.failed += 1;
        if (error?.status === 404) {
          stats.upstream_404 += 1;
        } else if (error?.status === 403) {
          stats.upstream_403 += 1;
        } else {
          stats.unexpected_failures += 1;
        }
        console.error(`FAB image download failed for ${card?.name || cardId} [${cardId}]: ${error.message}`);
      }
    });
  }

  console.log(`Found ${stats.cards_seen} FAB cards.`);
  console.log(`Queueing ${stats.downloads_queued} FAB image downloads.`);

  await runPool(tasks, CONCURRENCY);

  const manifest = {
    generated_at: new Date().toISOString(),
    source_path: sourcePath,
    ...stats
  };

  fs.writeFileSync(path.join(IMAGE_ROOT, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('FAB image mirror complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('FAB image mirror failed:', error);
  process.exitCode = 1;
});