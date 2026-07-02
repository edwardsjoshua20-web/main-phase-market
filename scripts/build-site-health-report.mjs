import fs from 'node:fs';
import path from 'node:path';
import { getGameDataAliases, sourceRequirementStatus } from './lib/source-registry.mjs';

const ROOT = process.cwd();
const PUBLIC_DATA_ROOT = path.join(ROOT, 'public', 'data');
const SITE_DATA_ROOT = path.join(PUBLIC_DATA_ROOT, 'site');
const OUTPUT_PATH = path.join(SITE_DATA_ROOT, 'system-health.json');

const GAMES = ['magic', 'pokemon', 'yugioh', 'onepiece', 'lorcana', 'fab', 'starwars'];
const IMAGE_MIRROR_GAMES = ['magic', 'pokemon', 'yugioh', 'onepiece', 'lorcana', 'fab', 'starwars'];
const PRICING_SOURCES = ['cardkingdom', 'tcgplayer', 'starcitygames'];

const AGE_LIMITS_HOURS = {
  homepage: 48,
  pricingSnapshot: 36,
  pricingSource: 36,
  catalog: 72,
  imageManifest: 48
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getFileStats(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  return {
    path: filePath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString()
  };
}

function resolveDataFile(game, relativePath) {
  const aliases = getGameDataAliases(game);
  for (const alias of aliases) {
    const candidate = path.join(PUBLIC_DATA_ROOT, alias, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(PUBLIC_DATA_ROOT, aliases[0], relativePath);
}

function hoursSince(isoString) {
  if (!isoString) return null;
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return null;
  return Math.round((((Date.now() - time) / (1000 * 60 * 60)) + Number.EPSILON) * 100) / 100;
}

function statusFromChecks({ exists = true, stale = false, degraded = false }) {
  if (!exists) return 'missing';
  if (stale) return 'stale';
  if (degraded) return 'degraded';
  return 'ok';
}

function summarizeSection(entries = []) {
  const counts = {
    ok: 0,
    degraded: 0,
    stale: 0,
    missing: 0
  };

  for (const entry of entries) {
    const status = entry?.status || 'missing';
    counts[status] = (counts[status] || 0) + 1;
  }

  const overallStatus = counts.missing > 0
    ? 'missing'
    : counts.stale > 0
      ? 'stale'
      : counts.degraded > 0
        ? 'degraded'
        : 'ok';

  return {
    overallStatus,
    counts
  };
}

function buildHomepageHealth() {
  const filePath = path.join(SITE_DATA_ROOT, 'upcoming-releases.json');
  const payload = readJsonIfExists(filePath, { releases: [] });
  const stats = getFileStats(filePath);
  const modifiedHoursAgo = hoursSince(stats?.modifiedAt);
  const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.homepage;

  return {
    area: 'homepage',
    status: statusFromChecks({ exists: Boolean(stats), stale, degraded: !Array.isArray(payload?.releases) || payload.releases.length === 0 }),
    file: stats,
    modifiedHoursAgo,
    releaseCount: Array.isArray(payload?.releases) ? payload.releases.length : 0
  };
}

function buildCatalogHealth() {
  const entries = GAMES.map((game) => {
    const cardsPath = resolveDataFile(game, 'cards.json');
    const setsPath = resolveDataFile(game, 'sets.json');
    const cards = readJsonIfExists(cardsPath, []);
    const sets = readJsonIfExists(setsPath, []);
    const cardsStats = getFileStats(cardsPath);
    const setsStats = getFileStats(setsPath);
    const freshestModifiedAt = cardsStats?.modifiedAt || setsStats?.modifiedAt || null;
    const modifiedHoursAgo = hoursSince(freshestModifiedAt);
    const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.catalog;
    const exists = Boolean(cardsStats || setsStats);
    const degraded = !cardsStats || !setsStats || (Array.isArray(cards) && cards.length === 0 && game !== 'magic');
    const source = sourceRequirementStatus(game, 'catalogSource');

    return {
      game,
      status: statusFromChecks({ exists, stale, degraded }),
      source,
      cards: {
        file: cardsStats,
        count: Array.isArray(cards) ? cards.length : 0
      },
      sets: {
        file: setsStats,
        count: Array.isArray(sets) ? sets.length : 0
      },
      modifiedHoursAgo
    };
  });

  return {
    area: 'catalogs',
    ...summarizeSection(entries),
    entries
  };
}

function buildImagesHealth() {
  const entries = IMAGE_MIRROR_GAMES.map((game) => {
    const manifestPath = resolveDataFile(game, path.join('images', 'mirror-manifest.json'));
    const manifest = readJsonIfExists(manifestPath, null);
    const stats = getFileStats(manifestPath);
    const modifiedHoursAgo = hoursSince(stats?.modifiedAt);
    const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.imageManifest;
    const exists = Boolean(stats);
    const degraded = Boolean(manifest) && Number(manifest.failed || 0) > 0;
    const source = sourceRequirementStatus(game, 'catalogSource');

    return {
      game,
      status: statusFromChecks({ exists, stale, degraded }),
      source,
      file: stats,
      modifiedHoursAgo,
      cardsSeen: Number(manifest?.cards_seen || manifest?.cardsSeen || 0),
      downloaded: Number(manifest?.downloaded || 0),
      skippedExisting: Number(manifest?.skipped_existing || manifest?.skippedExisting || 0),
      missingSourceUrl: Number(manifest?.missing_source_url || manifest?.missingSourceUrl || 0),
      failed: Number(manifest?.failed || 0)
    };
  });

  return {
    area: 'images',
    ...summarizeSection(entries),
    entries
  };
}

function buildPricingHealth() {
  const snapshotPath = path.join(SITE_DATA_ROOT, 'pricing-snapshot.json');
  const snapshot = readJsonIfExists(snapshotPath, null);
  const snapshotStats = getFileStats(snapshotPath);
  const snapshotHoursAgo = hoursSince(snapshotStats?.modifiedAt);
  const snapshotStale = snapshotHoursAgo != null && snapshotHoursAgo > AGE_LIMITS_HOURS.pricingSnapshot;

  const sourceEntries = PRICING_SOURCES.map((source) => {
    const filePath = path.join(SITE_DATA_ROOT, 'pricing-sources', `${source}.json`);
    const rows = readJsonIfExists(filePath, []);
    const stats = getFileStats(filePath);
    const modifiedHoursAgo = hoursSince(stats?.modifiedAt);
    const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.pricingSource;
    const exists = Boolean(stats);

    return {
      source,
      status: statusFromChecks({ exists, stale, degraded: exists && Array.isArray(rows) && rows.length === 0 }),
      file: stats,
      modifiedHoursAgo,
      rows: Array.isArray(rows) ? rows.length : 0
    };
  });

  const sourceSummary = summarizeSection(sourceEntries);
  const snapshotDegraded = !snapshotStats || !Array.isArray(snapshot?.mergedPricingPreview);

  return {
    area: 'pricing',
    status: statusFromChecks({
      exists: Boolean(snapshotStats),
      stale: snapshotStale || sourceSummary.overallStatus === 'stale',
      degraded: snapshotDegraded || sourceSummary.overallStatus === 'degraded' || sourceSummary.overallStatus === 'missing'
    }),
    snapshot: {
      file: snapshotStats,
      modifiedHoursAgo: snapshotHoursAgo,
      status: snapshot?.status || null,
      sourceSnapshots: snapshot?.sourceSnapshots || {},
      previewCount: Array.isArray(snapshot?.mergedPricingPreview) ? snapshot.mergedPricingPreview.length : 0
    },
    sources: sourceEntries,
    sourceSummary
  };
}

function buildSummary(sections) {
  const statuses = sections.map((section) => section?.status || section?.overallStatus || 'missing');

  if (statuses.includes('missing')) return 'missing';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

function main() {
  const homepage = buildHomepageHealth();
  const catalogs = buildCatalogHealth();
  const images = buildImagesHealth();
  const pricing = buildPricingHealth();

  const payload = {
    generatedAt: new Date().toISOString(),
    overallStatus: buildSummary([homepage, catalogs, images, pricing]),
    sections: {
      homepage,
      catalogs,
      images,
      pricing
    }
  };

  ensureDir(SITE_DATA_ROOT);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Built system health report at ${OUTPUT_PATH}`);
  console.log(JSON.stringify({
    overallStatus: payload.overallStatus,
    homepage: homepage.status,
    catalogs: catalogs.overallStatus,
    images: images.overallStatus,
    pricing: pricing.status
  }, null, 2));
}

main();
