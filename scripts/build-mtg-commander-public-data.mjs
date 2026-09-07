import fs from 'node:fs';
import path from 'node:path';
import {
  getMtgCommanderPublicSnapshot,
  refreshMtgCommanderEngine
} from '../server/mtgCommanderEngine.mjs';
import {
  COMMANDER_ANALYTICS_VERSION,
  COMMANDER_SAMPLE_THRESHOLDS,
  getCommanderSampleConfidence
} from '../server/mtgCommanderAnalyticsPolicy.mjs';

const PROJECT_ROOT = process.cwd();
const SEARCH_SHARDS_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'search-shards');
const SEARCH_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'search');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'commanders.json');
const DETAILS_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'commander-details');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'commander-manifest.json');
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

function isCommander(row, commanderOracleIds) {
  if (!row || String(row.lang || '').toLowerCase() !== 'en') {
    return false;
  }
  return commanderOracleIds.has(row.oracle_id);
}

function toCommander(row, deckCounts) {
  const deckCount = Number(deckCounts.get(row.oracle_id) || 0);
  const sampleConfidence = getCommanderSampleConfidence(deckCount);
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
    deck_count: deckCount,
    confidence_tier: sampleConfidence.tier,
    analytics_eligible: sampleConfidence.analytics_eligible,
    legal_commander: Boolean(row.legal_commander),
    can_be_commander: true,
    game: 'magic'
  };
}

function makeHostedPayload(value) {
  if (Array.isArray(value)) {
    return value.map(makeHostedPayload);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, makeHostedPayload(child)]));
  }
  if (typeof value === 'string' && value.startsWith('/data/')) {
    return `${HOSTED_PUBLIC_DATA_BASE_URL}/${value.slice('/data/'.length)}`;
  }
  return value;
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

async function main() {
  const files = collectJsonFiles(SEARCH_DIR);
  const sourceFiles = files.length > 0 ? files : collectJsonFiles(SEARCH_SHARDS_DIR);

  if (sourceFiles.length === 0) {
    throw new Error('No MTG search files found to build commander data.');
  }

  const commandersByOracleId = new Map();
  await refreshMtgCommanderEngine();
  const snapshot = getMtgCommanderPublicSnapshot();
  const commanderOracleIds = new Set(snapshot.indexRows.map((row) => row.oracle_id));
  const deckCounts = new Map();
  for (const row of snapshot.indexRows) {
    deckCounts.set(row.oracle_id, Number(row.deck_count || 0));
  }

  for (const filePath of sourceFiles) {
    const rows = readJson(filePath);
    if (!Array.isArray(rows)) {
      continue;
    }

    for (const row of rows) {
      if (!isCommander(row, commanderOracleIds) || !row.oracle_id) {
        continue;
      }

      const candidate = toCommander(row, deckCounts);
      const existing = commandersByOracleId.get(row.oracle_id);
      if (!existing || compareCommanderRows(candidate, existing) < 0) {
        commandersByOracleId.set(row.oracle_id, candidate);
      }
    }
  }

  const commanders = [...commandersByOracleId.values()].sort(
    (a, b) => Number(b.deck_count || 0) - Number(a.deck_count || 0) || a.name.localeCompare(b.name)
  );
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(commanders)}\n`);

  let detailCount = 0;
  if (deckCounts.size > 0) {
    fs.mkdirSync(DETAILS_DIR, { recursive: true });
    for (const fileName of fs.readdirSync(DETAILS_DIR)) {
      if (fileName.endsWith('.json')) {
        fs.rmSync(path.join(DETAILS_DIR, fileName));
      }
    }
    for (const commander of commanders) {
      if (commander.deck_count <= 0) continue;
      const payload = snapshot.details.get(commander.oracle_id);
      if (!payload?.has_local_data) continue;
      const outputPath = path.join(DETAILS_DIR, `${commander.oracle_id}.json`);
      fs.writeFileSync(outputPath, `${JSON.stringify(makeHostedPayload(payload))}\n`);
      detailCount += 1;
    }
  }

  if (detailCount !== snapshot.positiveCommanderCount) {
    throw new Error(
      `Commander publication mismatch: details=${detailCount}, positive commanders=${snapshot.positiveCommanderCount}`
    );
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({
    dataset_version: snapshot.datasetVersion,
    analytics_version: COMMANDER_ANALYTICS_VERSION,
    sample_thresholds: COMMANDER_SAMPLE_THRESHOLDS,
    generated_at: snapshot.generatedAt,
    active_deck_count: snapshot.activeDeckCount,
    index_deck_total: snapshot.indexDeckTotal,
    positive_commander_count: snapshot.positiveCommanderCount,
    detail_count: detailCount
  })}\n`);

  console.log(`Wrote ${commanders.length} commanders and ${detailCount} rich detail pages from snapshot ${snapshot.datasetVersion}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
