import { siteAutomationRegistry } from '../automation/siteAutomationRegistry.js';
import {
  derivePipelineControlsStatus,
  getBridgeChecks,
  summarizeBridgeStatuses
} from './adminOperationsControlPlaneService.js';

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

export function deriveRecoveryPlaybookStatus(playbook) {
  return String(playbook?.status || 'missing').toLowerCase();
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
  const sectionStatuses = Object.values(sections || {}).map((section) => String(section?.status || section?.overallStatus || 'missing').toLowerCase());
  const incidentQueueStatus = deriveIncidentQueueStatus(operationIncidents);
  const serviceLevelStatus = deriveServiceLevelStatus(serviceLevelRows);
  const launchReadinessStatus = deriveLaunchReadinessStatus(launchReadiness);
  const sourceGovernanceStatus = deriveSourceGovernanceStatus(sourceGovernanceRows);
  const dataContractsStatus = deriveDataContractsStatus(dataContractRows);
  const bridgeChecks = getBridgeChecks(controlStatus);
  const bridgeReadinessStatus = summarizeBridgeStatuses(bridgeChecks.map((check) => check.status));
  const controlPlaneStatus = deriveControlPlaneStatus(controlPlaneRows);
  const capabilityConfidenceStatus = deriveCapabilityConfidenceStatus(capabilityConfidenceRows);
  const recoveryPlaybookStatus = deriveRecoveryPlaybookStatus(recoveryPlaybook);
  const pipelineControlsStatus = derivePipelineControlsStatus(controlStatus);

  return [
    {
      id: 'automation-registry',
      label: 'Automation registry',
      owner: 'operations',
      status: deriveAreaStatus(sectionStatuses, automationSummary),
      evidence: `${siteAutomationRegistry.length} declared automation jobs are registered in the system.`,
      nextStep: 'Keep registry ownership, cadence, and output contracts aligned with the real pipeline stack.'
    },
    {
      id: 'pipeline-run-history',
      label: 'Pipeline run history',
      owner: 'operations',
      status: deriveAutomationHistoryStatus(automationSummary),
      evidence: `${automationSummary.ok} healthy, ${automationSummary.failed} failed, ${automationSummary.running} running, ${automationSummary.missing} with no recorded run yet.`,
      nextStep: 'Use fresh run history as the source of truth before trusting manual reruns or scheduler decisions.'
    },
    {
      id: 'operations-incident-queue',
      label: 'Operations incident queue',
      owner: 'operations',
      status: incidentQueueStatus,
      evidence: operationIncidents.length > 0
        ? `${operationIncidents.length} incident${operationIncidents.length === 1 ? '' : 's'} are currently open.`
        : 'No active incidents are blocking the operations surface right now.',
      nextStep: operationIncidents[0]?.fix || 'Stay on normal watch and let routine cadence keep the system green.'
    },
    {
      id: 'automation-sla-board',
      label: 'Automation SLA board',
      owner: 'operations',
      status: serviceLevelStatus,
      evidence: `${serviceLevelRows.filter((row) => row.status === 'ok').length}/${serviceLevelRows.length} automation jobs are currently inside their freshness target.`,
      nextStep: 'Use cadence freshness and overdue evidence to decide what must run next.'
    },
    {
      id: 'launch-readiness-matrix',
      label: 'Launch readiness matrix',
      owner: 'operations',
      status: launchReadinessStatus,
      evidence: launchReadiness.atRiskCapabilities.length > 0
        ? `At-risk capabilities: ${launchReadiness.atRiskCapabilities.join(', ')}.`
        : 'All tracked launch capabilities are currently green.',
      nextStep: `Restore ${launchReadiness.topRisk || 'core pipeline health'} first when launch trust drops.`
    },
    {
      id: 'source-governance',
      label: 'Source governance',
      owner: 'catalog',
      status: sourceGovernanceStatus,
      evidence: `${sourceGovernanceRows.filter((row) => row.status === 'ok').length}/${sourceGovernanceRows.length} source feeds are operational.`,
      nextStep: 'Repair missing or drifting upstream feeds before rerunning dependent catalog/image/pricing jobs.'
    },
    {
      id: 'data-contracts-lineage',
      label: 'Data contracts and lineage',
      owner: 'operations',
      status: dataContractsStatus,
      evidence: `${dataContractRows.filter((row) => String(row.status || '').toLowerCase() === 'ok').length}/${dataContractRows.length} producer contracts are backed by a healthy latest run.`,
      nextStep: 'Keep ownership and downstream consumers honest so each output file has a clear producer.'
    },
    {
      id: 'operations-bridge-readiness',
      label: 'Operations bridge readiness',
      owner: 'operations',
      status: bridgeReadinessStatus,
      evidence: `${bridgeChecks.filter((check) => String(check.status || '').toLowerCase() === 'ok').length}/${bridgeChecks.length} backend bridge readiness checks are green.`,
      nextStep: controlStatus?.available
        ? 'Keep the hosted bridge reachable and its backend checks green.'
        : 'Host/connect the operations backend bridge and wire VITE_API_ORIGIN.'
    },
    {
      id: 'operations-control-plane',
      label: 'Operations control plane',
      owner: 'operations',
      status: controlPlaneStatus,
      evidence: `${controlPlaneRows.filter((row) => row.status === 'ok').length}/${controlPlaneRows.length} control-plane surfaces are currently green.`,
      nextStep: 'Clear any degraded control-plane surface before calling the dashboard truly command-ready.'
    },
    {
      id: 'runner-audit-timeline',
      label: 'Runner audit timeline',
      owner: 'operations',
      status: runnerAuditSummary.status,
      evidence: runnerAuditSummary.entries.length > 0
        ? `${runnerAuditSummary.entries.length} audit entr${runnerAuditSummary.entries.length === 1 ? 'y' : 'ies'} captured; latest status is ${runnerAuditSummary.latestStatus || 'unknown'}.`
        : 'No visible runner audit trail has been captured yet.',
      nextStep: 'Keep audit history visible enough that manual and scheduled execution can be trusted after the fact.'
    },
    {
      id: 'business-capability-confidence',
      label: 'Business capability confidence',
      owner: 'operations',
      status: capabilityConfidenceStatus,
      evidence: `${capabilityConfidenceRows.filter((row) => row.status === 'ok').length}/${capabilityConfidenceRows.length} business capabilities are currently trusted.`,
      nextStep: 'Treat any unproven capability as a launch risk until its sources, jobs, and proof lines are green.'
    },
    {
      id: 'recovery-playbook',
      label: 'Recovery playbook',
      owner: 'operations',
      status: recoveryPlaybookStatus,
      evidence: recoveryPlaybook.incidentCount > 0
        ? `${recoveryPlaybook.incidentCount} incident${recoveryPlaybook.incidentCount === 1 ? '' : 's'} currently shape the recovery order.`
        : 'No recovery sequence is actively needed right now.',
      nextStep: recoveryPlaybook.steps[0] || 'Keep the recovery order current as the control plane evolves.'
    },
    {
      id: 'pipeline-controls',
      label: 'Pipeline controls',
      owner: 'operations',
      status: pipelineControlsStatus,
      evidence: controlStatus?.available
        ? 'Hosted admin can reach the runner surface and evaluate dependency-safe manual runs.'
        : 'Hosted admin is still read-only until the backend bridge is connected.',
      nextStep: controlStatus?.available
        ? 'Use dependency preflight and locks to keep manual runs disciplined.'
        : 'Finish wiring the hosted runner bridge before expecting manual controls to work.'
    }
  ];
}

export function buildDashboardSummary(dashboardAreas) {
  const combinedStatuses = dashboardAreas.map((area) => String(area.status || 'missing').toLowerCase());
  return {
    ok: combinedStatuses.filter((status) => status === 'ok').length,
    degraded: combinedStatuses.filter((status) => ['degraded', 'failed', 'running', 'blocked'].includes(status)).length,
    stale: combinedStatuses.filter((status) => status === 'stale').length,
    missing: combinedStatuses.filter((status) => status === 'missing').length,
    topStatus: combinedStatuses.includes('missing')
      ? 'missing'
      : combinedStatuses.some((status) => ['degraded', 'failed', 'running', 'blocked'].includes(status))
        ? 'degraded'
        : combinedStatuses.includes('stale')
          ? 'stale'
          : 'ok',
    automationAreaStatus: dashboardAreas.find((area) => area.id === 'automation-registry')?.status || 'missing'
  };
}
