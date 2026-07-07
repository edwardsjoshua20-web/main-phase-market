import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { backend } from '@/services/backend';
import * as adminOperationsModel from '@/services/admin/adminOperationsModel';
import {
  getAutomationDependencySummary,
  siteAutomationRegistry
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

function DependencySummary({ job, automationRuns, controlStatus }) {
  const diagnostics = adminOperationsModel.getDependencyDiagnostics(job, automationRuns);
  const preflight = adminOperationsModel.getEffectivePreflight(job, automationRuns, controlStatus);

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
  const fallbackActivationContract = [
    {
      id: 'backend-host',
      label: 'Backend host',
      value: 'Render service running npm run ops:serve',
      proof: '/api/local/health returns ok'
    },
    {
      id: 'cloudflare-origin',
      label: 'Cloudflare Pages',
      value: 'VITE_API_ORIGIN=https://<render-service>.onrender.com',
      proof: 'Hosted Admin Operations can reach /api/local/admin/automation/control-status'
    },
    {
      id: 'backend-env',
      label: 'Backend env',
      value: 'ALLOW_REMOTE_CONNECTIONS=true, PUBLIC_APP_URL=https://mainphasemarket.net',
      proof: 'Remote bridge readiness check reports remote connections ok'
    },
    {
      id: 'admin-proof',
      label: 'Proof command',
      value: 'npm run ops:check -- --origin https://<render-service>.onrender.com --token <admin-token>',
      proof: 'health ok and automation controls available'
    }
  ];
  const activationContract = Array.isArray(bridge.activationContract) && bridge.activationContract.length > 0
    ? bridge.activationContract
    : fallbackActivationContract;

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
                  <div key={item.id || item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-700">{item.value}</p>
                    {item.proof ? (
                      <p className="mt-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-600">Proof:</span> {item.proof}
                      </p>
                    ) : null}
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

function DashboardAreaBoardCard({ areas }) {
  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2.5">
              <ListChecks className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">Operations area board</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                The named business surfaces behind the top-level status counters.
              </p>
            </div>
          </div>
          <StatusBadge status={areas.some((area) => area.status !== 'ok') ? 'degraded' : 'ok'} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-2">
          {areas.map((area) => (
            <div key={area.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{area.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">Owner: {area.owner}</p>
                </div>
                <StatusBadge status={area.status} />
              </div>
              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Evidence:</span> {area.evidence}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Next step:</span> {area.nextStep}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActionCenterCard({ systemHealth, sections, automationRuns, controlStatus }) {
  const items = useMemo(
    () => adminOperationsModel.buildActionItems(systemHealth, sections, automationRuns),
    [systemHealth, sections, automationRuns]
  );

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
  const summary = useMemo(() => adminOperationsModel.summarizeAutomationRuns(automationRuns), [automationRuns]);

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
    () => adminOperationsModel.buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus),
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
    () => adminOperationsModel.buildServiceLevelRows(automationRuns, controlStatus),
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
    () => adminOperationsModel.buildLaunchReadinessRows(sections, automationRuns, controlStatus),
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
  const rows = useMemo(() => adminOperationsModel.buildSourceGovernanceRows(sections), [sections]);
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
  const rows = useMemo(() => adminOperationsModel.buildControlPlaneRows(controlStatus), [controlStatus]);
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
  const summary = useMemo(() => adminOperationsModel.buildRunnerAuditSummary(controlStatus), [controlStatus]);
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
    () => adminOperationsModel.buildCapabilityConfidenceRows(sections, automationRuns, controlStatus),
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
  const rows = useMemo(() => adminOperationsModel.buildDataContractRows(automationRuns), [automationRuns]);

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
    () => adminOperationsModel.buildRecoveryPlaybooks(systemHealth, sections, automationRuns, controlStatus),
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
    () => adminOperationsModel.buildRecommendedRunOrder(automationRuns, controlStatus),
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
            const controlEntry = adminOperationsModel.getControlEntry(controlStatus, job.id);
            const lock = controlEntry?.lock || null;
            const preflight = adminOperationsModel.getEffectivePreflight(job, automationRuns, controlStatus);
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
  const jobs = (adminOperationsModel.sectionJobMap[sectionKey] || [])
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
                    <td className="px-4 py-3 text-sm text-gray-600">{adminOperationsModel.classifyEntryIssue(entry)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                      {Array.isArray(entry.diagnostics) && entry.diagnostics.length > 0
                        ? entry.diagnostics.join(' • ')
                        : 'No extra diagnostics recorded.'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 break-all max-w-xs">{adminOperationsModel.formatSourceSummary(entry.source)}</td>
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
  const automationSummary = useMemo(() => adminOperationsModel.summarizeAutomationRuns(automationRuns), [automationRuns]);
  const controlStatus = controlQuery.data || {
    available: false,
    mode: 'unknown',
    reason: controlQuery.isError
      ? (controlQuery.error?.message || 'Automation control backend is not reachable.')
      : 'Checking automation control backend...'
  };
  const startingJobId = runJobMutation.isPending ? runJobMutation.variables : null;
  const serviceLevelRows = useMemo(
    () => adminOperationsModel.buildServiceLevelRows(automationRuns, controlStatus),
    [automationRuns, controlStatus]
  );
  const launchReadiness = useMemo(
    () => adminOperationsModel.buildLaunchReadinessRows(sections, automationRuns, controlStatus),
    [sections, automationRuns, controlStatus]
  );
  const sourceGovernanceRows = useMemo(() => adminOperationsModel.buildSourceGovernanceRows(sections), [sections]);
  const dataContractRows = useMemo(() => adminOperationsModel.buildDataContractRows(automationRuns), [automationRuns]);
  const capabilityConfidenceRows = useMemo(
    () => adminOperationsModel.buildCapabilityConfidenceRows(sections, automationRuns, controlStatus),
    [sections, automationRuns, controlStatus]
  );
  const operationIncidents = useMemo(
    () => adminOperationsModel.buildOperationIncidents(systemHealth, sections, automationRuns, controlStatus),
    [systemHealth, sections, automationRuns, controlStatus]
  );
  const controlPlaneRows = useMemo(() => adminOperationsModel.buildControlPlaneRows(controlStatus), [controlStatus]);
  const runnerAuditSummary = useMemo(() => adminOperationsModel.buildRunnerAuditSummary(controlStatus), [controlStatus]);
  const recoveryPlaybook = useMemo(
    () => adminOperationsModel.buildRecoveryPlaybooks(systemHealth, sections, automationRuns, controlStatus),
    [systemHealth, sections, automationRuns, controlStatus]
  );
  const displayLastCheckedAt = useMemo(() => {
    const timestamps = [healthQuery.dataUpdatedAt, controlQuery.dataUpdatedAt, lastManualRefreshAt]
      .filter((value) => typeof value === 'number' && Number.isFinite(value));

    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [controlQuery.dataUpdatedAt, healthQuery.dataUpdatedAt, lastManualRefreshAt]);

  const dashboardAreas = useMemo(() => {
    return adminOperationsModel.buildDashboardAreas({
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
  }, [
    sections,
    automationSummary,
    operationIncidents,
    serviceLevelRows,
    launchReadiness,
    sourceGovernanceRows,
    dataContractRows,
    controlStatus,
    controlPlaneRows,
    runnerAuditSummary.status,
    capabilityConfidenceRows,
    recoveryPlaybook
  ]);

  const summary = useMemo(() => adminOperationsModel.buildDashboardSummary(dashboardAreas), [dashboardAreas]);

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

        <DashboardAreaBoardCard areas={dashboardAreas} />

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
              <StatusBadge status={summary.automationAreaStatus} />
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

