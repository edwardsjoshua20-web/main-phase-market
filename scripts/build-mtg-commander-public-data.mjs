import fs from 'node:fs';
import path from 'node:path';
import {
  getMtgCommanderPage,
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
const SEARCH_LITE_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'search-lite');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'commanders.json');
const DETAILS_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'commander-details');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'mtg', 'commander-manifest.json');
const HOSTED_PUBLIC_DATA_BASE_URL = 'https://wwvvyrhlybwijqlhubdv.supabase.co/storage/v1/object/public/main-phase-market-public/data';
const TRUSTED_ARCHETYPE_SLUGS = new Set([
  'aristocrats',
  'counters',
  'tokens',
  'mill',
  'reanimator',
  'lands',
  'enchantress',
  'petitioners'
]);

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

function toCommander(row, deckCounts, uniqueConfigurationCounts, snapshot) {
  const deckCount = Number(deckCounts.get(row.oracle_id) || 0);
  const uniqueConfigurationCount = Number(uniqueConfigurationCounts.get(row.oracle_id) || 0);
  const sampleConfidence = getCommanderSampleConfidence(uniqueConfigurationCount);
  const detail = snapshot.details.get(row.oracle_id);
  const archetypes = !detail?.analytics_suppressed
    ? (detail?.theme_options || [])
        .filter((theme) => TRUSTED_ARCHETYPE_SLUGS.has(theme.slug) && Number(theme.deck_count || 0) > 0)
        .map((theme) => ({ slug: theme.slug, label: theme.label, deck_count: Number(theme.deck_count) }))
        .sort((a, b) => b.deck_count - a.deck_count || a.label.localeCompare(b.label))
    : [];
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
    unique_configuration_count: uniqueConfigurationCount,
    duplicate_observation_count: Math.max(0, deckCount - uniqueConfigurationCount),
    dataset_version: snapshot.datasetVersion,
    analytics_version: COMMANDER_ANALYTICS_VERSION,
    confidence_tier: sampleConfidence.tier,
    analytics_eligible: sampleConfidence.analytics_eligible,
    archetypes,
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

function compactHostedCardView(payload) {
  if (!payload) return null;
  return {
    has_local_data: payload.has_local_data,
    has_analytics_data: payload.has_analytics_data,
    sample_confidence: payload.sample_confidence,
    analytics_suppressed: payload.analytics_suppressed,
    active_mode: payload.active_mode,
    active_theme: payload.active_theme,
    theme_options: payload.theme_options,
    commander: payload.commander,
    total_decks: payload.total_decks,
    unique_configuration_count: payload.unique_configuration_count,
    duplicate_observation_count: payload.duplicate_observation_count,
    top_commanders: payload.top_commanders,
    average_deck_profile: payload.average_deck_profile,
    top_synergy_cards: payload.top_synergy_cards,
    observed_cards: payload.observed_cards,
    new_cards: payload.new_cards,
    game_changers: payload.game_changers
  };
}

function isCertifiedThemeSlice(slice, theme) {
  return slice?.active_theme === theme.slug
    && slice?.has_analytics_data === true
    && slice?.sample_confidence?.analytics_eligible === true
    && Number(slice?.average_deck_profile?.total_decks || 0) === Number(theme.deck_count || 0);
}

function buildCertifiedThemeSlices(commanderOracleId, themeOptions = [], options = {}) {
  const entries = [];
  for (const theme of themeOptions) {
    const slice = getMtgCommanderPage(commanderOracleId, { ...options, theme: theme.slug });
    const hostedSlice = options.mode === 'card' ? compactHostedCardView(slice) : slice;
    if (!isCertifiedThemeSlice(hostedSlice, theme)) {
      throw new Error(`Theme slice ${commanderOracleId}/${theme.slug} is not certified for publication.`);
    }
    entries.push([theme.slug, hostedSlice]);
  }
  return Object.fromEntries(entries);
}

async function main() {
  const files = collectJsonFiles(SEARCH_DIR);
  const searchShardFiles = collectJsonFiles(SEARCH_SHARDS_DIR);
  const sourceFiles = files.length > 0
    ? files
    : searchShardFiles.length > 0
      ? searchShardFiles
      : collectJsonFiles(SEARCH_LITE_DIR);

  if (sourceFiles.length === 0) {
    throw new Error('No MTG search files found to build commander data.');
  }

  const commandersByOracleId = new Map();
  await refreshMtgCommanderEngine();
  const snapshot = getMtgCommanderPublicSnapshot();
  const commanderOracleIds = new Set(snapshot.indexRows.map((row) => row.oracle_id));
  const deckCounts = new Map();
  const uniqueConfigurationCounts = new Map();
  for (const row of snapshot.indexRows) {
    deckCounts.set(row.oracle_id, Number(row.deck_count || 0));
    uniqueConfigurationCounts.set(row.oracle_id, Number(row.unique_configuration_count || 0));
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

      const candidate = toCommander(row, deckCounts, uniqueConfigurationCounts, snapshot);
      const existing = commandersByOracleId.get(row.oracle_id);
      if (!existing || compareCommanderRows(candidate, existing) < 0) {
        commandersByOracleId.set(row.oracle_id, candidate);
      }
    }
  }

  const commanders = [...commandersByOracleId.values()].sort(
    (a, b) => Number(b.deck_count || 0) - Number(a.deck_count || 0) || a.name.localeCompare(b.name)
  );
  const archetypeTotals = new Map();
  for (const commander of commanders) {
    for (const archetype of commander.archetypes || []) {
      const current = archetypeTotals.get(archetype.slug) || {
        slug: archetype.slug,
        label: archetype.label,
        deck_count: 0,
        profile_count: 0
      };
      current.deck_count += Number(archetype.deck_count || 0);
      current.profile_count += 1;
      archetypeTotals.set(archetype.slug, current);
    }
  }
  const trendingArchetypes = [...archetypeTotals.values()].sort(
    (a, b) => b.deck_count - a.deck_count || a.label.localeCompare(b.label)
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
      const themeSlices = buildCertifiedThemeSlices(commander.oracle_id, payload.theme_options || []);
      const cardView = getMtgCommanderPage(commander.oracle_id, { mode: 'card' });
      const cardThemeSlices = buildCertifiedThemeSlices(commander.oracle_id, cardView?.theme_options || [], { mode: 'card' });
      const outputPath = path.join(DETAILS_DIR, `${commander.oracle_id}.json`);
      fs.writeFileSync(outputPath, `${JSON.stringify(makeHostedPayload({
        ...payload,
        theme_slices: themeSlices,
        card_view: cardView ? { ...compactHostedCardView(cardView), theme_slices: cardThemeSlices } : null,
        dataset_version: snapshot.datasetVersion,
        analytics_version: COMMANDER_ANALYTICS_VERSION
      }))}\n`);
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
    unique_content_configuration_count: snapshot.uniqueConfigurationCount,
    duplicate_observation_count: snapshot.duplicateObservationCount,
    quarantined_count: snapshot.quarantinedCount,
    retired_count: snapshot.retiredCount,
    source_replay_failures: snapshot.sourceReplayFailures,
    last_successful_discovery_time: snapshot.freshness.last_successful_discovery_time || null,
    last_successful_ingestion_time: snapshot.freshness.last_successful_ingestion_time || null,
    last_analytics_rebuild_time: snapshot.generatedAt,
    last_publication_time: snapshot.freshness.last_publication_time || null,
    index_deck_total: snapshot.indexDeckTotal,
    positive_commander_count: snapshot.positiveCommanderCount,
    detail_count: detailCount,
    trending_archetypes: trendingArchetypes
  })}\n`);

  console.log(`Wrote ${commanders.length} commanders and ${detailCount} rich detail pages from snapshot ${snapshot.datasetVersion}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
