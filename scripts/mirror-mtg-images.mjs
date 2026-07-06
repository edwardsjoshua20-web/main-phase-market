import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { resolveConfiguredSourcePath } from './lib/source-registry.mjs';

const IMAGE_ROOT = path.resolve(process.cwd(), 'public/data/mtg/images');
const DEFAULT_SOURCE_PATH = resolveConfiguredSourcePath('magic', 'catalogSource');
const DEFAULT_KINDS = ['small', 'normal', 'art_crop'];
const CONCURRENCY = Number(process.env.MTG_IMAGE_CONCURRENCY || 8);
const DEFAULT_MAX_DOWNLOADS = Number(process.env.MTG_IMAGE_MAX_DOWNLOADS || 5000);
const KIND_MAP = ['small', 'normal', 'art_crop', 'png'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getPrimaryFace(card) {
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    return card.card_faces[0];
  }

  return null;
}

function getImage(card, kind) {
  if (card.image_uris?.[kind]) {
    return card.image_uris[kind];
  }

  const primaryFace = getPrimaryFace(card);
  return primaryFace?.image_uris?.[kind] || null;
}

function shouldIncludeCard(card) {
  if (card.object !== 'card') return false;
  if (card.digital) return false;
  if (!Array.isArray(card.games) || !card.games.includes('paper')) return false;
  return true;
}

async function streamCards(filePath, onCard) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
  const decoder = new StringDecoder('utf8');

  let startedArray = false;
  let depth = 0;
  let inString = false;
  let escaping = false;
  let current = '';

  for await (const chunk of stream) {
    const text = decoder.write(Buffer.from(chunk));

    for (const char of text) {
      if (!startedArray) {
        if (char === '[') {
          startedArray = true;
        }
        continue;
      }

      if (depth === 0) {
        if (char === '{') {
          current = '{';
          depth = 1;
          inString = false;
          escaping = false;
        }
        continue;
      }

      current += char;

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === '\\') {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          await onCard(JSON.parse(current));
          current = '';
        }
      }
    }
  }

  decoder.end();
}

function getFileExtension(url, kind) {
  if (kind === 'png') {
    return '.png';
  }

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return '.png';
  } catch {}

  return '.jpg';
}

function getLocalImagePath(cardId, kind, extension) {
  const prefix = String(cardId).slice(0, 2).toLowerCase();
  return path.join(IMAGE_ROOT, kind, prefix, `${cardId}${extension}`);
}

function getLocalImageUrl(cardId, kind, extension) {
  const prefix = String(cardId).slice(0, 2).toLowerCase();
  return `/data/mtg/images/${kind}/${prefix}/${cardId}${extension}`;
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 image mirror'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  ensureDir(path.dirname(destinationPath));
  const fileBuffer = Buffer.from(arrayBuffer);
  const tempPath = `${destinationPath}.tmp`;

  fs.writeFileSync(tempPath, fileBuffer);

  if (fileBuffer.length === 0) {
    fs.rmSync(tempPath, { force: true });
    throw new Error(`Downloaded empty file from ${url}`);
  }

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

function parseArgs(argv) {
  const options = {
    kinds: null,
    maxDownloads: DEFAULT_MAX_DOWNLOADS,
    sourcePath: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--max-downloads') {
      options.maxDownloads = Number(argv[index + 1] || DEFAULT_MAX_DOWNLOADS);
      index += 1;
      continue;
    }

    if (arg === '--source') {
      options.sourcePath = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (!options.kinds && !String(arg).startsWith('--')) {
      options.kinds = arg;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/mirror-mtg-images.mjs [small,normal,art_crop,png] [--max-downloads 5000] [--source path]');
    process.exit(0);
  }

  const requestedKinds = (options.kinds || process.env.MTG_IMAGE_KINDS || DEFAULT_KINDS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const validKinds = requestedKinds.filter((kind) => KIND_MAP.includes(kind));
  if (!validKinds.length) {
    throw new Error(`No valid image kinds requested. Use one of: ${KIND_MAP.join(', ')}`);
  }

  ensureDir(IMAGE_ROOT);

  const sourcePath = process.env.MTG_SOURCE_PATH || options.sourcePath || DEFAULT_SOURCE_PATH;
  const maxDownloads = Number.isFinite(options.maxDownloads) && options.maxDownloads > 0 ? options.maxDownloads : DEFAULT_MAX_DOWNLOADS;
  const uniqueById = new Map();

  await streamCards(sourcePath, async (card) => {
    if (!shouldIncludeCard(card)) {
      return;
    }

    if (!uniqueById.has(card.id)) {
      uniqueById.set(card.id, {
        id: card.id,
        name: card.name || '',
        images: Object.fromEntries(validKinds.map((kind) => [kind, getImage(card, kind)]))
      });
    }
  });

  const tasks = [];
  let queueClosed = false;
  const stats = {
    cardsSeen: uniqueById.size,
    downloadsQueued: 0,
    downloaded: 0,
    skippedExisting: 0,
    missingSourceUrl: 0,
    failed: 0
  };

  for (const row of uniqueById.values()) {
    if (queueClosed) break;

    for (const kind of validKinds) {
      const sourceUrl = row.images?.[kind];

      if (!sourceUrl) {
        stats.missingSourceUrl += 1;
        continue;
      }

      const extension = getFileExtension(sourceUrl, kind);
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
            console.log(`Downloaded ${stats.downloaded}/${stats.downloadsQueued} files...`);
          }
        } catch (error) {
          stats.failed += 1;
          console.error(`Image download failed for ${row.name} [${row.id}] ${kind}: ${error.message}`);
        }
      });

      if (stats.downloadsQueued >= maxDownloads) {
        queueClosed = true;
        break;
      }
    }
  }

  console.log(`Found ${stats.cardsSeen} unique MTG cards.`);
  console.log(`Capped queue at ${maxDownloads} downloads per run.`);
  console.log(`Queueing ${stats.downloadsQueued} image downloads for kinds: ${validKinds.join(', ')}.`);

  await runPool(tasks, CONCURRENCY);

  const manifest = {
    generated_at: new Date().toISOString(),
    kinds: validKinds,
    mode: 'incremental-capped',
    max_downloads_per_run: maxDownloads,
    cards_seen: stats.cardsSeen,
    downloads_queued: stats.downloadsQueued,
    downloaded: stats.downloaded,
    skipped_existing: stats.skippedExisting,
    missing_source_url: stats.missingSourceUrl,
    failed: stats.failed,
    queue_completed: stats.downloadsQueued < maxDownloads
  };

  fs.writeFileSync(path.join(IMAGE_ROOT, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('MTG image mirror complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('MTG image mirror failed:', error);
  process.exitCode = 1;
});

export { getLocalImageUrl };