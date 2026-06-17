import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_PATH = path.resolve(process.cwd(), 'public/data/starwars/cards.json');
const IMAGE_ROOT = path.resolve(process.cwd(), 'public/data/starwars/images');
const CONCURRENCY = Number(process.env.STARWARS_IMAGE_CONCURRENCY || 8);

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

function getLocalImagePath(cardId, extension, side = 'front') {
  const prefix = String(cardId || 'unknown').slice(0, 2).toLowerCase();
  const suffix = side === 'back' ? '-back' : '';
  return path.join(IMAGE_ROOT, prefix, `${encodeURIComponent(String(cardId || 'unknown'))}${suffix}${extension}`);
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 starwars image mirror'
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
  const sourcePath = process.env.STARWARS_SOURCE_PATH || process.argv[2] || DEFAULT_SOURCE_PATH;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Star Wars source file not found: ${sourcePath}`);
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
    back_images_found: 0
  };

  for (const card of Array.isArray(cards) ? cards : []) {
    const cardId = card?.uuid || card?.id;
    const imageJobs = [
      { url: card?.frontImageUrl, side: 'front' },
      { url: card?.backImageUrl, side: 'back' }
    ].filter((job) => job.url);

    if (!cardId || imageJobs.length === 0) {
      stats.missing_source_url += 1;
      continue;
    }

    for (const job of imageJobs) {
      if (job.side === 'back') stats.back_images_found += 1;
      const extension = getFileExtension(job.url);
      const destinationPath = getLocalImagePath(cardId, extension, job.side);

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
          await downloadFile(job.url, destinationPath);
          stats.downloaded += 1;
          if (stats.downloaded % 500 === 0) {
            console.log(`Downloaded ${stats.downloaded}/${stats.downloads_queued} Star Wars images...`);
          }
        } catch (error) {
          stats.failed += 1;
          console.error(`Star Wars image download failed for ${card?.name || cardId} [${cardId}] ${job.side}: ${error.message}`);
        }
      });
    }
  }

  console.log(`Found ${stats.cards_seen} Star Wars cards.`);
  console.log(`Queueing ${stats.downloads_queued} Star Wars image downloads.`);

  await runPool(tasks, CONCURRENCY);

  const manifest = {
    generated_at: new Date().toISOString(),
    source_path: sourcePath,
    ...stats
  };

  fs.writeFileSync(path.join(IMAGE_ROOT, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Star Wars image mirror complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Star Wars image mirror failed:', error);
  process.exitCode = 1;
});
