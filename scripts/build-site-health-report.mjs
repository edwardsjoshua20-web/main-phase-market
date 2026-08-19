import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { getGameDataAliases, sourceRequirementStatus } from './lib/source-registry.mjs';
import { getAutomationJobById, siteAutomationSections } from '../src/services/automation/siteAutomationRegistry.js';
import { resolveRuntimeSiteDataRoot, getRuntimeAutomationRunsPath } from './lib/runtime-site-data-paths.mjs';
import { readSupabaseUploadConfig, toObjectKey, toStorageBaseUrl } from './lib/supabase-public-data-upload.mjs';

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
  imageManifest: 48,
  inventoryBackup: 30
};
const STALE_ACTIVE_LIMITS_MS = {
  'system-health-report': 15 * 60 * 1000,
  'homepage-upcoming-releases': 15 * 60 * 1000,
  'pricing-refresh': 45 * 60 * 1000,
  'card-backfill-refresh': 2 * 60 * 60 * 1000,
  'catalog-refresh': 2 * 60 * 60 * 1000,
  'image-repair-sync': 6 * 60 * 60 * 1000,
  'inventory-backup': 30 * 60 * 1000
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

function getDataObjectCandidates(game, relativePath) {
  return getGameDataAliases(game).map((alias) => `data/${alias}/${relativePath.replace(/\\/g, '/')}`);
}

async function firstPublishedObject(checkPublishedObject, candidates) {
  if (typeof checkPublishedObject !== 'function') return null;

  for (const relativePath of candidates) {
    const published = await checkPublishedObject(relativePath);
    if (published?.exists) {
      return published;
    }
  }

  return null;
}

function hoursSince(isoString) {
  if (!isoString) return null;
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return null;
  return Math.round((((Date.now() - time) / (1000 * 60 * 60)) + Number.EPSILON) * 100) / 100;
}

function freshestIso(...isoStrings) {
  return isoStrings
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}

function statusFromChecks({ exists = true, stale = false, degraded = false }) {
  if (!exists) return 'missing';
  if (stale) return 'stale';
  if (degraded) return 'degraded';
  return 'ok';
}

async function createPublishedObjectChecker() {
  let config;
  try {
    config = readSupabaseUploadConfig(ROOT);
  } catch {
    return async () => null;
  }

  if (!config.supabaseUrl || !config.serviceRoleKey || !config.bucketName) {
    return async () => null;
  }

  const storageBaseUrl = toStorageBaseUrl(config.supabaseUrl, config.bucketName);
  const cache = new Map();

  return async (relativePath) => {
    const normalizedPath = String(relativePath || '').replace(/\\/g, '/');
    if (!normalizedPath) return null;
    if (cache.has(normalizedPath)) return cache.get(normalizedPath);

    const response = await fetch(`${storageBaseUrl}/${toObjectKey(normalizedPath)}`, {
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        Range: 'bytes=0-0'
      }
    }).catch((error) => ({
      ok: false,
      status: 0,
      headers: new Headers(),
      text: async () => error?.message || 'network-error'
    }));

    const lastModified = response.headers?.get?.('last-modified') || null;
    const contentLength = response.headers?.get?.('content-length') || null;
    const contentRange = response.headers?.get?.('content-range') || null;
    const published = {
      path: normalizedPath,
      exists: response.ok || response.status === 206,
      statusCode: response.status,
      size: Number(contentLength || contentRange?.match(/\/(\d+)$/)?.[1] || 0) || null,
      modifiedAt: lastModified ? new Date(lastModified).toISOString() : null
    };

    cache.set(normalizedPath, published);
    return published;
  };
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

async function readSupabaseAutomationLedger() {
  let config;
  try {
    config = readSupabaseUploadConfig(ROOT);
  } catch {
    return {
      status: 'skipped',
      reason: 'supabase-config-unavailable',
      rows: []
    };
  }

  if (!config.supabaseUrl || !config.serviceRoleKey) {
    return {
      status: 'skipped',
      reason: 'supabase-config-incomplete',
      rows: []
    };
  }

  const url = `${String(config.supabaseUrl).replace(/\/+$/, '')}/rest/v1/automation_latest_runs?select=*&order=job_id.asc`;
  const response = await fetch(url, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return {
      status: 'failed',
      reason: `supabase-ledger-read-failed:${response.status}`,
      detail: detail.slice(0, 300),
      rows: []
    };
  }

  const rows = await response.json().catch(() => []);
  return {
    status: 'ok',
    rows: Array.isArray(rows) ? rows : []
  };
}

function normalizeLedgerStatus(status) {
  const normalized = String(status || 'missing').toLowerCase();
  if (normalized === 'queued' || normalized === 'dispatching') return 'running';
  if (['ok', 'failed', 'cancelled', 'running'].includes(normalized)) return normalized;
  return 'missing';
}

function isIsoAtOrAfter(candidate, reference) {
  if (!candidate || !reference) return false;
  const candidateMs = new Date(candidate).getTime();
  const referenceMs = new Date(reference).getTime();
  if (Number.isNaN(candidateMs) || Number.isNaN(referenceMs)) return false;
  return candidateMs >= referenceMs;
}

function getRunObservedAt(run = {}) {
  return run.finishedAt || run.startedAt || null;
}

function getRecentTerminalRuns(current = {}, status = null) {
  return (Array.isArray(current.recentRuns) ? current.recentRuns : [])
    .filter((run) => ['ok', 'failed', 'cancelled'].includes(run?.status))
    .filter((run) => !status || run.status === status)
    .filter((run) => getRunObservedAt(run))
    .sort((a, b) => new Date(getRunObservedAt(b)).getTime() - new Date(getRunObservedAt(a)).getTime());
}

function getNewestRecentTerminalRun(current = {}) {
  return getRecentTerminalRuns(current)[0] || null;
}

function getFreshestRecentTerminalAt(current = {}, status) {
  return getRunObservedAt(getRecentTerminalRuns(current, status)[0] || {});
}

function reconcileLedgerStatus(status, current = {}, startedAt = null, finishedAt = null) {
  const ledgerObservedAt = finishedAt || startedAt;
  const newestRecentRun = getNewestRecentTerminalRun(current);
  if (newestRecentRun && isIsoAtOrAfter(getRunObservedAt(newestRecentRun), ledgerObservedAt)) {
    return newestRecentRun.status === 'cancelled' ? 'failed' : newestRecentRun.status;
  }
  if (current.lastSucceededAt && isIsoAtOrAfter(current.lastSucceededAt, ledgerObservedAt)) {
    return 'ok';
  }
  if (current.lastFailedAt && isIsoAtOrAfter(current.lastFailedAt, ledgerObservedAt)) {
    return 'failed';
  }
  if (status !== 'running') return status;
  if (finishedAt) return current.lastFailedAt && isIsoAtOrAfter(current.lastFailedAt, finishedAt) ? 'failed' : 'ok';
  if (current.lastFinishedAt && isIsoAtOrAfter(current.lastFinishedAt, startedAt)) {
    return current.lastStatus && current.lastStatus !== 'running' ? current.lastStatus : 'ok';
  }
  return status;
}

function getStaleActiveCutoffMs(jobId) {
  return STALE_ACTIVE_LIMITS_MS[jobId] || 60 * 60 * 1000;
}

function isStaleActiveRun(jobId, status, startedAt) {
  if (status !== 'running' || !startedAt) return false;
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return false;
  return Date.now() - startedMs > getStaleActiveCutoffMs(jobId);
}

function mergeSupabaseAutomationLedger(automationRuns, ledgerRows = []) {
  if (!Array.isArray(ledgerRows) || ledgerRows.length === 0) {
    return automationRuns;
  }

  const next = {
    generatedAt: new Date().toISOString(),
    jobs: {
      ...(automationRuns?.jobs || {})
    }
  };

  for (const row of ledgerRows) {
    const jobId = String(row?.job_id || '').trim();
    if (!jobId) continue;

    const jobDefinition = getAutomationJobById(jobId);
    const current = next.jobs[jobId] || {};
    const ledgerStatus = normalizeLedgerStatus(row.last_status || row.status);
    const startedAt = row.last_started_at || row.started_at || row.created_at || null;
    const finishedAt = row.last_finished_at || row.finished_at || null;
    let status = reconcileLedgerStatus(ledgerStatus, current, startedAt, finishedAt);
    const staleActive = isStaleActiveRun(jobId, status, startedAt);
    if (staleActive) {
      status = 'failed';
    }
    const recentSucceededAt = getFreshestRecentTerminalAt(current, 'ok');
    const recentFailedAt = freshestIso(
      getFreshestRecentTerminalAt(current, 'failed'),
      getFreshestRecentTerminalAt(current, 'cancelled')
    );
    const existingRecentRuns = Array.isArray(current.recentRuns) ? current.recentRuns : [];
    const ledgerRecentRun = {
      pipeline: jobDefinition?.runnerJob || row.runner_reference || 'supabase-ledger',
      status,
      startedAt,
      finishedAt: staleActive ? new Date().toISOString() : finishedAt,
      durationMs: Number(row.last_duration_ms || row.duration_ms || 0) || null,
      exitCode: status === 'ok' ? 0 : status === 'failed' ? 1 : null,
      error: staleActive
        ? `Automation run stayed active past the stale-lock cutoff (${Math.round(getStaleActiveCutoffMs(jobId) / 60000)} minutes).`
        : row.last_error || row.error_message || null,
      triggerSource: row.trigger_source || null,
      runnerReference: row.runner_reference || null,
      runId: row.run_id || null,
      source: 'supabase-ledger',
      diagnostics: row.diagnostics && typeof row.diagnostics === 'object' ? row.diagnostics : {},
      recovered: staleActive ? 'stale-active-run-treated-as-failed' : null
    };

    const existingRunIds = new Set(existingRecentRuns.map((run) => run?.runId).filter(Boolean));
    const recentRuns = row.run_id && existingRunIds.has(row.run_id)
      ? existingRecentRuns
      : [ledgerRecentRun, ...existingRecentRuns].slice(0, 10);

    next.jobs[jobId] = {
      jobId,
      label: jobDefinition?.label || current.label || jobId,
      ...current,
      lastStatus: status,
      lastStartedAt: startedAt || current.lastStartedAt || null,
      lastFinishedAt: freshestIso(staleActive ? new Date().toISOString() : finishedAt, current.lastFinishedAt),
      lastSucceededAt: status === 'ok'
        ? freshestIso(recentSucceededAt, current.lastSucceededAt, finishedAt, startedAt)
        : (current.lastSucceededAt || null),
      lastFailedAt: status === 'failed'
        ? freshestIso(recentFailedAt, current.lastFailedAt, staleActive ? new Date().toISOString() : finishedAt, startedAt)
        : (current.lastFailedAt || null),
      lastDurationMs: Number(row.last_duration_ms || row.duration_ms || 0) || current.lastDurationMs || null,
      lastExitCode: status === 'ok' ? 0 : status === 'failed' ? 1 : (current.lastExitCode ?? null),
      lastError: status === 'failed'
        ? (staleActive
          ? `Automation run stayed active past the stale-lock cutoff (${Math.round(getStaleActiveCutoffMs(jobId) / 60000)} minutes).`
          : row.last_error || row.error_message || 'Automation run failed.')
        : null,
      recentRuns,
      ledger: {
        source: 'supabase',
        runId: row.run_id || null,
        triggerSource: row.trigger_source || null,
        runnerReference: row.runner_reference || null,
        diagnostics: row.diagnostics && typeof row.diagnostics === 'object' ? row.diagnostics : {},
        updatedAt: row.updated_at || null
      }
    };
  }

  return next;
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

async function buildCatalogHealth(checkPublishedObject) {
  const entries = await Promise.all(GAMES.map(async (game) => {
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
    const publishedCards = await firstPublishedObject(checkPublishedObject, [
      ...getDataObjectCandidates(game, 'cards.json'),
      ...(game === 'magic' ? getDataObjectCandidates(game, 'manifest.json') : [])
    ]);
    const publishedSets = await firstPublishedObject(checkPublishedObject, getDataObjectCandidates(game, 'sets.json'));
    const effectiveCardsCount = game === 'magic'
      ? Number(mtgManifest?.imported_cards || (Array.isArray(cards) ? cards.length : 0))
      : (Array.isArray(cards) ? cards.length : 0);
    const freshestModifiedAt = freshestIso(
      effectiveCardsStats?.modifiedAt,
      setsStats?.modifiedAt,
      publishedCards?.modifiedAt,
      publishedSets?.modifiedAt
    );
    const modifiedHoursAgo = hoursSince(freshestModifiedAt);
    const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.catalog;
    const cardsAvailable = Boolean(effectiveCardsStats || publishedCards?.exists);
    const setsAvailable = Boolean(setsStats || publishedSets?.exists);
    const exists = cardsAvailable || setsAvailable;
    const degraded = game === 'magic'
      ? (!cardsAvailable || !setsAvailable || (!publishedCards?.exists && effectiveCardsCount === 0))
      : (!cardsAvailable || !setsAvailable || (!publishedCards?.exists && Array.isArray(cards) && cards.length === 0));
    const source = sourceRequirementStatus(game, 'catalogSource');

    const diagnostics = [];
    if (!source || source.configured === false || source.type === 'missing') {
      diagnostics.push('Catalog source is not configured yet.');
    }
    if (source?.type === 'file' && source.exists === false) {
      diagnostics.push('Expected local source file is missing.');
    }
    if (!cardsAvailable) {
      diagnostics.push('cards.json or manifest output is missing.');
    } else if (!effectiveCardsStats && publishedCards?.exists) {
      diagnostics.push('Published Supabase catalog object exists; local runner artifact is not present.');
    }
    if (!setsAvailable) {
      diagnostics.push('sets.json output is missing.');
    } else if (!setsStats && publishedSets?.exists) {
      diagnostics.push('Published Supabase sets object exists; local runner artifact is not present.');
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
        published: publishedCards,
        count: effectiveCardsCount
      },
      sets: {
        file: setsStats,
        published: publishedSets,
        count: Array.isArray(sets) ? sets.length : 0
      },
      modifiedHoursAgo,
      diagnostics
    };
  }));

  return {
    area: 'catalogs',
    ...summarizeSection(entries),
    entries
  };
}

async function buildImagesHealth(checkPublishedObject) {
  const entries = await Promise.all(IMAGE_MIRROR_GAMES.map(async (game) => {
    const manifestPath = resolveDataFile(game, path.join('images', 'mirror-manifest.json'));
    const manifest = readJsonIfExists(manifestPath, null);
    const stats = getFileStats(manifestPath);
    const publishedManifest = await firstPublishedObject(checkPublishedObject, [
      ...getDataObjectCandidates(game, 'images/mirror-manifest.json'),
      ...getDataObjectCandidates(game, 'mirror-manifest.json')
    ]);
    const modifiedHoursAgo = hoursSince(freshestIso(stats?.modifiedAt, publishedManifest?.modifiedAt));
    const stale = modifiedHoursAgo != null && modifiedHoursAgo > AGE_LIMITS_HOURS.imageManifest;
    const exists = Boolean(stats || publishedManifest?.exists);
    const unexpectedFailures = Number(manifest?.unexpected_failures || manifest?.unexpectedFailures || 0);
    const degraded = Boolean(manifest) && unexpectedFailures > 0;
    const source = sourceRequirementStatus(game, 'catalogSource');

    const diagnostics = [];
    if (!exists) {
      diagnostics.push('Image mirror manifest is missing.');
    } else if (!stats && publishedManifest?.exists) {
      diagnostics.push('Published Supabase image manifest exists; local runner artifact is not present.');
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
      published: publishedManifest,
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
  }));

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

async function readSupabaseJson(config, relativePath, { headers = {} } = {}) {
  const response = await fetch(`${String(config.supabaseUrl).replace(/\/+$/, '')}${relativePath}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/json',
      ...headers
    }
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Supabase request failed ${response.status}: ${text.slice(0, 300)}`);
  }

  return {
    data: text ? JSON.parse(text) : null,
    response
  };
}

function parseContentRangeTotal(value) {
  const match = String(value || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function getSupabaseCount(config, relativePath) {
  const { response } = await readSupabaseJson(config, relativePath, {
    headers: {
      Prefer: 'count=exact',
      Range: '0-0'
    }
  });
  return parseContentRangeTotal(response.headers?.get?.('content-range'));
}

async function buildInventoryDurabilityHealth() {
  let config;
  try {
    config = readSupabaseUploadConfig(ROOT);
  } catch (error) {
    return {
      area: 'inventory',
      status: 'missing',
      diagnostics: [`Supabase service configuration is unavailable: ${error?.message || 'unknown error'}`]
    };
  }

  if (!config.supabaseUrl || !config.serviceRoleKey) {
    return {
      area: 'inventory',
      status: 'missing',
      diagnostics: ['Supabase URL or service role key is missing, so inventory backup status cannot be verified.']
    };
  }

  try {
    const latest = await readSupabaseJson(
      config,
      '/rest/v1/inventory_backup_runs?select=*&order=created_at.desc&limit=1'
    );
    const latestBackup = Array.isArray(latest.data) ? latest.data[0] || null : null;
    const backupAgeHours = hoursSince(latestBackup?.created_at);
    const stale = backupAgeHours != null && backupAgeHours > AGE_LIMITS_HOURS.inventoryBackup;
    const currentInventoryCount = await getSupabaseCount(
      config,
      '/rest/v1/app_entities?select=id&entity_name=in.(Card,Product)'
    );
    const auditCount = await getSupabaseCount(
      config,
      '/rest/v1/inventory_mutation_audit?select=id'
    );

    const diagnostics = [];
    if (!latestBackup) {
      diagnostics.push('No inventory backup run has been recorded yet.');
    } else if (stale) {
      diagnostics.push(`Latest inventory backup is ${backupAgeHours.toFixed(1)} hours old, beyond the ${AGE_LIMITS_HOURS.inventoryBackup} hour target.`);
    }
    if (latestBackup?.status && latestBackup.status !== 'ok') {
      diagnostics.push(`Latest inventory backup status is ${latestBackup.status}.`);
    }
    if (auditCount === 0) {
      diagnostics.push('Inventory mutation audit has no rows yet.');
    }
    if (diagnostics.length === 0) {
      diagnostics.push('Inventory backup and audit protection are visible.');
    }

    return {
      area: 'inventory',
      status: statusFromChecks({
        exists: Boolean(latestBackup),
        stale,
        degraded: latestBackup?.status && latestBackup.status !== 'ok'
      }),
      latestBackup: latestBackup
        ? {
            id: latestBackup.id,
            reason: latestBackup.reason,
            status: latestBackup.status,
            createdAt: latestBackup.created_at,
            createdBy: latestBackup.created_by,
            entityCount: Number(latestBackup.entity_count || 0),
            cardCount: Number(latestBackup.card_count || 0),
            productCount: Number(latestBackup.product_count || 0),
            freshnessHours: backupAgeHours
          }
        : null,
      currentInventory: {
        count: currentInventoryCount
      },
      audit: {
        mutationRows: auditCount
      },
      diagnostics
    };
  } catch (error) {
    return {
      area: 'inventory',
      status: 'degraded',
      diagnostics: [`Inventory durability health check failed: ${error?.message || 'unknown error'}`]
    };
  }
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
    const cardsAvailable = cardsCount > 0 || Boolean(catalogEntry?.cards?.published?.exists);
    const setsAvailable = setsCount > 0 || Boolean(catalogEntry?.sets?.published?.exists);
    const imagesAvailable = imageCardsSeen > 0 || Boolean(imageEntry?.published?.exists);

    let stage = 'source-missing';
    let score = 0;
    let nextAction = 'Configure a source for this game.';

    const sourceReady = source.type === 'remote' || (source.type === 'file' && source.exists);
    if (sourceReady) {
      stage = 'backfill-needed';
      score = 20;
      nextAction = 'Run card backfill to generate cards.json.';
    }

    if (cardsAvailable) {
      stage = 'sets-needed';
      score = 45;
      nextAction = 'Run set extraction to generate sets.json.';
    }

    if (cardsAvailable && setsAvailable) {
      stage = 'images-needed';
      score = 70;
      nextAction = 'Run image mirror to generate image manifests and hosted card art.';
    }

    if (cardsAvailable && setsAvailable && imagesAvailable) {
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
      cardsAvailable,
      setsAvailable,
      imagesAvailable,
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

async function main() {
  const ledger = await readSupabaseAutomationLedger();
  const automationRuns = mergeSupabaseAutomationLedger(readAutomationRuns(), ledger.rows);
  if (ledger.status === 'ok') {
    safeWriteJsonFile(RUN_HISTORY_PATH, automationRuns);
  }
  const checkPublishedObject = await createPublishedObjectChecker();
  const homepage = buildHomepageHealth();
  const catalogs = await buildCatalogHealth(checkPublishedObject);
  const images = await buildImagesHealth(checkPublishedObject);
  const pricing = buildPricingHealth();
  const inventory = await buildInventoryDurabilityHealth();
  const readiness = buildGameReadiness(catalogs, images);

  const sections = {
    homepage,
    catalogs,
    images,
    pricing,
    inventory,
    readiness
  };

  attachAutomationSummaries(sections, automationRuns);

  const payload = {
    generatedAt: new Date().toISOString(),
    overallStatus: buildSummary([homepage, catalogs, images, pricing, inventory, readiness]),
    automationLedger: {
      status: ledger.status,
      reason: ledger.reason || null,
      rows: ledger.rows.length
    },
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
    inventory: inventory.status,
    readiness: readiness.overallStatus
  }, null, 2));
}

main();
