import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { backend } from '@/services/backend';
import {
  getAutomationDependencySummary,
  siteAutomationRegistry,
  siteAutomationSections
} from '@/services/automation/siteAutomationRegistry';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatsCard from '@/components/admin/StatsCard';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  HardDriveDownload,
  Image as ImageIcon,
  ListChecks,
  Lock,
  Play,
  RefreshCw,
  ServerCrash,
  ShieldCheck,
  Terminal,
  Wrench
} from 'lucide-react';

const statusTone = {
  ok: 'bg-green-100 text-green-700 border-green-200',
  degraded: 'bg-amber-100 text-amber-700 border-amber-200',
  stale: 'bg-orange-100 text-orange-700 border-orange-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  running: 'bg-blue-100 text-blue-700 border-blue-200',
  blocked: 'bg-amber-100 text-amber-700 border-amber-200'
};

const sectionIcons = {
  homepage: Activity,
  catalogs: Database,
  images: ImageIcon,
  pricing: HardDriveDownload,
  readiness: CheckCircle2
};

const sectionJobMap = siteAutomationSections;

function formatSourceSummary(source) {
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

function classifyEntryIssue(entry) {
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

const ADMIN_TIMEZONE = 'America/New_York';

function formatDate(value) {
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

function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}h ago`;
}

function formatDuration(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const ms = Number(value);
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getCadenceTargetHours(cadence) {
  const normalized = String(cadence || '').toLowerCase();
  if (normalized.includes('hourly')) return 1.5;
  if (normalized.includes('every-2-days')) return 54;
  if (normalized.includes('daily')) return 30;
  return 30;
}

function getRunFreshnessHours(run) {
  const lastRunAt = run?.lastSucceededAt || run?.lastFinishedAt || run?.lastStartedAt || null;
  if (!lastRunAt) return null;
  const time = new Date(lastRunAt).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (Date.now() - time) / 36e5);
}

function getBusinessImpact(jobId) {
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

function getJobDetails(jobId) {
  return siteAutomationRegistry.find((job) => job.id === jobId) || null;
}

function getRunRecord(automationRuns, jobId) {
  return automationRuns?.jobs?.[jobId] || null;
}

function summarizeTargets(entries) {
  const names = entries
    .map((entry) => entry.game || entry.source || entry.id)
    .filter(Boolean);

  if (names.length === 0) return 'No affected targets listed';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

function summarizeAutomationRuns(automationRuns) {
  const runs = Object.values(automationRuns?.jobs || {});
  return {
    ok: runs.filter((run) => run?.lastStatus === 'ok').length,
    failed: runs.filter((run) => run?.lastStatus === 'failed').length,
    running: runs.filter((run) => run?.lastStatus === 'running').length,
    missing: siteAutomationRegistry.filter((job) => !automationRuns?.jobs?.[job.id]?.lastStatus).length
  };
}

function getControlReadiness(run) {
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

function dependencyRunStatus(automationRuns, jobId) {
  return String(getRunRecord(automationRuns, jobId)?.lastStatus || 'missing').toLowerCase();
}

function getDependencyDiagnostics(job, automationRuns) {
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

function getControlEntry(controlStatus, jobId) {
  return (controlStatus?.allowedJobs || []).find((entry) => entry.jobId === jobId) || null;
}

function getEffectivePreflight(job, automationRuns, controlStatus) {
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

function buildRecommendedRunOrder(automationRuns, controlStatus) {
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

function DependencySummary({ job, automationRuns, controlStatus }) {
  const diagnostics = getDependencyDiagnostics(job, automationRuns);
  const preflight = getEffectivePreflight(job, automationRuns, controlStatus);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Run logic</p>
      <p className="mt-2 text-sm text-slate-700">{job.readiness || 'No readiness note registered.'}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Depends on</p>
          {diagnostics.dependencies.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {diagnostics.dependencies.map((dependency) => (
                <Badge
                  key={dependency.id}
                  variant="outline"
                  className={dependency.runStatus === 'ok' ? statusTone.ok : statusTone.missing}
                >
                  {dependency.label}: {dependency.runStatus}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No upstream dependency.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Feeds</p>
          {diagnostics.blocks.length > 0 ? (
            <p className="mt-2 text-sm text-slate-600">{diagnostics.blocks.map((blocked) => blocked.label).join(', ')}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-600">End-of-chain or reporting job.</p>
          )}
        </div>
      </div>
      {!preflight.ready ? (
        <p className="mt-3 text-sm font-medium text-amber-700">
          {preflight.message}
        </p>
      ) : null}
    </div>
  );
}

function deriveAreaStatus(sectionStatuses, automationSummary) {
  if (sectionStatuses.includes('missing') || automationSummary.missing > 0) return 'missing';
  if (sectionStatuses.includes('degraded') || automationSummary.failed > 0 || automationSummary.running > 0) return 'degraded';
  if (sectionStatuses.includes('stale')) return 'stale';
  return 'ok';
}

function deriveAutomationHistoryStatus(automationSummary) {
  if (automationSummary.failed > 0) return 'failed';
  if (automationSummary.running > 0) return 'running';
  if (automationSummary.missing > 0) return 'missing';
  return 'ok';
}

function deriveServiceLevelStatus(rows) {
  if (rows.some((row) => row.status === 'failed')) return 'failed';
  if (rows.some((row) => row.status === 'missing')) return 'missing';
  if (rows.some((row) => row.status === 'running')) return 'running';
  if (rows.some((row) => row.status === 'stale')) return 'stale';
  return 'ok';
}

function deriveLaunchReadinessStatus(readiness) {
  return readiness.rows.some((row) => row.status !== 'ok') ? 'degraded' : 'ok';
}

function deriveSourceGovernanceStatus(rows) {
  if (rows.some((row) => row.status === 'missing')) return 'missing';
  if (rows.some((row) => row.status !== 'ok')) return 'degraded';
  return 'ok';
}

function deriveDataContractsStatus(rows) {
  if (rows.some((row) => String(row.status).toLowerCase() === 'missing')) return 'missing';
  if (rows.some((row) => String(row.status).toLowerCase() !== 'ok')) return 'degraded';
  return 'ok';
}

function derivePipelineControlsStatus(controlStatus) {
  return controlStatus?.available ? 'ok' : 'degraded';
}

function deriveRunnerAuditStatus(controlStatus) {
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

function buildActionItems(systemHealth, sections, automationRuns) {
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

function buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus) {
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

function buildServiceLevelRows(automationRuns, controlStatus) {
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

function buildLaunchReadinessRows(sections, automationRuns, controlStatus) {
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

function buildDataContractRows(automationRuns) {
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

function describeSourceType(source) {
  if (!source || source.configured === false || source.type === 'missing') return 'Missing source';
  if (source.type === 'file') return 'Local file';
  if (source.type === 'remote') return 'Remote feed';
  return 'Unknown source';
}

function describeSourceControlModel(source) {
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

function buildSourceGovernanceRows(sections) {
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

function buildCapabilityConfidenceRows(sections, automationRuns, controlStatus) {
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

function buildRunnerAuditSummary(controlStatus) {
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

function buildRecoveryPlaybooks(systemHealth, sections, automationRuns, controlStatus) {
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

function buildControlPlaneRows(controlStatus) {
  const controlsAvailable = Boolean(controlStatus?.available);
  const scheduler = controlStatus?.scheduler || {};
  const bridge = controlStatus?.bridge || {};
  const checks = Array.isArray(bridge.checks) ? bridge.checks : [];
  const hasAuditCheck = checks.some((check) => String(check.label || '').toLowerCase().includes('audit'));
  const hasLockCheck = checks.some((check) => String(check.label || '').toLowerCase().includes('lock'));
  const hasPreflightCheck = checks.some((check) => String(check.label || '').toLowerCase().includes('preflight'));

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
      status: controlsAvailable ? 'ok' : 'degraded',
      evidence: controlsAvailable
        ? 'Hosted admin can reach the backend runner for manual job execution.'
        : controlStatus?.reason || 'Hosted admin cannot currently reach the backend runner.',
      nextStep: controlsAvailable
        ? 'Keep the backend origin and auth bridge healthy.'
        : 'Host/connect the operations backend and wire VITE_API_ORIGIN.'
    },
    {
      id: 'scheduler',
      label: 'Autopilot scheduler',
      owner: 'operations',
      status: scheduler.enabled ? 'ok' : scheduler.configured ? 'degraded' : 'missing',
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
      status: controlsAvailable ? (hasAuditCheck ? 'ok' : 'stale') : 'degraded',
      evidence: controlsAvailable
        ? hasAuditCheck
          ? 'Backend readiness checks include audit coverage verification.'
          : 'Runner is connected, but audit-trail verification is not explicitly surfaced yet.'
        : 'Audit records cannot be trusted from the hosted surface until the runner bridge is live.',
      nextStep: hasAuditCheck
        ? 'Keep audit output visible in the operations backend.'
        : 'Expose audit verification in the backend bridge checks.'
    },
    {
      id: 'single-run-locks',
      label: 'Single-run locks',
      owner: 'operations',
      status: controlsAvailable ? (hasLockCheck ? 'ok' : 'stale') : 'degraded',
      evidence: controlsAvailable
        ? hasLockCheck
          ? 'Runner checks explicitly verify single-run lock protection.'
          : 'Runner is connected, but lock verification is not explicitly surfaced yet.'
        : 'Duplicate-run protection cannot be exercised from hosted admin until the runner bridge is live.',
      nextStep: hasLockCheck
        ? 'Continue monitoring lock collisions during manual and scheduled runs.'
        : 'Expose lock verification in the backend bridge checks.'
    },
    {
      id: 'dependency-preflight',
      label: 'Dependency preflight safety',
      owner: 'operations',
      status: controlsAvailable ? (hasPreflightCheck ? 'ok' : 'stale') : 'degraded',
      evidence: controlsAvailable
        ? hasPreflightCheck
          ? 'Runner checks explicitly verify dependency preflight readiness.'
          : 'Preflight is used by the UI, but backend verification is not explicitly surfaced yet.'
        : 'Dependency-safe manual runs are blocked until the runner bridge is live.',
      nextStep: hasPreflightCheck
        ? 'Keep dependency enforcement aligned with the recommended run order.'
        : 'Expose preflight verification in the backend bridge checks.'
    }
  ];
}

function StatusBadge({ status }) {
  const normalized = String(status || 'missing').toLowerCase();
  return (
    <Badge variant="outline" className={statusTone[normalized] || statusTone.missing}>
      {normalized}
    </Badge>
  );
}

function SummaryValue({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function JobRunSummary({ run }) {
  if (!run) {
    return <p className="text-xs text-gray-500">No run history yet.</p>;
  }

  return (
    <div className="space-y-1 text-xs text-gray-600">
      <div className="flex items-center gap-2">
        <StatusBadge status={run.lastStatus || 'missing'} />
        <span>Duration: {formatDuration(run.lastDurationMs)}</span>
      </div>
      <p>Last success: {formatDate(run.lastSucceededAt)}</p>
      <p>Last failure: {formatDate(run.lastFailedAt)}</p>
      {run.lastError ? <p className="text-red-600">Why: {run.lastError}</p> : null}
    </div>
  );
}

function BridgeReadinessCard({ controlStatus }) {
  const controlsAvailable = Boolean(controlStatus?.available);
  const bridge = controlStatus?.bridge || {};
  const expectedEndpoints = Array.isArray(bridge.expectedEndpoints) ? bridge.expectedEndpoints : [];
  const nextSteps = Array.isArray(bridge.nextSteps) ? bridge.nextSteps : [];
  const checks = Array.isArray(bridge.checks) ? bridge.checks : [];
  const activationContract = [
    {
      label: 'Backend host',
      value: 'Render service running npm run ops:serve'
    },
    {
      label: 'Cloudflare Pages',
      value: 'VITE_API_ORIGIN=https://<render-service>.onrender.com'
    },
    {
      label: 'Backend env',
      value: 'ALLOW_REMOTE_CONNECTIONS=true, PUBLIC_APP_URL=https://mainphasemarket.net'
    },
    {
      label: 'Proof command',
      value: 'npm run ops:check -- --origin https://<render-service>.onrender.com --token <admin-token>'
    }
  ];

  return (
    <Card className={controlsAvailable ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-2.5">
              {controlsAvailable ? (
                <ShieldCheck className="h-5 w-5 text-green-700" />
              ) : (
                <Lock className="h-5 w-5 text-blue-700" />
              )}
            </div>
            <div>
              <CardTitle className={controlsAvailable ? 'text-lg text-green-950' : 'text-lg text-blue-950'}>
                Operations bridge readiness
              </CardTitle>
              <p className={controlsAvailable ? 'mt-1 text-sm text-green-800' : 'mt-1 text-sm text-blue-800'}>
                {controlsAvailable
                  ? 'The hosted admin page is connected to the automation runner.'
                  : controlStatus?.reason || 'The hosted admin page can read reports, but cannot run Node automations until the bridge is connected.'}
              </p>
            </div>
          </div>
          <StatusBadge status={controlsAvailable ? 'ok' : 'degraded'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryValue label="Mode" value={controlStatus?.mode || 'unknown'} />
          <SummaryValue label="Bridge origin" value={bridge.apiOrigin || bridge.publicAppUrl || 'not configured'} />
          <SummaryValue label="Cloudflare variable" value={bridge.expectedVariable || bridge.expectedCloudflareVariable || 'VITE_API_ORIGIN'} />
        </div>

        {checks.length > 0 ? (
          <div className="rounded-xl border border-white bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Backend readiness checks</p>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {checks.map((check) => (
                <div key={check.id || check.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{check.label}</p>
                    <StatusBadge status={check.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{check.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!controlsAvailable ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-white p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Activation contract</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Static reporting is live. Manual runs, audit history, scheduler proof, and one-click refresh become live after this bridge contract is connected.
                  </p>
                </div>
                <StatusBadge status="degraded" />
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {activationContract.map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-700">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Expected backend endpoints</p>
                <div className="mt-3 space-y-2">
                  {(expectedEndpoints.length > 0 ? expectedEndpoints : ['/api/local/health', '/api/local/admin/automation/control-status']).map((endpoint) => (
                    <p key={endpoint} className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                      {endpoint}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next bridge steps</p>
                <ol className="mt-3 space-y-2 text-sm text-slate-700">
                  {(nextSteps.length > 0 ? nextSteps : ['Deploy the Node operations backend.', 'Set VITE_API_ORIGIN in Cloudflare Pages.', 'Redeploy the hosted frontend.']).map((step, index) => (
                    <li key={step} className="flex gap-2">
                      <span className="font-semibold text-slate-900">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-green-100 bg-white p-4 text-sm text-green-800">
            Manual runs are available. The backend will still enforce admin auth, allowlisted jobs, single-run locks, audit logging, and dependency preflight.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ActionCenterCard({ systemHealth, sections, automationRuns, controlStatus }) {
  const items = useMemo(() => buildActionItems(systemHealth, sections, automationRuns), [systemHealth, sections, automationRuns]);

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <ListChecks className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Operations action center</CardTitle>
              <p className="text-sm text-gray-500 mt-1">A prioritized view of what needs attention first, which pipeline owns it, and what happened last.</p>
            </div>
          </div>
          <StatusBadge status={systemHealth?.overallStatus || 'missing'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.sectionKey} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-base font-semibold text-gray-900">{item.label}</p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-sm text-gray-600">{item.note}</p>
                {item.affectedCount > 0 ? (
                  <p className="text-sm text-gray-500">
                    <span className="font-medium text-gray-700">Targets:</span> {item.affectedSummary}
                  </p>
                ) : null}
              </div>

              {item.jobs.length > 0 ? (
                <div className="min-w-80 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owned by</p>
                  <div className="mt-2 space-y-2">
                    {item.jobs.map((job) => (
                      <div key={job.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{job.label}</p>
                            <p className="mt-1 text-xs text-slate-600">{job.script}</p>
                            <p className="mt-1 text-xs text-slate-500">{job.cadence} • {job.owner}</p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <JobRunSummary run={job.run} />
                        </div>
                        <div className="mt-2">
                          <DependencySummary job={job} automationRuns={automationRuns} controlStatus={controlStatus} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ReadinessCard({ section }) {
  const entries = Array.isArray(section?.entries) ? section.entries : [];
  const averageScore = Number(section?.averageScore || 0);

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <CheckCircle2 className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Game readiness</CardTitle>
              <p className="text-sm text-gray-500 mt-1">The next operational step for each game on the road to storefront-ready.</p>
            </div>
          </div>
          <StatusBadge status={section?.overallStatus || 'missing'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryValue label="Average readiness" value={`${averageScore}%`} />
          <SummaryValue label="Games tracked" value={entries.length} />
          <SummaryValue label="Storefront ready" value={entries.filter((entry) => entry.readinessScore >= 100).length} />
        </div>

        {entries.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Game</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Readiness</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {entries.map((entry) => (
                  <tr key={entry.game}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{entry.game}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.readinessScore}%</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.stage}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{entry.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AutomationHistoryCard({ automationRuns }) {
  const summary = useMemo(() => summarizeAutomationRuns(automationRuns), [automationRuns]);

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-gray-900">Pipeline run history</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Last success, last failure, duration, and run state for each automation job.</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={summary.failed > 0 ? 'failed' : summary.running > 0 ? 'running' : summary.missing > 0 ? 'missing' : 'ok'} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryValue label="Healthy jobs" value={summary.ok} />
          <SummaryValue label="Failed jobs" value={summary.failed} />
          <SummaryValue label="Running jobs" value={summary.running} />
          <SummaryValue label="No history yet" value={summary.missing} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Job</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Cadence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last success</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last failure</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Diagnostics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {siteAutomationRegistry.map((job) => {
                const run = getRunRecord(automationRuns, job.id);
                return (
                  <tr key={job.id}>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-medium text-gray-900">{job.label}</p>
                      <p className="mt-1 text-xs text-gray-500">{job.script}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 align-top">{job.owner}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 align-top">{job.cadence}</td>
                    <td className="px-4 py-3 text-sm align-top"><StatusBadge status={run?.lastStatus || 'missing'} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{formatDate(run?.lastSucceededAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{formatDate(run?.lastFailedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{formatDuration(run?.lastDurationMs)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top max-w-sm">
                      {run?.lastError ? run.lastError : run ? 'Latest run completed without a recorded error.' : 'No run history has been captured for this job yet.'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationsIncidentCard({ systemHealth, sections, automationRuns, controlStatus }) {
  const incidents = useMemo(
    () => buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus),
    [systemHealth, sections, automationRuns, controlStatus]
  );
  const critical = incidents.filter((incident) => incident.severity === 'critical').length;
  const warning = incidents.filter((incident) => incident.severity === 'warning').length;
  const watch = incidents.filter((incident) => incident.severity === 'watch').length;
  const topStatus = critical > 0 ? 'failed' : warning > 0 ? 'degraded' : watch > 0 ? 'stale' : 'ok';

  return (
    <Card className={incidents.length > 0 ? 'border-amber-200 bg-amber-50/40' : 'border-green-200 bg-green-50/40'}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={incidents.length > 0 ? 'rounded-xl bg-amber-100 p-2.5' : 'rounded-xl bg-green-100 p-2.5'}>
              {incidents.length > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-700" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-green-700" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Operations incident queue</CardTitle>
              <p className="mt-1 text-sm text-gray-600">
                The smoke alarm layer: failed jobs, stale outputs, bridge issues, scheduler due work, and missing coverage roll up here first.
              </p>
            </div>
          </div>
          <StatusBadge status={topStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryValue label="Active incidents" value={incidents.length} />
          <SummaryValue label="Critical" value={critical} />
          <SummaryValue label="Warnings" value={warning} />
          <SummaryValue label="Watch" value={watch} />
        </div>

        {incidents.length === 0 ? (
          <div className="rounded-2xl border border-green-200 bg-white p-4">
            <p className="font-semibold text-green-900">No active incidents. Beast is calm.</p>
            <p className="mt-1 text-sm text-green-700">
              Nothing is currently screaming for attention. We can spend the next work block on product quality instead of ops firefighting.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((incident) => (
              <div key={incident.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{incident.title}</p>
                      <StatusBadge status={incident.status} />
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {incident.severity}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      <span className="font-medium text-gray-800">Evidence:</span> {incident.evidence}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      <span className="font-medium text-gray-800">Fix:</span> {incident.fix}
                    </p>
                    {incident.impactedCapabilities.length > 0 ? (
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-medium text-gray-800">Impacts:</span> {incident.impactedCapabilities.join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-48 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Owner</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{incident.owner}</p>
                    {incident.job?.script ? (
                      <p className="mt-2 break-all font-mono text-xs text-slate-600">{incident.job.script}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceLevelCard({ automationRuns, controlStatus }) {
  const rows = useMemo(
    () => buildServiceLevelRows(automationRuns, controlStatus),
    [automationRuns, controlStatus]
  );
  const okCount = rows.filter((row) => row.status === 'ok').length;
  const attentionCount = rows.length - okCount;
  const nextDue = rows
    .filter((row) => row.nextDueAt)
    .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())[0];

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-50 p-2.5">
              <Clock3 className="h-5 w-5 text-indigo-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Automation SLA board</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Freshness targets for each business pipeline so stale data cannot quietly rot behind a green-looking page.
              </p>
            </div>
          </div>
          <StatusBadge status={attentionCount > 0 ? 'stale' : 'ok'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryValue label="Within SLA" value={okCount} />
          <SummaryValue label="Needs attention" value={attentionCount} />
          <SummaryValue label="Next due job" value={nextDue?.label || 'none'} />
          <SummaryValue label="Next due at" value={formatDate(nextDue?.nextDueAt)} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pipeline</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">SLA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Freshness</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Next due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Business impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 align-top">
                    <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.owner} â€¢ {row.script}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 align-top">{row.cadence} / {row.targetHours}h</td>
                  <td className="px-4 py-3 text-sm text-gray-700 align-top">
                    {row.freshnessHours == null ? 'No successful run yet' : formatHours(row.freshnessHours)}
                    {row.overdueHours > 0 ? (
                      <p className="mt-1 text-xs font-medium text-orange-700">Over by {formatHours(row.overdueHours)}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">{formatDate(row.nextDueAt)}</td>
                  <td className="px-4 py-3 text-sm align-top">
                    <StatusBadge status={row.status} />
                    {row.isDue ? <p className="mt-1 text-xs text-orange-700">Scheduler says due</p> : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top max-w-sm">{row.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LaunchReadinessCard({ sections, automationRuns, controlStatus }) {
  const readiness = useMemo(
    () => buildLaunchReadinessRows(sections, automationRuns, controlStatus),
    [sections, automationRuns, controlStatus]
  );
  const rows = readiness.rows;
  const readyCount = rows.filter((row) => row.status === 'ok').length;
  const readinessScore = Math.round((readyCount / Math.max(rows.length, 1)) * 100);
  const blockers = rows.filter((row) => row.status !== 'ok');

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5">
              <ListChecks className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Launch readiness matrix</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Business-facing readiness for advertising, inventory intake, storefront trust, and day-to-day operations.
              </p>
            </div>
          </div>
          <StatusBadge status={blockers.length > 0 ? 'degraded' : 'ok'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <SummaryValue label="Readiness score" value={`${readinessScore}%`} />
          <SummaryValue label="Ready capabilities" value={`${readyCount}/${rows.length}`} />
          <SummaryValue label="Blockers" value={blockers.length} />
          <SummaryValue label="Next focus" value={blockers[0]?.label || 'Product polish'} />
          <SummaryValue label="Launch risk" value={readiness.topRisk} />
        </div>

        {readiness.atRiskCapabilities.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="font-semibold text-amber-900">Launch-critical capabilities at risk</p>
            <p className="mt-2 text-sm text-amber-800">
              {readiness.atRiskCapabilities.join(', ')} currently carry the highest launch risk based on active operations incidents.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{row.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">Owner: {row.owner}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Evidence:</span> {row.evidence}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Next step:</span> {row.nextStep}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SourceGovernanceCard({ sections }) {
  const rows = useMemo(() => buildSourceGovernanceRows(sections), [sections]);
  const localCount = rows.filter((row) => row.controlModel === 'Managed locally').length;
  const remoteCount = rows.filter((row) => row.controlModel !== 'Managed locally' && row.status === 'ok').length;
  const missingCount = rows.filter((row) => row.status !== 'ok').length;
  const totalFeeds = rows.reduce((sum, row) => sum + row.feeds.length, 0);

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <Database className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Source governance</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                The upstream feeds the business depends on before catalog, image, and readiness automations can do useful work.
              </p>
            </div>
          </div>
          <StatusBadge status={missingCount > 0 ? 'missing' : 'ok'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryValue label="Games covered" value={rows.length} />
          <SummaryValue label="Managed local sources" value={localCount} />
          <SummaryValue label="External sources" value={remoteCount} />
          <SummaryValue label="Feed links powered" value={totalFeeds} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Game</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Control model</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Upstream</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Feeds</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Coverage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Operational risk</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rows.map((row) => (
                <tr key={row.game}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 align-top">{row.game}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">{row.sourceType}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">{row.controlModel}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top break-all max-w-xs">{row.upstream}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">{row.feeds.join(', ')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">{row.cards} cards / {row.sets} sets</td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top max-w-sm">{row.nextRisk}</td>
                  <td className="px-4 py-3 text-sm align-top"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ControlPlaneCard({ controlStatus }) {
  const rows = useMemo(() => buildControlPlaneRows(controlStatus), [controlStatus]);
  const healthy = rows.filter((row) => row.status === 'ok').length;
  const watching = rows.filter((row) => row.status === 'stale').length;
  const blocked = rows.filter((row) => row.status === 'degraded' || row.status === 'missing' || row.status === 'failed').length;

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5">
              <Activity className="h-5 w-5 text-violet-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Operations control plane</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                The automation brain behind the business: reporting, manual execution, scheduler, locks, auditability, and dependency safety.
              </p>
            </div>
          </div>
          <StatusBadge status={blocked > 0 ? 'degraded' : watching > 0 ? 'stale' : 'ok'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryValue label="Control services" value={rows.length} />
          <SummaryValue label="Healthy" value={healthy} />
          <SummaryValue label="Watching" value={watching} />
          <SummaryValue label="Blocked" value={blocked} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{row.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">Owner: {row.owner}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Evidence:</span> {row.evidence}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Next step:</span> {row.nextStep}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RunnerAuditTimelineCard({ controlStatus }) {
  const summary = useMemo(() => buildRunnerAuditSummary(controlStatus), [controlStatus]);
  const visibleEntries = summary.entries.slice(0, 10);

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <Terminal className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Runner audit timeline</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                The proof trail for manual runs, scheduler actions, locks, blocked attempts, and failures on the automation control plane.
              </p>
            </div>
          </div>
          <StatusBadge status={summary.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <SummaryValue label="Active locks" value={summary.activeLocks} />
          <SummaryValue label="Completed" value={summary.completedCount} />
          <SummaryValue label="Blocked" value={summary.blockedCount} />
          <SummaryValue label="Failures" value={summary.failureCount} />
          <SummaryValue label="Actors seen" value={summary.uniqueActors.length} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryValue label="Latest status" value={summary.latestEntry?.status || 'none'} />
            <SummaryValue label="Latest job" value={getJobDetails(summary.latestEntry?.jobId)?.label || summary.latestEntry?.jobId || 'none'} />
            <SummaryValue label="Audit updated" value={formatDate(summary.generatedAt)} />
          </div>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="font-semibold text-amber-900">No runner audit history captured yet.</p>
            <p className="mt-2 text-sm text-amber-800">
              The control plane is not yet producing a visible execution trail from the hosted admin perspective.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleEntries.map((entry, index) => {
              const status = String(entry?.status || 'missing').toLowerCase();
              const jobLabel = getJobDetails(entry?.jobId)?.label || entry?.jobId || 'Unknown job';
              const timestamp = entry?.finishedAt || entry?.startedAt || entry?.blockedAt || entry?.checkedAt || null;
              const detail = entry?.error
                || entry?.preflight?.message
                || (entry?.exitCode != null ? `Exit code ${entry.exitCode}` : 'No extra diagnostics recorded.');

              return (
                <div key={`${entry?.runId || 'entry'}-${index}`} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{jobLabel}</p>
                        <StatusBadge status={status} />
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-medium text-gray-800">Actor:</span> {entry?.actor || 'unknown'}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-medium text-gray-800">When:</span> {formatDate(timestamp)}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-medium text-gray-800">Details:</span> {detail}
                      </p>
                    </div>
                    <div className="min-w-48 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Runner job</p>
                      <p className="mt-1 break-all text-sm font-semibold text-slate-900">{entry?.runnerJob || 'unknown'}</p>
                      {entry?.runId ? (
                        <>
                          <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Run ID</p>
                          <p className="mt-1 break-all font-mono text-xs text-slate-700">{entry.runId}</p>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CapabilityConfidenceCard({ sections, automationRuns, controlStatus }) {
  const rows = useMemo(
    () => buildCapabilityConfidenceRows(sections, automationRuns, controlStatus),
    [sections, automationRuns, controlStatus]
  );
  const trustedCount = rows.filter((row) => row.status === 'ok').length;
  const watchingCount = rows.filter((row) => row.status === 'stale').length;
  const unprovenCount = rows.filter((row) => row.status === 'missing' || row.status === 'failed').length;

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-sky-50 p-2.5">
              <ShieldCheck className="h-5 w-5 text-sky-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Business capability confidence</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                The trust layer: which business capabilities are proven by fresh evidence, which are only being watched, and which are not yet trustworthy.
              </p>
            </div>
          </div>
          <StatusBadge status={unprovenCount > 0 ? 'missing' : watchingCount > 0 ? 'stale' : 'ok'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryValue label="Capabilities" value={rows.length} />
          <SummaryValue label="Trusted" value={trustedCount} />
          <SummaryValue label="Watching" value={watchingCount} />
          <SummaryValue label="Unproven" value={unprovenCount} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{row.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                    Confidence: {row.proofLabel}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <SummaryValue label="Healthy jobs" value={`${row.jobsHealthy}/${row.totalJobs}`} />
                <SummaryValue label="Source coverage" value={row.sourceCoverage} />
                <SummaryValue label="Missing sources" value={row.missingSources} />
              </div>

              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Evidence:</span> {row.evidence}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Next step:</span> {row.nextStep}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DataContractsCard({ automationRuns }) {
  const rows = useMemo(() => buildDataContractRows(automationRuns), [automationRuns]);

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <Database className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Data contracts and lineage</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                The map of what each automation owns, what files it produces, and which downstream systems depend on it.
              </p>
            </div>
          </div>
          <StatusBadge status={rows.some((row) => String(row.status).toLowerCase() !== 'ok') ? 'degraded' : 'ok'} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Producer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Outputs</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Consumers</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contract</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 align-top">{row.owner}</td>
                  <td className="px-4 py-3 align-top">
                    <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-gray-500">{row.script}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">
                    <ul className="space-y-1">
                      {row.outputs.map((output) => (
                        <li key={output} className="break-all font-mono text-xs">{output}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">
                    {row.consumers.length > 0 ? row.consumers.join(', ') : 'Direct admin visibility'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top max-w-sm">{row.contract}</td>
                  <td className="px-4 py-3 text-sm align-top">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RecoveryPlaybookCard({ systemHealth, sections, automationRuns, controlStatus }) {
  const playbook = useMemo(
    () => buildRecoveryPlaybooks(systemHealth, sections, automationRuns, controlStatus),
    [systemHealth, sections, automationRuns, controlStatus]
  );

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-50 p-2.5">
              <Wrench className="h-5 w-5 text-rose-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Recovery playbook</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                The safe repair path when automations, freshness, or business capabilities drift out of line.
              </p>
            </div>
          </div>
          <StatusBadge status={playbook.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryValue label="Active incidents" value={playbook.incidentCount} />
          <SummaryValue label="Broken sections" value={playbook.brokenSections.length > 0 ? playbook.brokenSections.join(', ') : 'none'} />
          <SummaryValue label="First focus" value={playbook.nextIncident?.title || 'No active recovery needed'} />
          <SummaryValue label="Restore first" value={playbook.restoreFirst} />
        </div>

        {playbook.capabilityPriorities.length > 0 ? (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
            <p className="font-semibold text-indigo-900">Business capability restore priority</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {playbook.capabilityPriorities.map((capability) => (
                <div key={capability.label} className="rounded-xl border border-indigo-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{capability.label}</p>
                    <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                      {capability.count} hit
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{capability.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="font-semibold text-gray-900">Recommended recovery order</p>
          <ol className="mt-3 space-y-2 text-sm text-gray-700">
            {playbook.steps.map((step, index) => (
              <li key={`${index}-${step}`} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-semibold text-slate-900">If the page looks green but the site feels wrong</p>
          <ol className="mt-3 space-y-2 text-sm text-slate-700">
            {playbook.fallbackSteps.map((step, index) => (
              <li key={`${index}-${step}`} className="flex gap-3">
                <span className="font-semibold text-slate-900">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineControlsCard({ automationRuns, controlStatus, onRunJob, startingJobId }) {
  const controlsAvailable = Boolean(controlStatus?.available);
  const recommendedRunOrder = useMemo(
    () => buildRecommendedRunOrder(automationRuns, controlStatus),
    [automationRuns, controlStatus]
  );

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5">
              <ShieldCheck className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Pipeline controls</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Manual control surface for the business automations. Jobs run through the backend runner with audit logging and single-run locks.
              </p>
            </div>
          </div>
          <Badge variant="outline" className={controlsAvailable ? 'border-green-200 bg-green-50 text-green-700' : 'border-blue-200 bg-blue-50 text-blue-700'}>
            {controlsAvailable ? 'runner connected' : 'runner unavailable'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-2xl border p-4 ${controlsAvailable ? 'border-green-100 bg-green-50' : 'border-blue-100 bg-blue-50'}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <div className="rounded-xl bg-white p-2.5">
                {controlsAvailable ? (
                  <ShieldCheck className="h-5 w-5 text-green-700" />
                ) : (
                  <Lock className="h-5 w-5 text-blue-700" />
                )}
              </div>
              <div>
                <p className={controlsAvailable ? 'font-semibold text-green-950' : 'font-semibold text-blue-950'}>
                  {controlsAvailable ? 'Manual pipeline runner is connected.' : 'Manual runs require the operations backend bridge.'}
                </p>
                <p className={`mt-1 text-sm ${controlsAvailable ? 'text-green-800' : 'text-blue-800'}`}>
                  {controlsAvailable
                    ? 'Clicking a run button starts the known automation job, records an audit entry, and prevents duplicate runs with a lock file.'
                    : controlStatus?.reason || 'Hosted static pages cannot execute Node automation jobs directly.'}
                </p>
              </div>
            </div>
            <StatusBadge status={controlsAvailable ? 'ok' : 'degraded'} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-semibold text-slate-900">Automation scheduler</p>
              <p className="mt-1 text-sm text-slate-600">
                Opt-in autopilot for the business pipelines. It runs through the same lock, audit, and preflight rules as manual controls.
              </p>
            </div>
            <StatusBadge status={controlStatus?.scheduler?.enabled ? 'ok' : 'degraded'} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <SummaryValue label="State" value={controlStatus?.scheduler?.enabled ? 'enabled' : 'disabled'} />
            <SummaryValue label="Configured" value={controlStatus?.scheduler?.configured ? 'yes' : 'no'} />
            <SummaryValue label="Last checked" value={formatDate(controlStatus?.scheduler?.lastCheckedAt)} />
            <SummaryValue label="Due jobs" value={(controlStatus?.scheduler?.dueJobs || []).length} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Cadence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last run</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Next run</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {(controlStatus?.scheduler?.jobs || []).map((job) => (
                  <tr key={job.jobId}>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-medium text-gray-900">{getJobDetails(job.jobId)?.label || job.jobId}</p>
                      <p className="mt-1 text-xs text-gray-500">{job.reason}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 align-top">{job.cadence}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{formatDate(job.lastRunAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{formatDate(job.nextRunAt)}</td>
                    <td className="px-4 py-3 text-sm align-top">
                      <StatusBadge status={job.lock ? 'running' : job.due ? 'degraded' : 'ok'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!controlStatus?.scheduler?.configured ? (
            <p className="mt-3 text-sm text-slate-500">
              Enable this on the operations backend with <span className="font-mono text-slate-700">MPM_AUTOMATION_SCHEDULER_ENABLED=true</span> after the bridge is hosted and verified.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-semibold text-slate-900">Recommended run order</p>
              <p className="mt-1 text-sm text-slate-600">
                The safest automation sequence based on upstream dependencies and current run history.
              </p>
            </div>
            <StatusBadge status={recommendedRunOrder.some((job) => !job.preflight.ready) ? 'blocked' : 'ok'} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {recommendedRunOrder.map((job, index) => (
              <div key={job.id} className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {index + 1}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{job.label}</p>
                  <StatusBadge status={job.preflight.ready ? job.status : 'blocked'} />
                </div>
                <p className="mt-1 text-xs text-slate-600">{job.preflight.message}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {siteAutomationRegistry.map((job) => {
            const run = getRunRecord(automationRuns, job.id);
            const readiness = getControlReadiness(run);
            const controlEntry = getControlEntry(controlStatus, job.id);
            const lock = controlEntry?.lock || null;
            const preflight = getEffectivePreflight(job, automationRuns, controlStatus);
            const isStarting = startingJobId === job.id;
            const canRun = controlsAvailable && !lock && !isStarting && preflight.ready;

            return (
              <div key={job.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{job.label}</p>
                      <StatusBadge status={run?.lastStatus || 'missing'} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{job.purpose}</p>
                  </div>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{job.cadence}</Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <SummaryValue label="Owner" value={job.owner} />
                  <SummaryValue label="Last success" value={formatDate(run?.lastSucceededAt)} />
                  <SummaryValue label="Duration" value={formatDuration(run?.lastDurationMs)} />
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Terminal className="h-4 w-4" />
                    Command
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-slate-700">{job.script}</p>
                </div>

                <div className="mt-4">
                  <DependencySummary job={job} automationRuns={automationRuns} controlStatus={controlStatus} />
                </div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className={`text-sm font-semibold ${readiness.tone}`}>{readiness.label}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {lock
                        ? `Locked by run ${lock.runId || 'unknown'} started ${formatDate(lock.startedAt)}.`
                        : !preflight.ready
                          ? preflight.message
                        : readiness.note}
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={!canRun}
                    variant={canRun ? 'default' : 'outline'}
                    className={canRun ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-gray-200 bg-gray-50 text-gray-500'}
                    onClick={() => onRunJob(job.id)}
                  >
                    {isStarting ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    {isStarting ? 'Starting...' : canRun ? 'Run now' : lock ? 'Run locked' : !preflight.ready ? 'Blocked' : 'Unavailable'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, sectionKey, section, automationRuns }) {
  const Icon = sectionIcons[sectionKey] || Wrench;
  const entries = Array.isArray(section?.entries) ? section.entries : [];
  const topLevelStatus = section?.status || section?.overallStatus || 'missing';
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

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <Icon className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">{title}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">Operational visibility for this pipeline family.</p>
            </div>
          </div>
          <StatusBadge status={topLevelStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {section?.file && (
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryValue label="Updated" value={formatDate(section.file.modifiedAt)} />
            <SummaryValue label="Freshness" value={formatHours(section.modifiedHoursAgo)} />
            {'releaseCount' in section ? (
              <SummaryValue label="Items" value={section.releaseCount} />
            ) : null}
          </div>
        )}

        {section?.snapshot && (
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryValue label="Snapshot status" value={section.snapshot.status || '—'} />
            <SummaryValue label="Updated" value={formatDate(section.snapshot.file?.modifiedAt)} />
            <SummaryValue label="Freshness" value={formatHours(section.snapshot.modifiedHoursAgo)} />
            <SummaryValue label="Preview rows" value={section.snapshot.previewCount ?? 0} />
          </div>
        )}

        {section?.counts && (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <SummaryValue label="OK" value={section.counts.ok ?? 0} />
            <SummaryValue label="Degraded" value={section.counts.degraded ?? 0} />
            <SummaryValue label="Stale" value={section.counts.stale ?? 0} />
            <SummaryValue label="Missing" value={section.counts.missing ?? 0} />
          </div>
        )}

        {Array.isArray(section?.diagnostics) && section.diagnostics.length > 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Diagnostics</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {section.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>• {diagnostic}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {jobs.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{job.label}</p>
                    <p className="mt-1 text-xs text-gray-500">{job.cadence} • {job.owner}</p>
                  </div>
                  <StatusBadge status={job.run?.lastStatus || 'missing'} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <SummaryValue label="Last success" value={formatDate(job.run?.lastSucceededAt)} />
                  <SummaryValue label="Last failure" value={formatDate(job.run?.lastFailedAt)} />
                  <SummaryValue label="Duration" value={formatDuration(job.run?.lastDurationMs)} />
                </div>
                {job.run?.lastError ? (
                  <p className="mt-3 text-sm text-red-600">Why: {job.run.lastError}</p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">No recorded error on the latest run.</p>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {entries.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Diagnostics</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Freshness</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {entries.map((entry) => (
                  <tr key={entry.game || entry.source || entry.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {entry.game || entry.source || entry.id || 'entry'}
                    </td>
                    <td className="px-4 py-3 text-sm"><StatusBadge status={entry.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{classifyEntryIssue(entry)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                      {Array.isArray(entry.diagnostics) && entry.diagnostics.length > 0
                        ? entry.diagnostics.join(' • ')
                        : 'No extra diagnostics recorded.'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 break-all max-w-xs">{formatSourceSummary(entry.source)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(entry.file?.modifiedAt || entry.cards?.file?.modifiedAt || entry.sets?.file?.modifiedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatHours(entry.modifiedHoursAgo)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {entry.rows != null ? `${entry.rows} rows` : null}
                      {entry.cards?.count != null ? `${entry.cards.count} cards / ${entry.sets?.count ?? 0} sets` : null}
                      {entry.cardsSeen != null ? `${entry.cardsSeen} cards seen` : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminOperations() {
  const navigate = useNavigate();
  const [, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState(null);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (!isAuth) {
        backend.auth.redirectToLogin(window.location.href);
        return;
      }
      const userData = await backend.auth.getCurrentUser();
      if (userData.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setUser(userData);
      setLoading(false);
    };
    loadUser();
  }, []);

  const healthQuery = useQuery({
    queryKey: ['admin-operations-health'],
    queryFn: () => backend.app.getHealthStatus(),
    enabled: !loading,
    refetchInterval: 30000
  });

  const controlQuery = useQuery({
    queryKey: ['admin-automation-control-status'],
    queryFn: () => backend.app.getAutomationControlStatus(),
    enabled: !loading,
    refetchInterval: 10000,
    retry: false
  });

  const runJobMutation = useMutation({
    mutationFn: (jobId) => backend.app.runAutomationJob(jobId),
    onSuccess: (payload, jobId) => {
      const job = getJobDetails(jobId);
      toast.success(`${job?.label || 'Pipeline'} started`);
      controlQuery.refetch();
      healthQuery.refetch({ cancelRefetch: false });
      window.setTimeout(() => {
        controlQuery.refetch();
        healthQuery.refetch({ cancelRefetch: false });
      }, 3000);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to start pipeline');
      controlQuery.refetch();
    }
  });

  const systemHealth = healthQuery.data?.systemHealth || null;
  const sections = systemHealth?.sections || {};
  const generatedAt = systemHealth?.generatedAt || null;
  const automationRuns = systemHealth?.automationRuns || { generatedAt: null, jobs: {} };
  const automationSummary = useMemo(() => summarizeAutomationRuns(automationRuns), [automationRuns]);
  const controlStatus = controlQuery.data || {
    available: false,
    mode: 'unknown',
    reason: controlQuery.isError
      ? (controlQuery.error?.message || 'Automation control backend is not reachable.')
      : 'Checking automation control backend...'
  };
  const startingJobId = runJobMutation.isPending ? runJobMutation.variables : null;
  const serviceLevelRows = useMemo(
    () => buildServiceLevelRows(automationRuns, controlStatus),
    [automationRuns, controlStatus]
  );
  const launchReadiness = useMemo(
    () => buildLaunchReadinessRows(sections, automationRuns, controlStatus),
    [sections, automationRuns, controlStatus]
  );
  const sourceGovernanceRows = useMemo(() => buildSourceGovernanceRows(sections), [sections]);
  const dataContractRows = useMemo(() => buildDataContractRows(automationRuns), [automationRuns]);
  const capabilityConfidenceRows = useMemo(
    () => buildCapabilityConfidenceRows(sections, automationRuns, controlStatus),
    [sections, automationRuns, controlStatus]
  );
  const displayLastCheckedAt = useMemo(() => {
    const timestamps = [healthQuery.dataUpdatedAt, controlQuery.dataUpdatedAt, lastManualRefreshAt]
      .filter((value) => typeof value === 'number' && Number.isFinite(value));

    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [controlQuery.dataUpdatedAt, healthQuery.dataUpdatedAt, lastManualRefreshAt]);

  const summary = useMemo(() => {
    const sectionStatuses = Object.values(sections).map((section) => String(section?.status || section?.overallStatus || 'missing').toLowerCase());
    const automationAreaStatus = automationSummary.failed > 0
      ? 'degraded'
      : automationSummary.running > 0
        ? 'degraded'
        : automationSummary.missing > 0
          ? 'missing'
          : 'ok';
    const combinedStatuses = [
      ...sectionStatuses,
      automationAreaStatus,
      deriveAutomationHistoryStatus(automationSummary),
      deriveServiceLevelStatus(serviceLevelRows),
      deriveLaunchReadinessStatus(launchReadiness),
      deriveSourceGovernanceStatus(sourceGovernanceRows),
      deriveDataContractsStatus(dataContractRows),
      capabilityConfidenceRows.some((row) => row.status === 'missing')
        ? 'missing'
        : capabilityConfidenceRows.some((row) => row.status === 'stale')
          ? 'stale'
          : 'ok',
      deriveRunnerAuditStatus(controlStatus),
      derivePipelineControlsStatus(controlStatus)
    ];
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
      automationAreaStatus
    };
  }, [sections, automationSummary, serviceLevelRows, launchReadiness, sourceGovernanceRows, dataContractRows, capabilityConfidenceRows, controlStatus]);

  const handleRefresh = async () => {
    const previousGeneratedAt = generatedAt;
    setManualRefreshPending(true);
    setLastManualRefreshAt(Date.now());

    const [healthResult, controlResult] = await Promise.allSettled([
      healthQuery.refetch({ cancelRefetch: true }),
      controlQuery.refetch({ cancelRefetch: true })
    ]);

    setManualRefreshPending(false);

    const healthFailed = healthResult.status === 'rejected';
    const controlFailed = controlResult.status === 'rejected';

    if (healthFailed && controlFailed) {
      toast.error('Refresh failed. The dashboard could not reach either operations data source.');
      return;
    }

    const refreshedGeneratedAt = healthResult.status === 'fulfilled'
      ? (healthResult.value.data?.systemHealth?.generatedAt || null)
      : previousGeneratedAt;

    if (refreshedGeneratedAt && previousGeneratedAt && refreshedGeneratedAt === previousGeneratedAt) {
      toast.success('Dashboard rechecked. The source snapshot has not regenerated since the last report.');
      return;
    }

    if (controlFailed) {
      toast.success('Health snapshot refreshed. Manual control status is still unavailable.');
      return;
    }

    toast.success('Admin Operations refreshed successfully.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading operations dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Button type="button" variant="outline" onClick={() => navigate('/AdminDashboard')} className="border-gray-200">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Link to="/" className="text-sm text-gray-500 hover:text-gray-800">Site</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Operations</h1>
            <p className="text-gray-500 mt-1">A visual pulse for the pipelines, downloads, catalog feeds, image sync, pricing, and system health.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 text-right space-y-1">
              <div>
                Report generated: <span className="font-medium text-gray-800">{formatDate(generatedAt)}</span>
              </div>
              <div>
                Last checked: <span className="font-medium text-gray-800">{formatDate(displayLastCheckedAt)}</span>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleRefresh}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${manualRefreshPending || healthQuery.isFetching || controlQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard title="Overall" value={summary.topStatus} icon={summary.topStatus === 'ok' ? CheckCircle2 : summary.topStatus === 'missing' ? ServerCrash : AlertTriangle} color={summary.topStatus === 'ok' ? 'green' : summary.topStatus === 'missing' ? 'red' : 'amber'} />
          <StatsCard title="Healthy Areas" value={summary.ok} icon={CheckCircle2} color="green" />
          <StatsCard title="Degraded Areas" value={summary.degraded} icon={AlertTriangle} color="amber" />
          <StatsCard title="Stale Areas" value={summary.stale} icon={Clock3} color="purple" />
          <StatsCard title="Missing Areas" value={summary.missing} icon={ServerCrash} color="red" />
        </div>

        {healthQuery.isError && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <div className="rounded-xl bg-amber-100 p-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-semibold text-amber-900">Live health feed is not connected on the hosted domain yet.</p>
                  <p className="mt-1 text-sm text-amber-800">
                    The admin operations panel itself is live, but the hosted site is not returning the runtime health payload yet.
                    We can still use this page for structure and automation visibility while we wire the hosted health endpoint.
                  </p>
                </div>
              </div>
              <StatusBadge status="degraded" />
            </CardContent>
          </Card>
        )}

        <Card className="border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-gray-900">Automation registry</CardTitle>
                <p className="text-sm text-gray-500 mt-1">These are the declared pipeline families currently registered in the system.</p>
              </div>
              <StatusBadge status={summary.topStatus} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              {siteAutomationRegistry.map((job) => (
                <div key={job.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{job.label}</p>
                      <p className="text-sm text-gray-500 mt-1">{job.purpose}</p>
                    </div>
                    <Badge variant="outline" className="border-slate-200 text-slate-700 bg-slate-50">{job.cadence}</Badge>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-gray-600">
                    <p><span className="font-medium text-gray-800">Script:</span> {job.script}</p>
                    <p><span className="font-medium text-gray-800">Owner:</span> {job.owner}</p>
                    <p><span className="font-medium text-gray-800">Outputs:</span> {job.outputs.join(', ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <OperationsIncidentCard
          systemHealth={systemHealth}
          sections={sections}
          automationRuns={automationRuns}
          controlStatus={controlStatus}
        />
        <ServiceLevelCard automationRuns={automationRuns} controlStatus={controlStatus} />
        <LaunchReadinessCard
          sections={sections}
          automationRuns={automationRuns}
          controlStatus={controlStatus}
        />
        <CapabilityConfidenceCard
          sections={sections}
          automationRuns={automationRuns}
          controlStatus={controlStatus}
        />
        <SourceGovernanceCard sections={sections} />
        <DataContractsCard automationRuns={automationRuns} />
        <RecoveryPlaybookCard
          systemHealth={systemHealth}
          sections={sections}
          automationRuns={automationRuns}
          controlStatus={controlStatus}
        />
        <AutomationHistoryCard automationRuns={automationRuns} />
        <ControlPlaneCard controlStatus={controlStatus} />
        <RunnerAuditTimelineCard controlStatus={controlStatus} />
        <BridgeReadinessCard controlStatus={controlStatus} />
        <PipelineControlsCard
          automationRuns={automationRuns}
          controlStatus={controlStatus}
          onRunJob={(jobId) => runJobMutation.mutate(jobId)}
          startingJobId={startingJobId}
        />

        <div className="grid gap-6">
          <ActionCenterCard systemHealth={systemHealth} sections={sections} automationRuns={automationRuns} controlStatus={controlQuery.data} />
          <SectionCard title="Homepage feed" sectionKey="homepage" section={sections.homepage} automationRuns={automationRuns} />
          <ReadinessCard section={sections.readiness} />
          <SectionCard title="Catalog pipelines" sectionKey="catalogs" section={sections.catalogs} automationRuns={automationRuns} />
          <SectionCard title="Image pipelines" sectionKey="images" section={sections.images} automationRuns={automationRuns} />
          <SectionCard title="Pricing pipelines" sectionKey="pricing" section={sections.pricing} automationRuns={automationRuns} />
        </div>
      </div>
    </div>
  );
}

