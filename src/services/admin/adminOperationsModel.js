import {
  getAutomationDependencySummary,
  siteAutomationRegistry,
  siteAutomationSections
} from '@/services/automation/siteAutomationRegistry';

export const ADMIN_TIMEZONE = 'America/New_York';
export const sectionJobMap = siteAutomationSections;

export function formatSourceSummary(source) {
  if (!source || source.configured === false || source.type === 'missing') {
    return 'No source configured';
  }

  if (source.type === 'remote') {
    return source.url ? `Remote API: ${source.url}` : 'Remote API';
  }

  if (source.type === 'file') {
    return source.path || source.envVar || 'File source';
  }

  return 'Unknown source';
}

export function classifyEntryIssue(entry) {
  const source = entry?.source || null;
  const status = String(entry?.status || 'missing').toLowerCase();

  if (status === 'ok') return 'Operational';
  if (status === 'stale') return 'Output stale';
  if (status === 'degraded') return 'Output degraded';

  if (status === 'missing') {
    if (!source || source.configured === false || source.type === 'missing') {
      return 'Missing source config';
    }

    if (source.type === 'file' && !source.exists) {
      return 'Missing source file';
    }

    if (source.type === 'remote') {
      return 'Missing generated output';
    }

    if (source.type === 'file' && source.exists) {
      return 'Source ready, output missing';
    }
  }

  return 'Needs review';
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    timeZone: ADMIN_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

export function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}h ago`;
}

export function formatDuration(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const ms = Number(value);
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function getCadenceTargetHours(cadence) {
  const normalized = String(cadence || '').toLowerCase();
  if (normalized.includes('hourly')) return 1.5;
  if (normalized.includes('every-2-days')) return 54;
  if (normalized.includes('daily')) return 30;
  return 30;
}

export function getRunFreshnessHours(run) {
  const lastRunAt = run?.lastSucceededAt || run?.lastFinishedAt || run?.lastStartedAt || null;
  if (!lastRunAt) return null;
  const time = new Date(lastRunAt).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (Date.now() - time) / 36e5);
}

export function getBusinessImpact(jobId) {
  const impact = {
    'card-backfill-refresh': 'Raw card data feeding catalog, images, pricing, search, and storefront accuracy.',
    'catalog-refresh': 'Normalized card/search catalog used across storefront, deck tools, and admin inventory flows.',
    'image-repair-sync': 'Card image coverage across shop, deck builder, commander hub, and inventory intake.',
    'pricing-refresh': 'Storefront market price guidance and deck/card value calculations.',
    'homepage-upcoming-releases': 'Public homepage hero/release feed staying current for upcoming products.',
    'system-health-report': 'Admin visibility, incident detection, and freshness reporting.'
  };
  return impact[jobId] || 'Business automation health.';
}

export function getJobDetails(jobId) {
  return siteAutomationRegistry.find((job) => job.id === jobId) || null;
}

export function getRunRecord(automationRuns, jobId) {
  return automationRuns?.jobs?.[jobId] || null;
}

export function summarizeTargets(entries) {
  const names = entries
    .map((entry) => entry.game || entry.source || entry.id)
    .filter(Boolean);

  if (names.length === 0) return 'No affected targets listed';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

export function summarizeAutomationRuns(automationRuns) {
  const runs = Object.values(automationRuns?.jobs || {});
  return {
    ok: runs.filter((run) => run?.lastStatus === 'ok').length,
    failed: runs.filter((run) => run?.lastStatus === 'failed').length,
    running: runs.filter((run) => run?.lastStatus === 'running').length,
    missing: siteAutomationRegistry.filter((job) => !automationRuns?.jobs?.[job.id]?.lastStatus).length
  };
}

export function getControlReadiness(run) {
  const status = String(run?.lastStatus || 'missing').toLowerCase();

  if (status === 'ok') {
    return {
      label: 'Ready when runner is wired',
      tone: 'text-green-700',
      note: 'Latest recorded run completed successfully.'
    };
  }

  if (status === 'running') {
    return {
      label: 'Run in progress',
      tone: 'text-blue-700',
      note: 'Wait for this job to finish before allowing another run.'
    };
  }

  if (status === 'failed') {
    return {
      label: 'Needs review before rerun',
      tone: 'text-red-700',
      note: run?.lastError || 'The last run failed and should be reviewed before manual execution.'
    };
  }

  return {
    label: 'Needs first recorded run',
    tone: 'text-amber-700',
    note: 'No run history has been captured yet.'
  };
}

export function dependencyRunStatus(automationRuns, jobId) {
  return String(getRunRecord(automationRuns, jobId)?.lastStatus || 'missing').toLowerCase();
}

export function getDependencyDiagnostics(job, automationRuns) {
  const dependencySummary = getAutomationDependencySummary(job.id);
  const dependencies = dependencySummary.dependsOn.map((dependency) => ({
    ...dependency,
    runStatus: dependencyRunStatus(automationRuns, dependency.id)
  }));
  const blockers = dependencies.filter((dependency) => dependency.runStatus !== 'ok');

  return {
    dependencies,
    blocks: dependencySummary.blocks,
    blockers,
    ready: blockers.length === 0
  };
}

export function getControlEntry(controlStatus, jobId) {
  return (controlStatus?.allowedJobs || []).find((entry) => entry.jobId === jobId) || null;
}

export function getEffectivePreflight(job, automationRuns, controlStatus) {
  const controlEntry = getControlEntry(controlStatus, job.id);
  if (controlEntry?.preflight) {
    return controlEntry.preflight;
  }

  const diagnostics = getDependencyDiagnostics(job, automationRuns);
  return {
    ready: diagnostics.ready,
    blockers: diagnostics.blockers.map((dependency) => ({
      jobId: dependency.id,
      label: dependency.label,
      status: dependency.runStatus
    })),
    dependencies: diagnostics.dependencies.map((dependency) => ({
      jobId: dependency.id,
      label: dependency.label,
      status: dependency.runStatus
    })),
    message: diagnostics.ready
      ? 'Preflight passed. Upstream dependencies are healthy.'
      : `Blocked until ${diagnostics.blockers.map((dependency) => `${dependency.label} (${dependency.runStatus})`).join(', ')} is healthy.`
  };
}

export function buildRecommendedRunOrder(automationRuns, controlStatus) {
  const preferredOrder = [
    'card-backfill-refresh',
    'catalog-refresh',
    'image-repair-sync',
    'pricing-refresh',
    'homepage-upcoming-releases',
    'system-health-report'
  ];

  return preferredOrder
    .map((jobId) => getJobDetails(jobId))
    .filter(Boolean)
    .map((job) => {
      const run = getRunRecord(automationRuns, job.id);
      const preflight = getEffectivePreflight(job, automationRuns, controlStatus);
      const status = String(run?.lastStatus || 'missing').toLowerCase();
      return {
        ...job,
        run,
        status,
        preflight,
        recommended: status !== 'ok' || !preflight.ready
      };
    });
}

export function deriveAreaStatus(sectionStatuses, automationSummary) {
  if (sectionStatuses.includes('missing') || automationSummary.missing > 0) return 'missing';
  if (sectionStatuses.includes('degraded') || automationSummary.failed > 0 || automationSummary.running > 0) return 'degraded';
  if (sectionStatuses.includes('stale')) return 'stale';
  return 'ok';
}

export function deriveAutomationHistoryStatus(automationSummary) {
  if (automationSummary.failed > 0) return 'failed';
  if (automationSummary.running > 0) return 'running';
  if (automationSummary.missing > 0) return 'missing';
  return 'ok';
}

export function deriveServiceLevelStatus(rows) {
  if (rows.some((row) => row.status === 'failed')) return 'failed';
  if (rows.some((row) => row.status === 'missing')) return 'missing';
  if (rows.some((row) => row.status === 'running')) return 'running';
  if (rows.some((row) => row.status === 'stale')) return 'stale';
  return 'ok';
}

export function deriveLaunchReadinessStatus(readiness) {
  return readiness.rows.some((row) => row.status !== 'ok') ? 'degraded' : 'ok';
}

export function deriveSourceGovernanceStatus(rows) {
  if (rows.some((row) => row.status === 'missing')) return 'missing';
  if (rows.some((row) => row.status !== 'ok')) return 'degraded';
  return 'ok';
}

export function deriveDataContractsStatus(rows) {
  if (rows.some((row) => String(row.status).toLowerCase() === 'missing')) return 'missing';
  if (rows.some((row) => String(row.status).toLowerCase() !== 'ok')) return 'degraded';
  return 'ok';
}

export function getBridgeChecks(controlStatus) {
  return Array.isArray(controlStatus?.bridge?.checks) ? controlStatus.bridge.checks : [];
}

export function getBridgeCheck(controlStatus, checkId) {
  return getBridgeChecks(controlStatus).find((check) => String(check?.id || '').toLowerCase() === String(checkId || '').toLowerCase()) || null;
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

export function deriveIncidentQueueStatus(incidents) {
  if (incidents.some((incident) => incident.status === 'failed')) return 'failed';
  if (incidents.some((incident) => incident.status === 'missing')) return 'missing';
  if (incidents.some((incident) => incident.status === 'degraded')) return 'degraded';
  if (incidents.some((incident) => incident.status === 'stale')) return 'stale';
  return 'ok';
}

export function deriveCapabilityConfidenceStatus(rows) {
  if (rows.some((row) => row.status === 'missing')) return 'missing';
  if (rows.some((row) => row.status === 'stale')) return 'stale';
  return 'ok';
}

export function deriveControlPlaneStatus(rows) {
  if (rows.some((row) => row.status === 'missing')) return 'missing';
  if (rows.some((row) => row.status === 'degraded')) return 'degraded';
  if (rows.some((row) => row.status === 'stale')) return 'stale';
  return 'ok';
}

export function buildActionItems(systemHealth, sections, automationRuns) {
  const items = [];
  const orderedKeys = ['catalogs', 'images', 'pricing', 'homepage', 'readiness'];

  orderedKeys.forEach((sectionKey) => {
    const section = sections?.[sectionKey];
    if (!section) return;

    const topStatus = String(section?.status || section?.overallStatus || 'missing').toLowerCase();
    if (topStatus === 'ok') return;

    const entries = Array.isArray(section?.entries) ? section.entries : [];
    const affected = entries.filter((entry) => String(entry?.status || 'missing').toLowerCase() !== 'ok');
    const jobs = (sectionJobMap[sectionKey] || [])
      .map((jobId) => {
        const job = getJobDetails(jobId);
        if (!job) return null;
        return {
          ...job,
          run: getRunRecord(automationRuns, jobId)
        };
      })
      .filter(Boolean);

    const severityRank = { missing: 3, degraded: 2, stale: 1 };

    items.push({
      sectionKey,
      label: sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1),
      status: topStatus,
      severity: severityRank[topStatus] || 0,
      affectedCount: affected.length,
      affectedSummary: summarizeTargets(affected),
      jobs,
      note:
        affected.length > 0
          ? `Affected targets: ${summarizeTargets(affected)}`
          : topStatus === 'missing'
            ? 'Pipeline output is missing and needs a refresh.'
            : topStatus === 'stale'
              ? 'Pipeline output exists but is older than target freshness.'
              : 'Pipeline output exists but has degraded quality or coverage.'
    });
  });

  if (items.length === 0) {
    items.push({
      sectionKey: 'all-systems',
      label: 'All systems',
      status: 'ok',
      severity: 0,
      affectedCount: 0,
      affectedSummary: 'All pipeline families are healthy right now.',
      jobs: [],
      note: 'No blocking operations work is needed right now. We can focus on product, storefront, and business-facing improvements.'
    });
  }

  return items.sort((a, b) => b.severity - a.severity || b.affectedCount - a.affectedCount);
}

export function buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus) {
  const incidents = [];
  const severityRank = { critical: 4, warning: 3, watch: 2, info: 1 };
  const addIncident = (incident) => {
    incidents.push({
      id: incident.id,
      severity: incident.severity || 'warning',
      status: incident.status || 'degraded',
      title: incident.title,
      owner: incident.owner || 'operations',
      evidence: incident.evidence || 'No evidence captured.',
      fix: incident.fix || 'Review the owning pipeline and rerun after dependencies are healthy.',
      job: incident.job || null,
      impactedCapabilities: Array.isArray(incident.impactedCapabilities) ? incident.impactedCapabilities : []
    });
  };

  if (!controlStatus?.available) {
    addIncident({
      id: 'bridge-unavailable',
      severity: 'warning',
      status: 'degraded',
      title: 'Operations bridge is not connected',
      owner: 'operations',
      evidence: controlStatus?.reason || 'Hosted admin page cannot reach the local operations backend.',
      fix: 'Connect the operations backend, set VITE_API_ORIGIN on Cloudflare Pages, then redeploy.'
    });
  }

  const bridgeChecks = Array.isArray(controlStatus?.bridge?.checks) ? controlStatus.bridge.checks : [];
  bridgeChecks
    .filter((check) => String(check?.status || 'missing').toLowerCase() !== 'ok')
    .forEach((check) => {
      addIncident({
        id: `bridge-check-${check.id || check.label}`,
        severity: 'warning',
        status: check.status || 'degraded',
        title: `Bridge readiness check: ${check.label || check.id || 'unknown check'}`,
        owner: 'operations',
        evidence: check.detail || 'Backend readiness check is not green.',
        fix: 'Fix the backend readiness check before relying on hosted manual controls.'
      });
    });

  if (controlStatus?.scheduler && !controlStatus.scheduler.enabled) {
    addIncident({
      id: 'scheduler-disabled',
      severity: controlStatus.scheduler.configured ? 'watch' : 'info',
      status: 'degraded',
      title: 'Automation scheduler is disabled',
      owner: 'operations',
      evidence: controlStatus.scheduler.configured
        ? 'Scheduler is configured but currently not enabled.'
        : 'Scheduler is waiting for MPM_AUTOMATION_SCHEDULER_ENABLED=true.',
      fix: 'Enable the scheduler only after the bridge and pipeline controls are verified.'
    });
  }

  const dueJobs = Array.isArray(controlStatus?.scheduler?.dueJobs) ? controlStatus.scheduler.dueJobs : [];
  if (dueJobs.length > 0) {
    const labels = dueJobs
      .map((jobId) => getJobDetails(jobId)?.label || jobId)
      .join(', ');
    addIncident({
      id: 'scheduler-due-jobs',
      severity: 'watch',
      status: 'degraded',
      title: 'Scheduler has due jobs',
      owner: 'operations',
      evidence: labels,
      fix: 'Let the scheduler run, or trigger the recommended pipeline order manually if the runner is connected.'
    });
  }

  Object.entries(automationRuns?.jobs || {}).forEach(([jobId, run]) => {
    const status = String(run?.lastStatus || 'missing').toLowerCase();
    if (status !== 'failed') return;
    const job = getJobDetails(jobId);
    addIncident({
      id: `failed-run-${jobId}`,
      severity: 'critical',
      status: 'failed',
      title: `${job?.label || jobId} failed`,
      owner: job?.owner || 'operations',
      evidence: run?.lastError || `Last failed at ${formatDate(run?.lastFailedAt)}.`,
      fix: 'Review the error, confirm upstream dependencies are healthy, then rerun the job.',
      job
    });
  });

  const sourceRows = buildSourceGovernanceRows(sections);
  sourceRows
    .filter((row) => row.status !== 'ok')
    .forEach((row) => {
      addIncident({
        id: `source-governance-${row.game}`,
        severity: 'critical',
        status: 'missing',
        title: `${row.game} source is not operational`,
        owner: row.controlModel === 'Managed locally' ? 'catalog' : 'operations',
        evidence: `${row.sourceType} / ${row.controlModel}: ${row.upstream}`,
        fix: row.controlModel === 'Managed locally'
          ? `Restore the local source for ${row.game}, then run Card backfill refresh -> Catalog refresh -> Image repair and sync.`
          : `Repair or replace the external ${row.game} feed, then rerun the dependent pipeline order.`,
        impactedCapabilities: row.feeds
      });
    });

  const orderedSections = [
    ['catalogs', 'Catalog pipelines'],
    ['images', 'Image pipelines'],
    ['pricing', 'Pricing pipelines'],
    ['homepage', 'Homepage feed'],
    ['readiness', 'Game readiness']
  ];

  orderedSections.forEach(([sectionKey, label]) => {
    const section = sections?.[sectionKey];
    if (!section) return;
    const status = String(section?.status || section?.overallStatus || 'missing').toLowerCase();
    if (status === 'ok') return;

    const entries = Array.isArray(section.entries) ? section.entries : [];
    const affected = entries.filter((entry) => String(entry?.status || 'missing').toLowerCase() !== 'ok');
    const owningJobs = (sectionJobMap[sectionKey] || []).map((jobId) => getJobDetails(jobId)).filter(Boolean);
    const owners = [...new Set(owningJobs.map((job) => job.owner))].join(', ') || 'operations';
    const evidence = affected.length > 0
      ? `${affected.length} affected target${affected.length === 1 ? '' : 's'}: ${summarizeTargets(affected)}`
      : `Section status is ${status}.`;

    addIncident({
      id: `section-${sectionKey}-${status}`,
      severity: status === 'missing' ? 'critical' : status === 'degraded' ? 'warning' : 'watch',
      status,
      title: `${label} needs attention`,
      owner: owners,
      evidence,
      fix: owningJobs.length > 0
        ? `Use ${owningJobs.map((job) => job.label).join(' -> ')} after preflight is clear.`
        : 'Review this section diagnostics and repair the source data.'
    });
  });

  if (systemHealth?.overallStatus && String(systemHealth.overallStatus).toLowerCase() !== 'ok') {
    addIncident({
      id: 'system-overall-status',
      severity: String(systemHealth.overallStatus).toLowerCase() === 'missing' ? 'critical' : 'warning',
      status: systemHealth.overallStatus,
      title: 'Overall system health is not green',
      owner: 'operations',
      evidence: `System health reports ${systemHealth.overallStatus}.`,
      fix: 'Start with the highest severity incident in this queue, then rerun System health report.'
    });
  }

  const unique = new Map();
  incidents.forEach((incident) => {
    if (!unique.has(incident.id)) unique.set(incident.id, incident);
  });

  return [...unique.values()].sort((a, b) => {
    const severityDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (severityDiff !== 0) return severityDiff;
    return String(a.title).localeCompare(String(b.title));
  });
}

export function buildServiceLevelRows(automationRuns, controlStatus) {
  const dueJobIds = new Set(controlStatus?.scheduler?.dueJobs || []);

  return siteAutomationRegistry.map((job) => {
    const run = getRunRecord(automationRuns, job.id);
    const freshnessHours = getRunFreshnessHours(run);
    const targetHours = getCadenceTargetHours(job.cadence);
    const lock = getControlEntry(controlStatus, job.id)?.lock || null;
    const runStatus = String(run?.lastStatus || 'missing').toLowerCase();
    const isDue = dueJobIds.has(job.id);
    const isOverdue = freshnessHours == null || freshnessHours > targetHours || isDue;
    const status = lock
      ? 'running'
      : runStatus === 'failed'
        ? 'failed'
        : runStatus === 'missing'
          ? 'missing'
          : isOverdue
            ? 'stale'
            : 'ok';

    return {
      ...job,
      run,
      status,
      freshnessHours,
      targetHours,
      overdueHours: freshnessHours == null ? null : Math.max(0, freshnessHours - targetHours),
      nextDueAt: run?.lastSucceededAt
        ? new Date(new Date(run.lastSucceededAt).getTime() + targetHours * 36e5).toISOString()
        : null,
      isDue,
      lock,
      impact: getBusinessImpact(job.id)
    };
  });
}

export function buildLaunchReadinessRows(sections, automationRuns, controlStatus) {
  const controlsConnected = Boolean(controlStatus?.available);
  const schedulerEnabled = Boolean(controlStatus?.scheduler?.enabled);
  const jobOk = (jobId) => String(getRunRecord(automationRuns, jobId)?.lastStatus || 'missing').toLowerCase() === 'ok';
  const sectionOk = (sectionKey) => {
    const section = sections?.[sectionKey];
    return String(section?.status || section?.overallStatus || 'missing').toLowerCase() === 'ok';
  };
  const capabilityOrder = ['Catalog', 'Images', 'Pricing', 'Homepage', 'Readiness'];
  const capabilityRiskCounts = buildOperationIncidents(null, sections, automationRuns, controlStatus)
    .reduce((acc, incident) => {
      (incident.impactedCapabilities || []).forEach((capability) => {
        acc[capability] = (acc[capability] || 0) + 1;
      });
      return acc;
    }, {});
  const atRiskCapabilities = capabilityOrder.filter((capability) => capabilityRiskCounts[capability] > 0);

  return {
    atRiskCapabilities,
    topRisk: atRiskCapabilities[0] || 'None',
    rows: [
      {
        id: 'public-storefront',
        label: 'Public storefront',
        owner: 'storefront',
        status: sectionOk('catalogs') && sectionOk('images') && sectionOk('pricing') ? 'ok' : 'degraded',
        evidence: 'Catalogs, images, and pricing all need to stay green for buyers to trust product pages.',
        nextStep: 'Repair whichever pipeline is not green, then rerun System health report.'
      },
      {
        id: 'search-and-discovery',
        label: 'Search and discovery',
        owner: 'catalog',
        status: sectionOk('catalogs') && jobOk('catalog-refresh') ? 'ok' : 'degraded',
        evidence: 'Search depends on normalized catalog outputs and successful catalog refresh history.',
        nextStep: 'Run Card backfill refresh, then Catalog refresh.'
      },
      {
        id: 'card-images',
        label: 'Card image coverage',
        owner: 'images',
        status: sectionOk('images') && jobOk('image-repair-sync') ? 'ok' : 'degraded',
        evidence: 'Shop, deck builder, commander hub, and inventory intake share the image pipeline.',
        nextStep: 'Run Image repair and sync after Catalog refresh is healthy.'
      },
      {
        id: 'market-pricing',
        label: 'Market pricing',
        owner: 'pricing',
        status: sectionOk('pricing') && jobOk('pricing-refresh') ? 'ok' : 'degraded',
        evidence: 'Deck values and storefront values need a fresh merged pricing snapshot.',
        nextStep: 'Run Pricing refresh after Catalog refresh is healthy.'
      },
      {
        id: 'homepage-merchandising',
        label: 'Homepage merchandising',
        owner: 'homepage',
        status: sectionOk('homepage') && jobOk('homepage-upcoming-releases') ? 'ok' : 'degraded',
        evidence: 'The hero/release banner should automatically reflect upcoming sets.',
        nextStep: 'Run Homepage upcoming releases refresh.'
      },
      {
        id: 'operations-control',
        label: 'Operations control',
        owner: 'operations',
        status: controlsConnected ? 'ok' : 'degraded',
        evidence: controlsConnected
          ? 'Manual pipeline controls can reach the backend runner.'
          : 'Hosted admin can read reports, but cannot manually run automations until the bridge is connected.',
        nextStep: 'Host/connect the operations backend and set VITE_API_ORIGIN.'
      },
      {
        id: 'autopilot',
        label: 'Autopilot scheduler',
        owner: 'operations',
        status: schedulerEnabled ? 'ok' : 'degraded',
        evidence: schedulerEnabled
          ? 'Scheduler is enabled and can keep routine jobs moving.'
          : 'Scheduler is intentionally disabled until the runner is fully verified.',
        nextStep: 'Enable MPM_AUTOMATION_SCHEDULER_ENABLED=true after bridge verification.'
      }
    ]
  };
}

export function buildDataContractRows(automationRuns) {
  return siteAutomationRegistry.map((job) => {
    const run = getRunRecord(automationRuns, job.id);
    const consumers = [
      ...(job.blocks || []).map((blockedId) => getJobDetails(blockedId)?.label || blockedId),
      ...Object.entries(sectionJobMap)
        .filter(([, jobIds]) => jobIds.includes(job.id))
        .map(([sectionKey]) => `${sectionKey.charAt(0).toUpperCase()}${sectionKey.slice(1)} dashboard`)
    ];

    return {
      ...job,
      run,
      status: run?.lastStatus || 'missing',
      consumers: [...new Set(consumers)],
      contract: getBusinessImpact(job.id)
    };
  });
}

export function describeSourceType(source) {
  if (!source || source.configured === false || source.type === 'missing') return 'Missing source';
  if (source.type === 'file') return 'Local file';
  if (source.type === 'remote') return 'Remote feed';
  return 'Unknown source';
}

export function describeSourceControlModel(source) {
  if (!source || source.configured === false || source.type === 'missing') return 'Unconfigured';
  if (source.type === 'file') return 'Managed locally';
  if (source.type === 'remote') {
    const url = String(source.url || '').toLowerCase();
    if (url.includes('githubusercontent') || url.includes('github.com')) return 'External raw feed';
    if (url.includes('local-backfill')) return 'Local pipeline bridge';
    return 'External API';
  }
  return 'Unknown';
}

export function buildSourceGovernanceRows(sections) {
  const catalogEntries = Array.isArray(sections?.catalogs?.entries) ? sections.catalogs.entries : [];
  const imageEntries = Array.isArray(sections?.images?.entries) ? sections.images.entries : [];
  const readinessEntries = Array.isArray(sections?.readiness?.entries) ? sections.readiness.entries : [];
  const imageMap = new Map(imageEntries.map((entry) => [entry.game, entry]));
  const readinessMap = new Map(readinessEntries.map((entry) => [entry.game, entry]));

  return catalogEntries.map((entry) => {
    const source = entry?.source || { configured: false, type: 'missing' };
    const imageEntry = imageMap.get(entry.game) || null;
    const readinessEntry = readinessMap.get(entry.game) || null;
    const sourceReady = source.type === 'remote' || (source.type === 'file' && source.exists);
    const feeds = ['Catalog'];

    if (imageEntry) feeds.push('Images');
    if (readinessEntry) feeds.push('Readiness');

    return {
      game: entry.game,
      status: sourceReady ? 'ok' : 'missing',
      sourceType: describeSourceType(source),
      controlModel: describeSourceControlModel(source),
      upstream: source.path || source.url || source.envVar || 'Not configured',
      feeds,
      cards: Number(entry?.cards?.count || 0),
      sets: Number(entry?.sets?.count || 0),
      nextRisk: !sourceReady
        ? 'This game cannot refresh cleanly until its source is configured and reachable.'
        : source.type === 'file'
          ? 'Local source file must stay present before backfill/catalog/image jobs run.'
          : 'External provider drift, schema changes, or rate limits can disrupt refreshes.'
    };
  });
}

export function buildCapabilityConfidenceRows(sections, automationRuns, controlStatus) {
  const sourceRows = buildSourceGovernanceRows(sections);
  const serviceRows = buildServiceLevelRows(automationRuns, controlStatus);
  const serviceRowMap = new Map(serviceRows.map((row) => [row.id, row]));
  const sectionStatus = (sectionKey) => String(sections?.[sectionKey]?.status || sections?.[sectionKey]?.overallStatus || 'missing').toLowerCase();

  const capabilityConfig = [
    {
      id: 'catalog',
      label: 'Catalog',
      sectionKey: 'catalogs',
      sourceFeed: 'Catalog',
      jobs: ['card-backfill-refresh', 'catalog-refresh']
    },
    {
      id: 'images',
      label: 'Images',
      sectionKey: 'images',
      sourceFeed: 'Images',
      jobs: ['image-repair-sync']
    },
    {
      id: 'pricing',
      label: 'Pricing',
      sectionKey: 'pricing',
      sourceFeed: null,
      jobs: ['pricing-refresh']
    },
    {
      id: 'homepage',
      label: 'Homepage',
      sectionKey: 'homepage',
      sourceFeed: null,
      jobs: ['homepage-upcoming-releases']
    },
    {
      id: 'readiness',
      label: 'Readiness',
      sectionKey: 'readiness',
      sourceFeed: 'Readiness',
      jobs: ['system-health-report']
    }
  ];

  return capabilityConfig.map((capability) => {
    const relatedSources = capability.sourceFeed
      ? sourceRows.filter((row) => row.feeds.includes(capability.sourceFeed))
      : [];
    const relatedJobs = capability.jobs
      .map((jobId) => serviceRowMap.get(jobId))
      .filter(Boolean);
    const sourcesMissing = relatedSources.filter((row) => row.status !== 'ok');
    const section = sectionStatus(capability.sectionKey);
    const runStatuses = relatedJobs.map((row) => row.status);
    const hasMissing = section === 'missing' || sourcesMissing.length > 0 || runStatuses.some((status) => status === 'missing' || status === 'failed');
    const hasWatch = section === 'degraded' || runStatuses.some((status) => status === 'stale' || status === 'running');
    const status = hasMissing ? 'missing' : hasWatch ? 'stale' : 'ok';
    const proofLabel = status === 'ok' ? 'trusted' : status === 'stale' ? 'watching' : 'unproven';
    const freshestRun = relatedJobs
      .map((row) => row.run?.lastSucceededAt || null)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

    return {
      ...capability,
      status,
      proofLabel,
      section,
      sourceCoverage: relatedSources.length,
      missingSources: sourcesMissing.length,
      jobsHealthy: relatedJobs.filter((row) => row.status === 'ok').length,
      totalJobs: relatedJobs.length,
      freshestRun,
      evidence: status === 'ok'
        ? `Section is green, ${relatedJobs.length}/${Math.max(relatedJobs.length, 1)} linked jobs are within SLA, and the latest proof was ${formatDate(freshestRun)}.`
        : status === 'stale'
          ? 'Capability is alive but not yet fully trustworthy. At least one linked job is stale/running or the section is degraded.'
          : 'Capability is not yet trustworthy. A required source, section, or linked job is missing or failed.',
      nextStep: status === 'ok'
        ? 'No action needed beyond routine scheduled runs.'
        : status === 'stale'
          ? `Stabilize ${capability.label.toLowerCase()} by rerunning the linked pipeline chain and confirming the section returns to green.`
          : `Repair upstream dependencies for ${capability.label.toLowerCase()} before treating this capability as launch-ready.`
    };
  });
}

export function buildRunnerAuditSummary(controlStatus) {
  const entries = Array.isArray(controlStatus?.audit?.entries) ? controlStatus.audit.entries : [];
  const allowedJobs = Array.isArray(controlStatus?.allowedJobs) ? controlStatus.allowedJobs : [];
  const activeLocks = allowedJobs.filter((job) => job?.lock).length;
  const latestEntry = entries[0] || null;
  const latestStatus = String(latestEntry?.status || '').toLowerCase();
  const failureStatuses = new Set(['failed', 'failed-to-start', 'scheduler-error']);
  const blockedStatuses = new Set(['blocked']);
  const completedStatuses = new Set(['completed']);
  const startedStatuses = new Set(['started']);

  return {
    status: deriveRunnerAuditStatus(controlStatus),
    latestEntry,
    entries,
    activeLocks,
    generatedAt: controlStatus?.audit?.generatedAt || null,
    uniqueActors: [...new Set(entries.map((entry) => entry?.actor).filter(Boolean))],
    completedCount: entries.filter((entry) => completedStatuses.has(String(entry?.status || '').toLowerCase())).length,
    blockedCount: entries.filter((entry) => blockedStatuses.has(String(entry?.status || '').toLowerCase())).length,
    failureCount: entries.filter((entry) => failureStatuses.has(String(entry?.status || '').toLowerCase())).length,
    startedCount: entries.filter((entry) => startedStatuses.has(String(entry?.status || '').toLowerCase())).length,
    latestStatus
  };
}

export function buildRecoveryPlaybooks(systemHealth, sections, automationRuns, controlStatus) {
  const incidents = buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus);
  const recommendedOrder = buildRecommendedRunOrder(automationRuns, controlStatus);
  const brokenSections = Object.entries(sections || {})
    .filter(([, section]) => String(section?.status || section?.overallStatus || 'missing').toLowerCase() !== 'ok')
    .map(([sectionKey]) => sectionKey);

  const capabilityOrder = ['Catalog', 'Images', 'Pricing', 'Homepage', 'Readiness'];
  const capabilityCounts = incidents.reduce((acc, incident) => {
    (incident.impactedCapabilities || []).forEach((capability) => {
      acc[capability] = (acc[capability] || 0) + 1;
    });
    return acc;
  }, {});
  const capabilityPriorities = capabilityOrder
    .filter((capability) => capabilityCounts[capability] > 0)
    .map((capability) => ({
      label: capability,
      count: capabilityCounts[capability],
      reason: `${capabilityCounts[capability]} incident${capabilityCounts[capability] === 1 ? '' : 's'} currently affects ${capability.toLowerCase()}.`
    }));

  const baseSteps = [
    'Open the incident queue and handle critical failures first.',
    'Run dependency-safe jobs in the recommended order.',
    'Rerun System health report so the dashboard reflects the repair.',
    'Refresh Admin Operations and verify incidents cleared.'
  ];

  const targetedSteps = recommendedOrder
    .filter((job) => job.status !== 'ok' || !job.preflight.ready)
    .map((job) => {
      if (!job.preflight.ready) {
        return `${job.label}: blocked until ${job.preflight.blockers.map((blocker) => `${blocker.label} (${blocker.status})`).join(', ')} is healthy.`;
      }
      return `${job.label}: ${job.script}`;
    });

  return {
    status: incidents.length > 0 ? 'degraded' : 'ok',
    incidentCount: incidents.length,
    brokenSections,
    nextIncident: incidents[0] || null,
    restoreFirst: capabilityPriorities[0]?.label || 'Core pipeline health',
    capabilityPriorities,
    steps: targetedSteps.length > 0 ? targetedSteps : baseSteps,
    fallbackSteps: baseSteps
  };
}

export function deriveRecoveryPlaybookStatus(playbook) {
  return String(playbook?.status || 'missing').toLowerCase();
}

export function buildControlPlaneRows(controlStatus) {
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

  return [
    {
      id: 'reporting',
      label: 'Hosted reporting surface',
      owner: 'operations',
      status: 'ok',
      evidence: 'Admin Operations can render health snapshots and pipeline diagnostics on the hosted site.',
      nextStep: 'Keep the static health snapshot fresh so the reporting surface stays trustworthy.'
    },
    {
      id: 'manual-runner',
      label: 'Manual runner bridge',
      owner: 'operations',
      status: controlsAvailable && bridgeConnectionStatus === 'ok' ? 'ok' : 'degraded',
      evidence: controlsAvailable
        ? bridgeConnectionStatus === 'ok'
          ? 'Hosted admin can reach the backend runner for manual job execution.'
          : 'Runner is reachable, but one or more bridge prerequisites are still not green.'
        : controlStatus?.reason || 'Hosted admin cannot currently reach the backend runner.',
      nextStep: controlsAvailable
        ? bridgeConnectionStatus === 'ok'
          ? 'Keep the backend origin and auth bridge healthy.'
          : 'Clear the remaining bridge readiness checks before trusting manual execution.'
        : 'Host/connect the operations backend and wire VITE_API_ORIGIN.'
    },
    {
      id: 'scheduler',
      label: 'Autopilot scheduler',
      owner: 'operations',
      status: scheduler.enabled
        ? 'ok'
        : scheduler.configured
          ? schedulerMapStatus === 'ok'
            ? 'degraded'
            : 'missing'
          : 'missing',
      evidence: scheduler.enabled
        ? `Scheduler is enabled and checking due jobs. Last checked ${formatDate(scheduler.lastCheckedAt)}.`
        : scheduler.configured
          ? 'Scheduler exists but is not actively enabled.'
          : 'Scheduler is not configured on the current control plane.',
      nextStep: scheduler.enabled
        ? 'Watch due jobs and lock behavior during normal cadence.'
        : 'Enable MPM_AUTOMATION_SCHEDULER_ENABLED once runner verification is complete.'
    },
    {
      id: 'audit-trail',
      label: 'Run audit trail',
      owner: 'operations',
      status: controlsAvailable ? auditSurfaceStatus : 'degraded',
      evidence: controlsAvailable
        ? auditSurfaceStatus === 'ok'
          ? 'Backend readiness checks include audit coverage verification and writable run history.'
          : 'Runner is connected, but audit storage or run-history verification is not yet green.'
        : 'Audit records cannot be trusted from the hosted surface until the runner bridge is live.',
      nextStep: auditSurfaceStatus === 'ok'
        ? 'Keep audit output visible in the operations backend.'
        : 'Repair audit-log and run-history bridge checks so the execution trail is trustworthy.'
    },
    {
      id: 'single-run-locks',
      label: 'Single-run locks',
      owner: 'operations',
      status: controlsAvailable ? lockStatus : 'degraded',
      evidence: controlsAvailable
        ? lockStatus === 'ok'
          ? 'Runner checks explicitly verify single-run lock protection.'
          : 'Runner is connected, but lock verification is not yet green.'
        : 'Duplicate-run protection cannot be exercised from hosted admin until the runner bridge is live.',
      nextStep: lockStatus === 'ok'
        ? 'Continue monitoring lock collisions during manual and scheduled runs.'
        : 'Repair the single-run lock bridge check before trusting concurrent manual or scheduled runs.'
    },
    {
      id: 'dependency-preflight',
      label: 'Dependency preflight safety',
      owner: 'operations',
      status: controlsAvailable ? preflightStatus : 'degraded',
      evidence: controlsAvailable
        ? preflightStatus === 'ok'
          ? 'Runner checks explicitly verify dependency preflight readiness.'
          : 'Preflight is used by the UI, but backend verification is not yet green.'
        : 'Dependency-safe manual runs are blocked until the runner bridge is live.',
      nextStep: preflightStatus === 'ok'
        ? 'Keep dependency enforcement aligned with the recommended run order.'
        : 'Repair the dependency-preflight bridge check so the backend proves the same safety rules as the UI.'
    }
  ];
}
