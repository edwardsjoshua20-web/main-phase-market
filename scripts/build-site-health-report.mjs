import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { getGameDataAliases, sourceRequirementStatus } from './lib/source-registry.mjs';
import { siteAutomationSections } from '../src/services/automation/siteAutomationRegistry.js';
import { resolveRuntimeSiteDataRoot, getRuntimeAutomationRunsPath } from './lib/runtime-site-data-paths.mjs';

const ROOT = process.cwd();
const PUBLIC_DATA_ROOT = path.join(ROOT, 'public', 'data');
const PUBLIC_SITE_DATA_ROOT = path.join(PUBLIC_DATA_ROOT, 'site');
const SITE_DATA_ROOT = resolveRuntimeSiteDataRoot(ROOT);
const OUTPUT_PATH = path.join(SITE_DATA_ROOT, 'system-health.json');
const RUN_HISTORY_PATH = getRuntimeAutomationRunsPath(ROOT);

const GAMES = ['magic', 'pokemon', 'yugioh', 'onepiece', 'lorcana', 'fab', 'starwars'];
const IMAGE_MIRROR_GAMES = ['magic', 'pokemon', 'yugioh', 'onepiece', 'lorcana', 'fab', 'starwars'];
const PRICING_SOURCES = ['cardkingdom', 'tcgplayer', 'starcitygames'];
const SECTION_JOB_MAP = siteAutomationSections;

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

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function escapePowerShellLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function writeJsonViaPowerShell(filePath, serialized) {
  const tempPath = path.join(os.tmpdir(), `mpm-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(tempPath, serialized);
  const scriptPath = path.join(os.tmpdir(), `mpm-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);

  try {
    const script = [
      `$target = '${escapePowerShellLiteral(filePath)}'`,
      `$source = '${escapePowerShellLiteral(tempPath)}'`,
      `$content = [System.IO.File]::ReadAllText($source)`,
      `[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null`,
      `[System.IO.File]::WriteAllText($target, $content, [System.Text.UTF8Encoding]::new($false))`
    ].join('\r\n');
    fs.writeFileSync(scriptPath, script);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      stdio: 'pipe',
      windowsHide: true
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString?.().trim();
      throw new Error(stderr || `PowerShell fallback write failed for ${filePath}`);
    }
    const persisted = fs.readFileSync(filePath, 'utf8');
    if (persisted !== serialized) {
      throw new Error(`PowerShell fallback wrote unexpected content for ${filePath}`);
    }
  } finally {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Best-effort temp cleanup only.
    }
    try {
      fs.rmSync(scriptPath, { force: true });
    } catch {
      // Best-effort temp cleanup only.
    }
  }
}

