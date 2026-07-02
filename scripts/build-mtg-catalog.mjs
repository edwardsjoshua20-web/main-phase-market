import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { resolveConfiguredSourcePath } from './lib/source-registry.mjs';

const DEFAULT_SOURCE_PATH = resolveConfiguredSourcePath('magic', 'catalogSource');
const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/mtg');
const SEARCH_OUTPUT = path.join(OUTPUT_ROOT, 'search');
const IMAGE_OUTPUT = path.join(OUTPUT_ROOT, 'images');

const EXCLUDED_SET_TYPES = new Set(['token', 'memorabilia', 'funny', 'minigame']);
const EXCLUDED_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'scheme', 'planar', 'vanguard']);
const EXCLUDED_TYPE_SNIPPETS = ['token', 'emblem', 'sticker', 'card //', 'art series'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bucketForName(name) {
  const normalized = normalizeText(name);
  const first = normalized[0];
  if (!first) return 'other';
  if (/[a-z]/.test(first)) return first;
  if (/[0-9]/.test(first)) return '0-9';
  return 'other';
}

function isCommanderCard(card, typeLine, oracleText) {
  const legalCommander = card.legalities?.commander === 'legal';
  if (!legalCommander) return false;

  const normalizedType = String(typeLine || '').toLowerCase();
  const normalizedText = String(oracleText || '').toLowerCase();

  return normalizedType.includes('legendary creature') || normalizedText.includes('can be your commander');
}

function getPrimaryFace(card) {
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    return card.card_faces[0];
  }

  return null;
}

function collectAlternateNames(card, primaryFace, searchName) {
  const names = new Set();

  const addName = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    if (text === searchName) return;
    names.add(text);
  };

  addName(card.flavor_name);
  addName(card.printed_name);
  addName(primaryFace?.flavor_name);
  addName(primaryFace?.printed_name);

  if (Array.isArray(card.card_faces)) {
    for (const face of card.card_faces) {
      addName(face?.name);
      addName(face?.flavor_name);
      addName(face?.printed_name);
    }
  }

  return Array.from(names);
}

function getImage(card, kind) {
  if (card.image_uris?.[kind]) {
    return card.image_uris[kind];
  }

  const primaryFace = getPrimaryFace(card);
  return primaryFace?.image_uris?.[kind] || null;
}

function getFileExtension(url, kind) {
  if (kind === 'png') return '.png';

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return '.png';
  } catch {}

  return '.jpg';
}

function getMirroredImageUrl(cardId, kind, sourceUrl) {
  if (!sourceUrl) return null;

  const extension = getFileExtension(sourceUrl, kind);
  const prefix = String(cardId).slice(0, 2).toLowerCase();
  const diskPath = path.join(IMAGE_OUTPUT, kind, prefix, `${cardId}${extension}`);

  if (!fs.existsSync(diskPath)) {
    return sourceUrl;
  }

  try {
    if (fs.statSync(diskPath).size === 0) {
      return sourceUrl;
    }
  } catch {
    return sourceUrl;
  }

  return `/data/mtg/images/${kind}/${prefix}/${cardId}${extension}`;
}

function shouldExclude(card) {
  if (card.object !== 'card') return 'non_card_object';
  if (card.digital) return 'digital_only';
  const games = Array.isArray(card.games) ? card.games : [];
  const isPaperCard = games.includes('paper');
  const isPaperPreview = games.length === 0 && !card.digital;
  if (!isPaperCard && !isPaperPreview) return 'non_paper';
  if (EXCLUDED_SET_TYPES.has(card.set_type)) return `set_type:${card.set_type}`;
  if (EXCLUDED_LAYOUTS.has(card.layout)) return `layout:${card.layout}`;

  const typeLine = String(card.type_line || '').toLowerCase();
  if (EXCLUDED_TYPE_SNIPPETS.some((snippet) => typeLine.includes(snippet))) {
    return 'type_line_excluded';
  }

  if (Array.isArray(card.promo_types) && card.promo_types.includes('playtest')) {
    return 'playtest';
  }

  if (String(card.set_name || '').toLowerCase().includes('playtest')) {
    return 'playtest_set';
  }

  return null;
}

