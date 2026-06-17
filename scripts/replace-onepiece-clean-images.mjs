import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const CARDS_PATH = path.resolve(PROJECT_ROOT, 'public/data/onepiece/cards.json');
const IMAGE_ROOT = path.resolve(PROJECT_ROOT, 'public/data/onepiece/images');
const VEGAPULL_ROOT =
  process.env.ONEPIECE_VEGAPULL_ROOT ||
  process.argv[2] ||
  path.resolve(PROJECT_ROOT, 'tmp/onepiece-vegapull-images');
const API_CONCURRENCY = Number(process.env.ONEPIECE_CARDSREALM_CONCURRENCY || 4);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'");
}

function getLocalImagePath(cardId, extension = '.png') {
  const prefix = String(cardId).slice(0, 2).toLowerCase();
  return path.join(IMAGE_ROOT, prefix, `${encodeURIComponent(String(cardId || 'unknown'))}${extension}`);
}

function getFileExtension(sourceUrl, fallback = '.png') {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const extension = path.extname(pathname);
    return extension || fallback;
  } catch {
    return fallback;
  }
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function buildVegapullIndex(rootDir) {
  const index = new Map();
  const files = walkFiles(rootDir);
  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension !== '.png') {
      continue;
    }
    const id = path.basename(filePath, extension);
    if (!id) {
      continue;
    }
    index.set(id, filePath);
  }
  return index;
}

async function fetchCardsRealmCard(card) {
  const decodedName = decodeHtmlEntities(card?.name);
  const queryVariants = [
    `${decodedName || ''} ${card?.id || ''}`.trim(),
    String(card?.id || '').trim(),
    decodedName.trim()
  ].filter(Boolean);

  for (const cardname of queryVariants) {
    const body = new URLSearchParams({
      cardname,
      currency: 'USD'
    });

    const response = await fetch('https://onepiece.cardsrealm.com/en-us/api/cardinfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'MainPhaseMarket/1.0 onepiece clean image backfill'
      },
      body
    });

    if (!response.ok) {
      continue;
    }

    const payload = await response.json();
    if (payload?.image_of_card) {
      return payload;
    }
  }

  return null;
}

function toCardsRealmSlug(name, cardId) {
  return `${decodeHtmlEntities(name)} ${cardId}`
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

async function fetchCardsRealmPageImage(card) {
  const slug = toCardsRealmSlug(card?.name, card?.id);
  if (!slug) {
    return null;
  }

  const response = await fetch(`https://onepiece.cardsrealm.com/en-us/card/${slug}`, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 onepiece clean image backfill'
    }
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const srcMatch = html.match(/var\s+src\s*=\s*"([^"]+)"/i);
  if (!srcMatch?.[1]) {
    return null;
  }

  return srcMatch[1];
}

async function fetchLimitlessImage(card) {
  const setCode = String(card?.set_code || '').trim();
  const cardId = String(card?.id || '').trim();
  if (!setCode || !cardId) {
    return null;
  }

  const url = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${encodeURIComponent(setCode)}/${encodeURIComponent(cardId)}_EN.webp`;
  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 onepiece clean image backfill'
    }
  });

  if (!response.ok) {
    return null;
  }

  return url;
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 onepiece clean image backfill'
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

async function runPool(items, concurrency, worker) {
  let index = 0;
  async function runner() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runner()));
}

async function main() {
  if (!fs.existsSync(CARDS_PATH)) {
    throw new Error(`One Piece cards source not found: ${CARDS_PATH}`);
  }

  const cards = readJson(CARDS_PATH);
  const vegapullIndex = buildVegapullIndex(VEGAPULL_ROOT);
  const stats = {
    cards_seen: 0,
    vegapull_matches: 0,
    vegapull_copied: 0,
    cardsrealm_candidates: 0,
    cardsrealm_downloaded: 0,
    cardsrealm_failed: 0,
    limitless_downloaded: 0,
    unresolved: 0
  };

  const cardsRealmQueue = [];

  for (const card of Array.isArray(cards) ? cards : []) {
    const cardId = String(card?.id || '').trim();
    if (!cardId) {
      continue;
    }

    stats.cards_seen += 1;
    const destinationPath = getLocalImagePath(cardId, '.png');
    const vegapullSourcePath = vegapullIndex.get(cardId);

    if (vegapullSourcePath) {
      stats.vegapull_matches += 1;
      ensureDir(path.dirname(destinationPath));
      fs.copyFileSync(vegapullSourcePath, destinationPath);
      stats.vegapull_copied += 1;
      continue;
    }

    stats.cardsrealm_candidates += 1;
    cardsRealmQueue.push({ card, destinationPath });
  }

  await runPool(cardsRealmQueue, API_CONCURRENCY, async ({ card, destinationPath }) => {
    try {
      const payload = await fetchCardsRealmCard(card);
      let sourceUrl = payload?.image_of_card || await fetchCardsRealmPageImage(card);
      let sourceKind = 'cardsrealm';

      if (!sourceUrl) {
        sourceUrl = await fetchLimitlessImage(card);
        sourceKind = sourceUrl ? 'limitless' : sourceKind;
      }

      if (!sourceUrl) {
        stats.cardsrealm_failed += 1;
        return;
      }

      const extension = getFileExtension(sourceUrl, '.png');
      const finalDestinationPath = getLocalImagePath(card?.id, extension);
      await downloadFile(sourceUrl, finalDestinationPath);
      card.image_url = sourceUrl;

      if (sourceKind === 'limitless') {
        stats.limitless_downloaded += 1;
      } else {
        stats.cardsrealm_downloaded += 1;
      }

      const completed = stats.vegapull_copied + stats.cardsrealm_downloaded + stats.limitless_downloaded;
      if (completed % 100 === 0) {
        console.log(`Prepared ${completed}/${stats.cards_seen} clean One Piece images...`);
      }
    } catch (error) {
      stats.cardsrealm_failed += 1;
      console.error(`Cards Realm image backfill failed for ${card?.name} [${card?.id}]: ${error.message}`);
    }
  });

  stats.unresolved = stats.cardsrealm_candidates - stats.cardsrealm_downloaded - stats.limitless_downloaded - stats.cardsrealm_failed;

  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    cards_path: CARDS_PATH,
    vegapull_root: VEGAPULL_ROOT,
    ...stats
  };

  const manifestPath = path.join(IMAGE_ROOT, 'clean-replace-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('One Piece clean image replacement complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('One Piece clean image replacement failed:', error);
  process.exitCode = 1;
});