function safeWriteJsonFile(filePath, payload, { retries = 4, delayMs = 75 } = {}) {
  ensureDir(path.dirname(filePath));
  const serialized = JSON.stringify(payload, null, 2);
  if (process.platform === 'win32') {
    writeJsonViaPowerShell(filePath, serialized);
    return;
  }
  const tempPath = path.join(os.tmpdir(), `mpm-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.writeFileSync(tempPath, serialized);
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { force: true });
        }
      } catch {
        // Best-effort temp cleanup only.
      }

      const code = String(error?.code || '').toUpperCase();
      const retryable = ['EPERM', 'EBUSY', 'EACCES'].includes(code);
      if (process.platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES', 'EXDEV'].includes(code)) {
        writeJsonViaPowerShell(filePath, serialized);
        return;
      }
      if (!retryable || attempt === retries) {
        throw error;
      }
      sleep(delayMs * (attempt + 1));
    }
  }
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

function readAutomationRuns() {
  const payload = readJsonIfExists(RUN_HISTORY_PATH, { generatedAt: null, jobs: {} });
  return {
    generatedAt: payload?.generatedAt || null,
    jobs: payload?.jobs && typeof payload.jobs === 'object' ? payload.jobs : {}
  };
}

function buildAutomationSummary(jobIds, automationRuns) {
  const entries = jobIds.map((jobId) => {
    const run = automationRuns?.jobs?.[jobId] || null;
    return {
      jobId,
      ...run
    };
  });

  return {
    jobIds,
    totalJobs: entries.length,
    missingJobs: entries.filter((entry) => !entry.lastStatus).length,
    failedJobs: entries.filter((entry) => entry.lastStatus === 'failed').length,
    runningJobs: entries.filter((entry) => entry.lastStatus === 'running').length,
    lastSuccessfulRunAt: entries
      .map((entry) => entry.lastSucceededAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null,
    lastFailedRunAt: entries
      .map((entry) => entry.lastFailedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null,
    jobs: entries
  };
}

function buildHomepageHealth() {
  const filePath = path.join(PUBLIC_SITE_DATA_ROOT, 'upcoming-releases.json');
  const payload = readJsonIfExists(filePath, { releases: [] });
  const stats = getFileStats(filePath);
  const modifiedHoursAgo = hoursSince(stats?.modifiedAt);
  const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.homepage;
  const releaseCount = Array.isArray(payload?.releases) ? payload.releases.length : 0;

  return {
    area: 'homepage',
    status: statusFromChecks({ exists: Boolean(stats), stale, degraded: releaseCount === 0 }),
    file: stats,
    modifiedHoursAgo,
    releaseCount,
    diagnostics: releaseCount === 0
      ? ['Homepage feed has no releases to render.']
      : stale
        ? ['Homepage feed exists but is older than the freshness target.']
        : ['Homepage feed is current.']
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
    const mtgManifestPath = game === 'magic' ? resolveDataFile(game, 'manifest.json') : null;
    const mtgManifest = mtgManifestPath ? readJsonIfExists(mtgManifestPath, null) : null;
    const mtgManifestStats = mtgManifestPath ? getFileStats(mtgManifestPath) : null;
    const effectiveCardsStats = cardsStats || mtgManifestStats;
    const effectiveCardsCount = game === 'magic'
      ? Number(mtgManifest?.imported_cards || (Array.isArray(cards) ? cards.length : 0))
      : (Array.isArray(cards) ? cards.length : 0);
    const freshestModifiedAt = effectiveCardsStats?.modifiedAt || setsStats?.modifiedAt || null;
    const modifiedHoursAgo = hoursSince(freshestModifiedAt);
    const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.catalog;
    const exists = Boolean(effectiveCardsStats || setsStats);
    const degraded = game === 'magic'
      ? (!effectiveCardsStats || !setsStats || effectiveCardsCount === 0)
      : (!cardsStats || !setsStats || (Array.isArray(cards) && cards.length === 0));
    const source = sourceRequirementStatus(game, 'catalogSource');

    const diagnostics = [];
    if (!source || source.configured === false || source.type === 'missing') {
      diagnostics.push('Catalog source is not configured yet.');
    }
    if (source?.type === 'file' && source.exists === false) {
      diagnostics.push('Expected local source file is missing.');
    }
    if (!effectiveCardsStats) {
      diagnostics.push('cards.json or manifest output is missing.');
    }
    if (!setsStats) {
      diagnostics.push('sets.json output is missing.');
    }
    if (stale) {
      diagnostics.push('Catalog output is stale and needs a refresh run.');
    }
    if (diagnostics.length === 0) {
      diagnostics.push('Catalog output is current.');
    }

    return {
      game,
      status: statusFromChecks({ exists, stale, degraded }),
      source,
      cards: {
        file: effectiveCardsStats,
        count: effectiveCardsCount
      },
      sets: {
        file: setsStats,
        count: Array.isArray(sets) ? sets.length : 0
      },
      modifiedHoursAgo,
      diagnostics
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
    const unexpectedFailures = Number(manifest?.unexpected_failures || manifest?.unexpectedFailures || 0);
    const degraded = Boolean(manifest) && unexpectedFailures > 0;
    const source = sourceRequirementStatus(game, 'catalogSource');

    const diagnostics = [];
    if (!stats) {
      diagnostics.push('Image mirror manifest is missing.');
    }
    if (stale) {
      diagnostics.push('Image mirror manifest is stale and should be rebuilt.');
    }
    if (unexpectedFailures > 0) {
      diagnostics.push(`Unexpected image failures detected: ${unexpectedFailures}.`);
    }
    if (Number(manifest?.failed || 0) > 0) {
      diagnostics.push(`Known image fetch failures recorded: ${Number(manifest.failed)}.`);
    }
    if (diagnostics.length === 0) {
      diagnostics.push('Image mirror output is current.');
    }

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
      failed: Number(manifest?.failed || 0),
      upstream404: Number(manifest?.upstream_404 || manifest?.upstream404 || 0),
      upstream403: Number(manifest?.upstream_403 || manifest?.upstream403 || 0),
      unexpectedFailures,
      diagnostics
    };
  });

  return {
    area: 'images',
    ...summarizeSection(entries),
    entries
  };
}

function buildPricingHealth() {
  const snapshotPath = path.join(PUBLIC_SITE_DATA_ROOT, 'pricing-snapshot.json');
  const snapshot = readJsonIfExists(snapshotPath, null);
  const snapshotStats = getFileStats(snapshotPath);
  const snapshotHoursAgo = hoursSince(snapshotStats?.modifiedAt);
  const snapshotStale = snapshotHoursAgo != null && snapshotHoursAgo > AGE_LIMITS_HOURS.pricingSnapshot;

  const sourceEntries = PRICING_SOURCES.map((source) => {
    const filePath = path.join(PUBLIC_SITE_DATA_ROOT, 'pricing-sources', `${source}.json`);

    const rows = readJsonIfExists(filePath, []);
    const stats = getFileStats(filePath);
    const modifiedHoursAgo = hoursSince(stats?.modifiedAt);
    const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.pricingSource;
    const exists = Boolean(stats);
    const diagnostics = [];

    if (!stats) {
      diagnostics.push('Pricing source snapshot is missing.');
    }
    if (stale) {
      diagnostics.push('Pricing source snapshot is stale.');
    }
    if (exists && Array.isArray(rows) && rows.length === 0) {
      diagnostics.push('Pricing source snapshot exists but has no rows.');
    }
    if (diagnostics.length === 0) {
      diagnostics.push('Pricing source snapshot is current.');
    }

    return {
      source,
      status: statusFromChecks({ exists, stale, degraded: exists && Array.isArray(rows) && rows.length === 0 }),
      file: stats,
      modifiedHoursAgo,
      rows: Array.isArray(rows) ? rows.length : 0,
      diagnostics
    };
  });

  const sourceSummary = summarizeSection(sourceEntries);
  const snapshotDegraded = !snapshotStats || !Array.isArray(snapshot?.mergedPricingPreview);
  const diagnostics = [];

  if (!snapshotStats) {
    diagnostics.push('Merged pricing snapshot is missing.');
  }
  if (snapshotStale) {
    diagnostics.push('Merged pricing snapshot is stale.');
  }
  if (sourceSummary.overallStatus === 'missing') {
    diagnostics.push('One or more pricing source snapshots are missing.');
  }
  if (sourceSummary.overallStatus === 'stale') {
    diagnostics.push('One or more pricing source snapshots are stale.');
  }
  if (sourceSummary.overallStatus === 'degraded') {
    diagnostics.push('One or more pricing source snapshots are degraded.');
  }
  if (diagnostics.length === 0) {
    diagnostics.push('Pricing pipeline is current.');
  }

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
    sourceSummary,
    diagnostics
  };
}

function buildGameReadiness(catalogs, images) {
  const catalogMap = new Map((catalogs?.entries || []).map((entry) => [entry.game, entry]));
  const imageMap = new Map((images?.entries || []).map((entry) => [entry.game, entry]));

  const entries = GAMES.map((game) => {
    const catalogEntry = catalogMap.get(game) || {};
    const imageEntry = imageMap.get(game) || {};
    const source = catalogEntry.source || imageEntry.source || { configured: false, type: 'missing' };
    const cardsCount = Number(catalogEntry?.cards?.count || 0);
    const setsCount = Number(catalogEntry?.sets?.count || 0);
    const imageCardsSeen = Number(imageEntry?.cardsSeen || 0);

    let stage = 'source-missing';
    let score = 0;
    let nextAction = 'Configure a source for this game.';

    const sourceReady = source.type === 'remote' || (source.type === 'file' && source.exists);
    if (sourceReady) {
      stage = 'backfill-needed';
      score = 20;
      nextAction = 'Run card backfill to generate cards.json.';
    }

    if (cardsCount > 0) {
      stage = 'sets-needed';
      score = 45;
      nextAction = 'Run set extraction to generate sets.json.';
    }

    if (cardsCount > 0 && setsCount > 0) {
      stage = 'images-needed';
      score = 70;
      nextAction = 'Run image mirror to generate image manifests and hosted card art.';
    }

    if (cardsCount > 0 && setsCount > 0 && imageCardsSeen > 0) {
      stage = 'storefront-ready';
      score = 100;
      nextAction = 'Operational. Keep the scheduled refresh jobs healthy.';
    }

    if (catalogEntry?.status === 'stale' || imageEntry?.status === 'stale') {
      stage = 'maintenance-needed';
      score = Math.max(score, 85);
      nextAction = 'Refresh stale outputs so the storefront stays current.';
    }

    return {
      game,
      stage,
      readinessScore: score,
      nextAction,
      source,
      cardsCount,
      setsCount,
      imageCardsSeen,
      catalogStatus: catalogEntry?.status || 'missing',
      imageStatus: imageEntry?.status || 'missing'
    };
  });

  return {
    area: 'readiness',
    overallStatus: entries.every((entry) => entry.readinessScore >= 100)
      ? 'ok'
      : entries.some((entry) => entry.readinessScore <= 0)
        ? 'missing'
        : 'degraded',
    averageScore: entries.length
      ? Math.round(entries.reduce((total, entry) => total + entry.readinessScore, 0) / entries.length)
      : 0,
    entries
  };
}

function buildSummary(sections) {
  const statuses = sections.map((section) => section?.status || section?.overallStatus || 'missing');

  if (statuses.includes('missing')) return 'missing';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

function attachAutomationSummaries(sections, automationRuns) {
  for (const [sectionKey, jobIds] of Object.entries(SECTION_JOB_MAP)) {
    if (!sections[sectionKey]) continue;
    sections[sectionKey].automation = buildAutomationSummary(jobIds, automationRuns);
  }
}

function main() {
  const automationRuns = readAutomationRuns();
  const homepage = buildHomepageHealth();
  const catalogs = buildCatalogHealth();
  const images = buildImagesHealth();
  const pricing = buildPricingHealth();
  const readiness = buildGameReadiness(catalogs, images);

  const sections = {
    homepage,
    catalogs,
    images,
    pricing,
    readiness
  };

  attachAutomationSummaries(sections, automationRuns);

  const payload = {
    generatedAt: new Date().toISOString(),
    overallStatus: buildSummary([homepage, catalogs, images, pricing, readiness]),
    automationRuns,
    sections
  };

  safeWriteJsonFile(OUTPUT_PATH, payload);
  console.log(`Built system health report at ${OUTPUT_PATH}`);
  console.log(JSON.stringify({
    overallStatus: payload.overallStatus,
    homepage: homepage.status,
    catalogs: catalogs.overallStatus,
    images: images.overallStatus,
    pricing: pricing.status,
    readiness: readiness.overallStatus
  }, null, 2));
}

main();
