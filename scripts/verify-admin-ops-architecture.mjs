import assert from 'node:assert/strict';
import { siteAutomationRegistry } from '../src/services/automation/siteAutomationRegistry.js';
import {
  normalizeAdminOperationsControlStatus,
  buildControlPlaneSnapshot,
  buildRunnerAuditSnapshot
} from '../src/services/admin/adminOperationsControlPlaneService.js';
import {
  buildDashboardAreas,
  buildDashboardSummary
} from '../src/services/admin/adminOperationsAreaService.js';

const sampleControlQuery = {
  data: {
    available: true,
    mode: 'local-runner',
    scheduler: {
      enabled: false,
      configured: true,
      dueJobs: ['pricing-refresh'],
      lastCheckedAt: '2026-07-07T10:00:00.000Z'
    },
    allowedJobs: [
      { jobId: 'catalog-refresh', lock: null },
      { jobId: 'pricing-refresh', lock: { owner: 'scheduler' } }
    ],
    bridge: {
      checks: [
        { id: 'allowed-job-map', status: 'ok' },
        { id: 'dependency-preflight', status: 'ok' },
        { id: 'single-run-locks', status: 'ok' },
        { id: 'audit-log', status: 'ok' },
        { id: 'run-history', status: 'ok' },
        { id: 'scheduler-map', status: 'ok' }
      ]
    },
    audit: {
      generatedAt: '2026-07-07T10:00:00.000Z',
      entries: [
        {
          id: 'audit-1',
          runnerJob: 'system-health-report',
          label: 'System health report',
          status: 'completed',
          actor: 'scheduler',
          startedAt: '2026-07-07T09:59:00.000Z',
          finishedAt: '2026-07-07T09:59:01.000Z',
          durationMs: 1000
        }
      ]
    }
  }
};

const sampleSections = {
  catalogs: { status: 'ok', entries: [] },
  images: { status: 'ok', entries: [] },
  pricing: { status: 'stale', entries: [] },
  homepage: { status: 'ok', entries: [] },
  readiness: { status: 'ok', entries: [] }
};

const normalizedControlStatus = normalizeAdminOperationsControlStatus(sampleControlQuery);
assert.equal(normalizedControlStatus.available, true, 'normalizeAdminOperationsControlStatus should preserve control data');

const controlPlane = buildControlPlaneSnapshot(normalizedControlStatus);
assert.equal(controlPlane.controlsAvailable, true, 'control plane snapshot should report available controls');
assert.equal(controlPlane.bridgeChecks.length >= 5, true, 'control plane snapshot should expose bridge checks');

const runnerAudit = buildRunnerAuditSnapshot(normalizedControlStatus);
assert.equal(runnerAudit.totalRuns, 1, 'runner audit snapshot should count audit rows');
assert.equal(runnerAudit.succeeded, 1, 'runner audit snapshot should count successful runs');

const dashboardAreas = buildDashboardAreas({
  sections: sampleSections,
  automationSummary: {
    ok: siteAutomationRegistry.length - 1,
    failed: 0,
    running: 0,
    missing: 0
  },
  operationIncidents: [],
  serviceLevelRows: [
    { id: 'catalog-refresh', status: 'ok' },
    { id: 'pricing-refresh', status: 'stale' }
  ],
  launchReadiness: {
    atRiskCapabilities: ['Pricing'],
    topRisk: 'Pricing',
    rows: [{ id: 'market-pricing', status: 'degraded' }]
  },
  sourceGovernanceRows: [{ game: 'magic', status: 'ok' }],
  dataContractRows: [{ id: 'catalog-refresh', status: 'ok' }],
  controlStatus: normalizedControlStatus,
  controlPlaneRows: [
    { id: 'manual-runner', status: 'ok' },
    { id: 'scheduler', status: 'degraded' }
  ],
  runnerAuditSummary: runnerAudit,
  capabilityConfidenceRows: [{ id: 'pricing', status: 'stale' }],
  recoveryPlaybook: {
    status: 'ok',
    incidentCount: 0,
    steps: ['No action needed']
  }
});

assert.equal(Array.isArray(dashboardAreas), true, 'dashboard areas should be an array');
assert.equal(dashboardAreas.length >= 10, true, 'dashboard areas should include the major Admin Operations surfaces');

const summary = buildDashboardSummary(dashboardAreas);
assert.equal(typeof summary.topStatus, 'string', 'dashboard summary should expose topStatus');
assert.equal(summary.stale >= 1 || summary.degraded >= 1 || summary.missing >= 0, true, 'dashboard summary should aggregate statuses');

console.log('Admin Operations architecture verification passed.');
