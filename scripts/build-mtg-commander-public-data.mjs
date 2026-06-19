import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const SEARCH_SHARDS_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'search-shards');
const SEARCH_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'search');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'commanders.json');
const HOSTED_PUBLIC_DATA_BASE_URL = 'https://wwvvyrhlybwijqlhubdv.supabase.co/storage/v1/object/public/main-phase-market-public/data';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function resolveImageUrl(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;
  if (isExternalUrl(rawValue)) return rawValue;

  const normalizedValue = rawValue.replace(/^\/+/, '');
  if (normalizedValue.startsWith('data/')) {
    return `${HOSTED_PUBLIC_DATA_BASE_URL}/${normalizedValue.slice('data/'.length)}`;
  }

  return rawValue;
}

function getImageUrl(row) {
  return (
    resolveImageUrl(row.image_normal) ||
    resolveImageUrl(row.image_png) ||
    resolveImageUrl(row.image_art_crop) ||
    resolveImageUrl(row.image_small) ||
    null
  );
}

function isCommander(row) {
  if (!row || String(row.lang || '').toLowerCase() !== 'en') {
    return false;
  }

  if (row.can_be_commander) {
    return true;
  }

  const typeLine = String(row.type_line || '');
  return typeLine.includes('Legendary') && typeLine.includes('Creature');
}

function toCommander(row) {
  return {
    id: row.id,
    oracle_id: row.oracle_id,
    name: row.name,
    name_normalized: row.name_normalized || normalizeText(row.name),
    image_url: getImageUrl(row),
    image_small: getImageUrl(row),
    type_line: row.type_line || '',
    oracle_text: row.oracle_text || '',
    mana_cost: row.mana_cost || '',
    cmc: row.cmc ?? 0,
    power: row.power ?? '',
    toughness: row.toughness ?? '',
    colors: row.colors || [],
    color_identity: row.color_identity || [],
    keywords: row.keywords || [],
    set_name: row.set_name || '',
    set_code: row.set_code || '',
    rarity: row.rarity || '',
    deck_count: 1,
    legal_commander: Boolean(row.legal_commander),
    can_be_commander: true,
    game: 'magic'
  };
}

function compareCommanderRows(a, b) {
  const aHasImage = Boolean(a.image_url);
  const bHasImage = Boolean(b.image_url);
  if (aHasImage !== bHasImage) return aHasImage ? -1 : 1;

  const aReleased = String(a.released_at || '');
  const bReleased = String(b.released_at || '');
  if (aReleased !== bReleased) return bReleased.localeCompare(aReleased);

  return String(a.name || '').localeCompare(String(b.name || ''));
}

function main() {
  const files = collectJsonFiles(SEARCH_SHARDS_DIR);
  const sourceFiles = files.length > 0 ? files : collectJsonFiles(SEARCH_DIR);

  if (sourceFiles.length === 0) {
    throw new Error('No MTG search files found to build commander data.');
  }

  const commandersByOracleId = new Map();

  for (const filePath of sourceFiles) {
    const rows = readJson(filePath);
    if (!Array.isArray(rows)) {
      continue;
    }

    for (const row of rows) {
      if (!isCommander(row) || !row.oracle_id) {
        continue;
      }

      const candidate = toCommander(row);
      const existing = commandersByOracleId.get(row.oracle_id);
      if (!existing || compareCommanderRows(candidate, existing) < 0) {
        commandersByOracleId.set(row.oracle_id, candidate);
      }
    }
  }

  const commanders = [...commandersByOracleId.values()].sort((a, b) => a.name.localeCompare(b.name));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(commanders)}\n`);

  console.log(`Wrote ${commanders.length} commanders to ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}`);
}

main();
