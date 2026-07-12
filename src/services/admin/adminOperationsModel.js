import {
  siteAutomationRegistry,
  siteAutomationSections
} from '../automation/siteAutomationRegistry.js';
import {
  buildControlPlaneSnapshot,
  buildRunnerAuditSnapshot,
  derivePipelineControlsStatus as derivePipelineControlsStatusFromService,
  deriveRunnerAuditStatus as deriveRunnerAuditStatusFromService,
  getBridgeCheckStatus as getBridgeCheckStatusFromService,
  getBridgeChecks as getBridgeChecksFromService,
  summarizeBridgeStatuses as summarizeBridgeStatusesFromService
} from './adminOperationsControlPlaneService.js';
import {
  buildDashboardAreas as buildDashboardAreasFromService,
  buildDashboardSummary as buildDashboardSummaryFromService,
  deriveAreaStatus as deriveAreaStatusFromService,
  deriveAutomationHistoryStatus as deriveAutomationHistoryStatusFromService,
  deriveCapabilityConfidenceStatus as deriveCapabilityConfidenceStatusFromService,
  deriveControlPlaneStatus as deriveControlPlaneStatusFromService,
  deriveDataContractsStatus as deriveDataContractsStatusFromService,
  deriveIncidentQueueStatus as deriveIncidentQueueStatusFromService,
  deriveLaunchReadinessStatus as deriveLaunchReadinessStatusFromService,
  deriveRecoveryPlaybookStatus as deriveRecoveryPlaybookStatusFromService,
  deriveServiceLevelStatus as deriveServiceLevelStatusFromService,
  deriveSourceGovernanceStatus as deriveSourceGovernanceStatusFromService
} from './adminOperationsAreaService.js';
import {
  buildCapabilityConfidenceRows as buildCapabilityConfidenceRowsFromService,
  buildDataContractRows as buildDataContractRowsFromService,
  buildLaunchReadinessRows as buildLaunchReadinessRowsFromService,
  buildSourceGovernanceRows as buildSourceGovernanceRowsFromService,
  describeSourceControlModel as describeSourceControlModelFromService,
  describeSourceType as describeSourceTypeFromService
} from './adminOperationsCapabilityService.js';
import {
  buildActionItems as buildActionItemsFromService,
  buildOperationIncidents as buildOperationIncidentsFromService,
  buildRecommendedRunOrder as buildRecommendedRunOrderFromService,
  buildRecoveryPlaybooks as buildRecoveryPlaybooksFromService,
  getControlEntry as getControlEntryFromService,
  getEffectivePreflight as getEffectivePreflightFromService
} from './adminOperationsOrchestrationService.js';
import {
  dependencyRunStatus as dependencyRunStatusFromService,
  getBusinessImpact as getBusinessImpactFromService,
  getCadenceTargetHours as getCadenceTargetHoursFromService,
  getControlReadiness as getControlReadinessFromService,
  getDependencyDiagnostics as getDependencyDiagnosticsFromService,
  getJobDetails as getJobDetailsFromService,
  getRunFreshnessHours as getRunFreshnessHoursFromService,
  getRunRecord as getRunRecordFromService,
  summarizeAutomationRuns as summarizeAutomationRunsFromService,
  summarizeTargets as summarizeTargetsFromService
} from './adminOperationsPipelineService.js';

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
  return getCadenceTargetHoursFromService(cadence);
}

export function getRunFreshnessHours(run) {
  return getRunFreshnessHoursFromService(run);
}

export function getBusinessImpact(jobId) {
  return getBusinessImpactFromService(jobId);
}

export function getJobDetails(jobId) {
  return getJobDetailsFromService(jobId);
}

export function getRunRecord(automationRuns, jobId) {
  return getRunRecordFromService(automationRuns, jobId);
}

export function summarizeTargets(entries) {
  return summarizeTargetsFromService(entries);
}

export function summarizeAutomationRuns(automationRuns) {
  return summarizeAutomationRunsFromService(automationRuns);
}

export function getControlReadiness(run) {
  return getControlReadinessFromService(run);
}

export function dependencyRunStatus(automationRuns, jobId) {
  return dependencyRunStatusFromService(automationRuns, jobId);
}

export function getDependencyDiagnostics(job, automationRuns) {
  return getDependencyDiagnosticsFromService(job, automationRuns);
}

export function getControlEntry(controlStatus, jobId) {
  return getControlEntryFromService(controlStatus, jobId);
}

export function getEffectivePreflight(job, automationRuns, controlStatus) {
  return getEffectivePreflightFromService({
    job,
    automationRuns,
    controlStatus,
    getDependencyDiagnostics
  });
}

export function buildRecommendedRunOrder(automationRuns, controlStatus) {
  return buildRecommendedRunOrderFromService({
    automationRuns,
    controlStatus,
    getJobDetails,
    getRunRecord,
    getEffectivePreflightImpl: (job, runs, status) => getEffectivePreflight(job, runs, status)
  });
}

export function deriveAreaStatus(sectionStatuses, automationSummary) {
  return deriveAreaStatusFromService(sectionStatuses, automationSummary);
}

export function deriveAutomationHistoryStatus(automationSummary) {
  return deriveAutomationHistoryStatusFromService(automationSummary);
}

export function deriveServiceLevelStatus(rows) {
  return deriveServiceLevelStatusFromService(rows);
}

export function deriveLaunchReadinessStatus(readiness) {
  return deriveLaunchReadinessStatusFromService(readiness);
}

