import * as adminOperationsModel from './adminOperationsModel.js';
import {
  buildDashboardAreas,
  buildDashboardSummary
} from './adminOperationsAreaService.js';
import { normalizeAdminOperationsControlStatus } from './adminOperationsControlPlaneService.js';

export function buildAdminOperationsDashboardState({
  systemHealth,
  controlQuery,
  lastManualRefreshAt
}) {
  const sections = systemHealth?.sections || {};
  const generatedAt = systemHealth?.generatedAt || null;
  // The hosted health snapshot explains catalog/image/pricing coverage. The
  // durable Supabase control plane is the source of truth for actual job runs.
  const automationRuns = controlQuery?.data?.automationRuns
    || systemHealth?.automationRuns
    || { generatedAt: null, jobs: {} };
  const automationSummary = adminOperationsModel.summarizeAutomationRuns(automationRuns);

  const controlStatus = normalizeAdminOperationsControlStatus(controlQuery);

  const serviceLevelRows = adminOperationsModel.buildServiceLevelRows(automationRuns, controlStatus);
  const launchReadiness = adminOperationsModel.buildLaunchReadinessRows(sections, automationRuns, controlStatus);
  const sourceGovernanceRows = adminOperationsModel.buildSourceGovernanceRows(sections);
  const dataContractRows = adminOperationsModel.buildDataContractRows(automationRuns);
  const capabilityConfidenceRows = adminOperationsModel.buildCapabilityConfidenceRows(sections, automationRuns, controlStatus);
  const operationIncidents = adminOperationsModel.buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus);
  const controlPlaneRows = adminOperationsModel.buildControlPlaneRows(controlStatus);
  const runnerAuditSummary = adminOperationsModel.buildRunnerAuditSummary(controlStatus);
  const recoveryPlaybook = adminOperationsModel.buildRecoveryPlaybooks(systemHealth, sections, automationRuns, controlStatus);

  const dashboardAreas = buildDashboardAreas({
    generatedAt,
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

  const summary = buildDashboardSummary(dashboardAreas);
  const targetSummary = buildAdminOperationsTargetSummary(sections);

  const displayLastCheckedAt = buildAdminOperationsLastCheckedAt({
    healthUpdatedAt: controlQuery.healthDataUpdatedAt,
    controlUpdatedAt: controlQuery.dataUpdatedAt,
    lastManualRefreshAt
  });

  return {
    sections,
    generatedAt,
    automationRuns,
    automationSummary,
    controlStatus,
    serviceLevelRows,
    launchReadiness,
    sourceGovernanceRows,
    dataContractRows,
    capabilityConfidenceRows,
    operationIncidents,
    controlPlaneRows,
    runnerAuditSummary,
    recoveryPlaybook,
    dashboardAreas,
    summary,
    targetSummary,
    displayLastCheckedAt
  };
}

export function buildAdminOperationsTargetSummary(sections = {}) {
  const entries = Object.values(sections)
    .flatMap((section) => Array.isArray(section?.entries) ? section.entries : []);

  const normalizedStatuses = entries.map((entry) => String(entry?.status || 'missing').toLowerCase());

  return {
    total: normalizedStatuses.length,
    ok: normalizedStatuses.filter((status) => status === 'ok').length,
    degraded: normalizedStatuses.filter((status) => ['degraded', 'failed', 'running', 'blocked'].includes(status)).length,
    stale: normalizedStatuses.filter((status) => status === 'stale').length,
    missing: normalizedStatuses.filter((status) => status === 'missing').length
  };
}

export function buildAdminOperationsLastCheckedAt({
  healthUpdatedAt,
  controlUpdatedAt,
  lastManualRefreshAt
}) {
  const timestamps = [healthUpdatedAt, controlUpdatedAt, lastManualRefreshAt]
    .filter((value) => typeof value === 'number' && Number.isFinite(value));

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}
