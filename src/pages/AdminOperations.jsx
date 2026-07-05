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
                  {controlsAvailable ? 'Manual pipeline runner is connected.' : 'Manual runs require the local operations backend.'}
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

  const summary = useMemo(() => {
    const sectionStatuses = Object.values(sections).map((section) => String(section?.status || section?.overallStatus || 'missing').toLowerCase());
    const automationAreaStatus = automationSummary.failed > 0
      ? 'degraded'
      : automationSummary.running > 0
        ? 'degraded'
        : automationSummary.missing > 0
          ? 'missing'
          : 'ok';
    const combinedStatuses = [...sectionStatuses, automationAreaStatus];
    return {
      ok: combinedStatuses.filter((status) => status === 'ok').length,
      degraded: combinedStatuses.filter((status) => status === 'degraded').length,
      stale: combinedStatuses.filter((status) => status === 'stale').length,
      missing: combinedStatuses.filter((status) => status === 'missing').length,
      topStatus: deriveAreaStatus(sectionStatuses, automationSummary),
      automationAreaStatus
    };
  }, [sections, automationSummary]);

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
                Last checked: <span className="font-medium text-gray-800">{formatDate(healthQuery.dataUpdatedAt)}</span>
              </div>
            </div>
            <Button type="button" onClick={() => healthQuery.refetch({ cancelRefetch: false })} className="bg-blue-600 hover:bg-blue-700 text-white">
              <RefreshCw className={`mr-2 h-4 w-4 ${healthQuery.isFetching ? 'animate-spin' : ''}`} />
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

        <AutomationHistoryCard automationRuns={automationRuns} />
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

