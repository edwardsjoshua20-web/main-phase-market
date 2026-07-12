import { siteAutomationSections } from '../automation/siteAutomationRegistry.js';

export function getControlEntry(controlStatus, jobId) {
  return (controlStatus?.allowedJobs || []).find((entry) => entry.jobId === jobId) || null;
}

export function getEffectivePreflight({
  job,
  automationRuns,
  controlStatus,
  getDependencyDiagnostics
}) {
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

export function buildRecommendedRunOrder({
  automationRuns,
  controlStatus,
  getJobDetails,
  getRunRecord,
  getEffectivePreflightImpl
}) {
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
      const preflight = getEffectivePreflightImpl(job, automationRuns, controlStatus);
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

export function buildActionItems({
  systemHealth,
  sections,
  automationRuns,
  controlStatus,
  summarizeTargets,
  getJobDetails,
  getRunRecord
}) {
  const items = [];
  const orderedKeys = ['catalogs', 'images', 'pricing', 'homepage', 'readiness'];

  orderedKeys.forEach((sectionKey) => {
    const section = sections?.[sectionKey];
    if (!section) return;

    const topStatus = String(section?.status || section?.overallStatus || 'missing').toLowerCase();
    if (topStatus === 'ok') return;

    const entries = Array.isArray(section?.entries) ? section.entries : [];
    const affected = entries.filter((entry) => String(entry?.status || 'missing').toLowerCase() !== 'ok');
    const jobs = (siteAutomationSections[sectionKey] || [])
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

  const automationJobs = Object.entries(automationRuns?.jobs || {});
  const missingHistoryJobs = automationJobs.filter(([, run]) => String(run?.lastStatus || 'missing').toLowerCase() === 'missing');
  const failedHistoryJobs = automationJobs.filter(([, run]) => String(run?.lastStatus || '').toLowerCase() === 'failed');

  if (failedHistoryJobs.length > 0 || missingHistoryJobs.length > 0) {
    const affectedJobs = [...failedHistoryJobs, ...missingHistoryJobs]
      .map(([jobId]) => getJobDetails(jobId)?.label || jobId);

    items.push({
      sectionKey: 'pipeline-run-history',
      label: 'Pipeline run history',
      status: failedHistoryJobs.length > 0 ? 'degraded' : 'missing',
      severity: failedHistoryJobs.length > 0 ? 3 : 2,
      affectedCount: affectedJobs.length,
      affectedSummary: affectedJobs.join(', '),
      jobs: [],
      note: failedHistoryJobs.length > 0
        ? `Failed automation jobs need attention: ${affectedJobs.join(', ')}`
        : `No recorded run history yet for: ${affectedJobs.join(', ')}`
    });
  }

  const bridgeChecks = Array.isArray(controlStatus?.bridge?.checks) ? controlStatus.bridge.checks : [];
  const failingBridgeChecks = bridgeChecks.filter((check) => String(check?.status || 'missing').toLowerCase() !== 'ok');
  const schedulerEnabled = Boolean(controlStatus?.scheduler?.enabled);
  const schedulerConfigured = Boolean(controlStatus?.scheduler?.configured);

  if (!controlStatus?.available || failingBridgeChecks.length > 0 || (schedulerConfigured && !schedulerEnabled)) {
    const bridgeLabels = failingBridgeChecks.map((check) => check.label || check.id || 'bridge check');
    const schedulerNote = schedulerConfigured && !schedulerEnabled
      ? ' Scheduler is configured but not enabled.'
      : '';

    items.push({
      sectionKey: 'operations-control',
      label: 'Operations control plane',
      status: !controlStatus?.available ? 'degraded' : failingBridgeChecks.length > 0 ? 'degraded' : 'stale',
      severity: !controlStatus?.available ? 3 : 2,
      affectedCount: bridgeLabels.length + (schedulerConfigured && !schedulerEnabled ? 1 : 0),
      affectedSummary: bridgeLabels.length > 0 ? bridgeLabels.join(', ') : 'scheduler',
      jobs: [],
      note: !controlStatus?.available
        ? `${controlStatus?.reason || 'Hosted admin cannot reach the runner bridge.'}${schedulerNote}`
        : `${bridgeLabels.length > 0 ? `Bridge checks still need work: ${bridgeLabels.join(', ')}.` : 'Runner bridge is up, but scheduler/autopilot still needs attention.'}${schedulerNote}`
    });
  }

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

export function buildOperationIncidents({
  systemHealth,
  sections,
  automationRuns,
  controlStatus,
  formatDate,
  summarizeTargets,
  getJobDetails,
  buildSourceGovernanceRows
}) {
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
    const owningJobs = (siteAutomationSections[sectionKey] || []).map((jobId) => getJobDetails(jobId)).filter(Boolean);
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

export function buildRecoveryPlaybooks({
  systemHealth,
  sections,
  automationRuns,
  controlStatus,
  buildOperationIncidentsImpl,
  buildRecommendedRunOrderImpl
}) {
  const incidents = buildOperationIncidentsImpl(systemHealth, sections, automationRuns, controlStatus);
  const recommendedOrder = buildRecommendedRunOrderImpl(automationRuns, controlStatus);
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
