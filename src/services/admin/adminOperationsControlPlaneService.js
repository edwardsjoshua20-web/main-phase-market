export function normalizeAdminOperationsControlStatus(controlQuery) {
  return controlQuery?.data || {
    available: false,
    mode: 'unknown',
    reason: controlQuery?.isError
      ? (controlQuery?.error?.message || 'Automation control backend is not reachable.')
      : 'Checking automation control backend...'
  };
}

export function getBridgeChecks(controlStatus) {
  return Array.isArray(controlStatus?.bridge?.checks) ? controlStatus.bridge.checks : [];
}

export function getBridgeCheck(controlStatus, checkId) {
  return getBridgeChecks(controlStatus).find(
    (check) => String(check?.id || '').toLowerCase() === String(checkId || '').toLowerCase()
  ) || null;
}

export function getBridgeCheckStatus(controlStatus, checkId, fallback = 'missing') {
  return String(getBridgeCheck(controlStatus, checkId)?.status || fallback).toLowerCase();
}

export function summarizeBridgeStatuses(statuses = []) {
  const normalized = statuses.map((status) => String(status || 'missing').toLowerCase());
  if (normalized.includes('missing')) return 'missing';
  if (normalized.includes('degraded')) return 'degraded';
  if (normalized.includes('stale')) return 'stale';
  return 'ok';
}

export function derivePipelineControlsStatus(controlStatus) {
  const controlsAvailable = Boolean(controlStatus?.available);
  if (!controlsAvailable) return 'degraded';

  const bridgeStatus = summarizeBridgeStatuses([
    getBridgeCheckStatus(controlStatus, 'allowed-job-map'),
    getBridgeCheckStatus(controlStatus, 'dependency-preflight'),
    getBridgeCheckStatus(controlStatus, 'single-run-locks'),
    getBridgeCheckStatus(controlStatus, 'audit-log'),
    getBridgeCheckStatus(controlStatus, 'run-history')
  ]);

  return bridgeStatus === 'ok' ? 'ok' : 'degraded';
}

export function deriveRunnerAuditStatus(controlStatus) {
  const controlsAvailable = Boolean(controlStatus?.available);
  const auditEntries = Array.isArray(controlStatus?.audit?.entries) ? controlStatus.audit.entries : [];
  const activeLocks = Array.isArray(controlStatus?.allowedJobs)
    ? controlStatus.allowedJobs.filter((job) => job?.lock).length
    : 0;
  const latestStatus = String(auditEntries[0]?.status || '').toLowerCase();

  if (!controlsAvailable) return 'degraded';
  if (['failed', 'failed-to-start', 'scheduler-error'].includes(latestStatus)) return 'degraded';
  if (activeLocks > 0 || latestStatus === 'started') return 'running';
  if (auditEntries.length === 0) return 'stale';
  return 'ok';
}

export function buildRunnerAuditSnapshot(controlStatus) {
  const entries = Array.isArray(controlStatus?.audit?.entries) ? controlStatus.audit.entries : [];
  const allowedJobs = Array.isArray(controlStatus?.allowedJobs) ? controlStatus.allowedJobs : [];
  const activeLocks = allowedJobs.filter((job) => job?.lock).length;
  const latestEntry = entries[0] || null;
  const latestStatus = String(latestEntry?.status || '').toLowerCase();
  const failureStatuses = new Set(['failed', 'failed-to-start', 'scheduler-error']);
  const blockedStatuses = new Set(['blocked']);
  const completedStatuses = new Set(['completed']);
  const startedStatuses = new Set(['started']);
  const completedCount = entries.filter((entry) => completedStatuses.has(String(entry?.status || '').toLowerCase())).length;
  const blockedCount = entries.filter((entry) => blockedStatuses.has(String(entry?.status || '').toLowerCase())).length;
  const failureCount = entries.filter((entry) => failureStatuses.has(String(entry?.status || '').toLowerCase())).length;
  const startedCount = entries.filter((entry) => startedStatuses.has(String(entry?.status || '').toLowerCase())).length;
  const runningCount = Math.max(startedCount, activeLocks);

  return {
    status: deriveRunnerAuditStatus(controlStatus),
    latestEntry,
    entries,
    activeLocks,
    totalRuns: entries.length,
    generatedAt: controlStatus?.audit?.generatedAt || null,
    uniqueActors: [...new Set(entries.map((entry) => entry?.actor).filter(Boolean))],
    completedCount,
    blockedCount,
    failureCount,
    startedCount,
    latestStatus,
    succeeded: completedCount,
    failed: failureCount,
    running: runningCount,
    hasVisibleTrail: entries.length > 0,
    proofStatus:
      !controlStatus?.available
        ? 'bridge-unavailable'
        : entries.length === 0
          ? 'no-audit-history'
          : failureCount > 0
            ? 'failing'
            : runningCount > 0
              ? 'active'
              : 'healthy'
  };
}

export function buildControlPlaneSnapshot(controlStatus) {
  const controlsAvailable = Boolean(controlStatus?.available);
  const scheduler = controlStatus?.scheduler || {};
  const remoteConnectionsStatus = getBridgeCheckStatus(controlStatus, 'remote-connections');
  const allowedOriginsStatus = getBridgeCheckStatus(controlStatus, 'allowed-origins');
  const supabaseUrlStatus = getBridgeCheckStatus(controlStatus, 'supabase-url');
  const supabaseServiceRoleStatus = getBridgeCheckStatus(controlStatus, 'supabase-service-role');
  const auditLogStatus = getBridgeCheckStatus(controlStatus, 'audit-log');
  const runHistoryStatus = getBridgeCheckStatus(controlStatus, 'run-history');
  const lockStatus = getBridgeCheckStatus(controlStatus, 'single-run-locks');
  const preflightStatus = getBridgeCheckStatus(controlStatus, 'dependency-preflight');
  const allowedJobMapStatus = getBridgeCheckStatus(controlStatus, 'allowed-job-map');
  const schedulerMapStatus = getBridgeCheckStatus(controlStatus, 'scheduler-map');
  const bridgeConnectionStatus = summarizeBridgeStatuses([
    remoteConnectionsStatus,
    allowedOriginsStatus,
    supabaseUrlStatus,
    supabaseServiceRoleStatus,
    allowedJobMapStatus
  ]);
  const auditSurfaceStatus = summarizeBridgeStatuses([auditLogStatus, runHistoryStatus]);

  return {
    controlsAvailable,
    scheduler,
    bridgeChecks: getBridgeChecks(controlStatus),
    remoteConnectionsStatus,
    allowedOriginsStatus,
    supabaseUrlStatus,
    supabaseServiceRoleStatus,
    auditLogStatus,
    runHistoryStatus,
    lockStatus,
    preflightStatus,
    allowedJobMapStatus,
    schedulerMapStatus,
    bridgeConnectionStatus,
    auditSurfaceStatus
  };
}