export function deriveSourceGovernanceStatus(rows) {
  return deriveSourceGovernanceStatusFromService(rows);
}

export function deriveDataContractsStatus(rows) {
  return deriveDataContractsStatusFromService(rows);
}

export function getBridgeChecks(controlStatus) {
  return getBridgeChecksFromService(controlStatus);
}

export function getBridgeCheck(controlStatus, checkId) {
  return getBridgeChecks(controlStatus).find((check) => String(check?.id || '').toLowerCase() === String(checkId || '').toLowerCase()) || null;
}

export function getBridgeCheckStatus(controlStatus, checkId, fallback = 'missing') {
  return getBridgeCheckStatusFromService(controlStatus, checkId, fallback);
}

export function summarizeBridgeStatuses(statuses = []) {
  return summarizeBridgeStatusesFromService(statuses);
}

export function derivePipelineControlsStatus(controlStatus) {
  return derivePipelineControlsStatusFromService(controlStatus);
}

export function deriveRunnerAuditStatus(controlStatus) {
  return deriveRunnerAuditStatusFromService(controlStatus);
}

export function deriveIncidentQueueStatus(incidents) {
  return deriveIncidentQueueStatusFromService(incidents);
}

export function deriveCapabilityConfidenceStatus(rows) {
  return deriveCapabilityConfidenceStatusFromService(rows);
}

export function deriveControlPlaneStatus(rows) {
  return deriveControlPlaneStatusFromService(rows);
}

export function buildActionItems(systemHealth, sections, automationRuns, controlStatus) {
  return buildActionItemsFromService({
    systemHealth,
    sections,
    automationRuns,
    controlStatus,
    summarizeTargets,
    getJobDetails,
    getRunRecord
  });
}

export function buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus) {
  return buildOperationIncidentsFromService({
    systemHealth,
    sections,
    automationRuns,
    controlStatus,
    formatDate,
    summarizeTargets,
    getJobDetails,
    buildSourceGovernanceRows
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
  return buildLaunchReadinessRowsFromService({
    sections,
    automationRuns,
    controlStatus,
    getRunRecord,
    buildOperationIncidents
  });
}

export function buildDataContractRows(automationRuns) {
  return buildDataContractRowsFromService({
    automationRuns,
    getRunRecord,
    getJobDetails,
    getBusinessImpact
  });
}

export function describeSourceType(source) {
  return describeSourceTypeFromService(source);
}

export function describeSourceControlModel(source) {
  return describeSourceControlModelFromService(source);
}

export function buildSourceGovernanceRows(sections) {
  return buildSourceGovernanceRowsFromService(sections);
}

export function buildCapabilityConfidenceRows(sections, automationRuns, controlStatus) {
  return buildCapabilityConfidenceRowsFromService({
    sections,
    automationRuns,
    controlStatus,
    buildSourceGovernanceRowsImpl: buildSourceGovernanceRows,
    buildServiceLevelRows,
    formatDate
  });
}

export function buildRunnerAuditSummary(controlStatus) {
  return buildRunnerAuditSnapshot(controlStatus);
}

export function buildRecoveryPlaybooks(systemHealth, sections, automationRuns, controlStatus) {
  return buildRecoveryPlaybooksFromService({
    systemHealth,
    sections,
    automationRuns,
    controlStatus,
    buildOperationIncidentsImpl: (health, nextSections, runs, status) =>
      buildOperationIncidents(health, nextSections, runs, status),
    buildRecommendedRunOrderImpl: (runs, status) => buildRecommendedRunOrder(runs, status)
  });
}

export function deriveRecoveryPlaybookStatus(playbook) {
  return deriveRecoveryPlaybookStatusFromService(playbook);
}

export function buildControlPlaneRows(controlStatus) {
  const {
    controlsAvailable,
    scheduler,
    lockStatus,
    preflightStatus,
    schedulerMapStatus,
    bridgeConnectionStatus,
    auditSurfaceStatus
  } = buildControlPlaneSnapshot(controlStatus);

  return [
    {
      id: 'reporting',
      label: 'Hosted reporting surface',
      layer: 'Hosted surface',
      owner: 'operations',
      status: 'ok',
      evidence: 'Admin Operations can render health snapshots and pipeline diagnostics on the hosted site.',
      nextStep: 'Keep the static health snapshot fresh so the reporting surface stays trustworthy.'
    },
    {
      id: 'manual-runner',
      label: 'Manual runner bridge',
      layer: 'Bridge',
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
      layer: 'Autopilot',
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
      layer: 'Observability',
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
      layer: 'Concurrency safety',
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
      layer: 'Execution safety',
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

export function buildDashboardAreas({
  sections,
  automationSummary,
  operationIncidents,
  serviceLevelRows,
  launchReadiness,
  sourceGovernanceRows,
  dataContractRows,
  controlStatus,
  controlPlaneRows,
  runnerAuditSummary,
  capabilityConfidenceRows,
  recoveryPlaybook
}) {
  return buildDashboardAreasFromService({
    sections,
    automationSummary,
    operationIncidents,
    serviceLevelRows,
    launchReadiness,
    sourceGovernanceRows,
    dataContractRows,
    controlStatus,
    controlPlaneRows,
    runnerAuditSummary,
    capabilityConfidenceRows,
    recoveryPlaybook
  });
}

export function buildDashboardSummary(dashboardAreas) {
  return buildDashboardSummaryFromService(dashboardAreas);
}