function mapCard(card) {
  const primaryFace = getPrimaryFace(card);
  const typeLine = card.type_line || primaryFace?.type_line || '';
  const oracleText = card.oracle_text || primaryFace?.oracle_text || '';
  const manaCost = card.mana_cost || primaryFace?.mana_cost || '';
  const searchName = card.name || primaryFace?.name || '';
  const faceNames = Array.isArray(card.card_faces) ? card.card_faces.map((face) => face.name).filter(Boolean) : [];
  const alternateNames = collectAlternateNames(card, primaryFace, searchName);

  const imageSmall = getImage(card, 'small');
  const imageNormal = getImage(card, 'normal');
  const imageArtCrop = getImage(card, 'art_crop');
  const imagePng = getImage(card, 'png');

  return {
    id: card.id,
    oracle_id: card.oracle_id || null,
    name: searchName,
    name_normalized: normalizeText(searchName),
    lang: card.lang || 'unknown',
    face_names: faceNames,
    alternate_names: alternateNames,
    released_at: card.released_at || null,
    set_code: String(card.set || '').toUpperCase(),
    set_name: card.set_name || '',
    set_type: card.set_type || '',
    collector_number: card.collector_number || '',
    rarity: card.rarity || '',
    mana_cost: manaCost,
    cmc: Number.isFinite(card.cmc) ? card.cmc : 0,
    type_line: typeLine,
    oracle_text: oracleText,
    power: card.power ?? primaryFace?.power ?? '',
    toughness: card.toughness ?? primaryFace?.toughness ?? '',
    loyalty: card.loyalty ?? primaryFace?.loyalty ?? '',
    colors: Array.isArray(card.colors) ? card.colors : [],
    color_identity: Array.isArray(card.color_identity) ? card.color_identity : [],
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    image_small: getMirroredImageUrl(card.id, 'small', imageSmall),
    image_normal: getMirroredImageUrl(card.id, 'normal', imageNormal),
    image_art_crop: getMirroredImageUrl(card.id, 'art_crop', imageArtCrop),
    image_png: getMirroredImageUrl(card.id, 'png', imagePng),
    legal_commander: card.legalities?.commander === 'legal',
    can_be_commander: isCommanderCard(card, typeLine, oracleText),
    finishes: Array.isArray(card.finishes) ? card.finishes : [],
    nonfoil: Boolean(card.nonfoil),
    foil: Boolean(card.foil),
    highres_image: Boolean(card.highres_image),
    prices: {
      usd: card.prices?.usd ?? null,
      usd_foil: card.prices?.usd_foil ?? null,
      usd_etched: card.prices?.usd_etched ?? null
    },
    search_text: normalizeText([
      searchName,
      ...faceNames,
      ...alternateNames,
      card.set_name,
      card.collector_number,
      typeLine,
      oracleText
    ].filter(Boolean).join(' ')),
    game: 'magic'
  };
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

async function main() {
  const sourcePath = process.env.MTG_SOURCE_PATH || process.argv[2] || DEFAULT_SOURCE_PATH;

  ensureDir(OUTPUT_ROOT);
  ensureDir(SEARCH_OUTPUT);

  const buckets = new Map();
  const oracleBuckets = new Map();
  const sets = new Map();
  const exclusionCounts = new Map();

  let totalCards = 0;
  let importedCards = 0;

  await streamCards(sourcePath, async (card) => {
    totalCards += 1;

    const exclusionReason = shouldExclude(card);
    if (exclusionReason) {
      exclusionCounts.set(exclusionReason, (exclusionCounts.get(exclusionReason) || 0) + 1);
      return;
    }

    const row = mapCard(card);
    const bucket = bucketForName(row.name);
    const bucketRows = buckets.get(bucket) || [];
    bucketRows.push(row);
    buckets.set(bucket, bucketRows);

    if (row.oracle_id) {
      const existingBuckets = oracleBuckets.get(row.oracle_id) || new Set();
      existingBuckets.add(bucket);
      oracleBuckets.set(row.oracle_id, existingBuckets);
    }

    importedCards += 1;

    const setKey = row.set_code;
    const currentSet = sets.get(setKey) || {
      set_code: row.set_code,
      set_name: row.set_name,
      set_type: row.set_type,
      released_at: row.released_at,
      card_count: 0
    };
    currentSet.card_count += 1;
    sets.set(setKey, currentSet);
  });

  const manifest = {
    generated_at: new Date().toISOString(),
    source_path: sourcePath,
    total_cards_seen: totalCards,
    imported_cards: importedCards,
    excluded_counts: Object.fromEntries([...exclusionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    buckets: {}
  };

  for (const [bucket, rows] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.sort((a, b) => {
      if (a.name_normalized === b.name_normalized) {
        return (b.released_at || '').localeCompare(a.released_at || '');
      }
      return a.name_normalized.localeCompare(b.name_normalized);
    });

    const fileName = `${bucket}.json`;
    fs.writeFileSync(path.join(SEARCH_OUTPUT, fileName), JSON.stringify(rows));
    manifest.buckets[bucket] = {
      file: `search/${fileName}`,
      count: rows.length
    };
  }

  const sortedSets = [...sets.values()].sort((a, b) => {
    const dateCompare = String(b.released_at || '').localeCompare(String(a.released_at || ''));
    if (dateCompare !== 0) return dateCompare;
    return a.set_name.localeCompare(b.set_name);
  });

  const oracleBucketIndex = Object.fromEntries(
    [...oracleBuckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([oracleId, bucketSet]) => [oracleId, [...bucketSet].sort((a, b) => a.localeCompare(b))])
  );

  fs.writeFileSync(path.join(OUTPUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'sets.json'), JSON.stringify(sortedSets));
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'oracle-buckets.json'), JSON.stringify(oracleBucketIndex));

  console.log(`MTG catalog build complete. Imported ${importedCards} cards from ${totalCards} source rows.`);
  console.log(`Output written to ${OUTPUT_ROOT}`);
}

main().catch((error) => {
  console.error('MTG catalog build failed:', error);
  process.exitCode = 1;
});
