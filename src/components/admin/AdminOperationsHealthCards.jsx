import React, { useMemo } from 'react';
import * as adminOperationsModel from '@/services/admin/adminOperationsModel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, ListChecks, ShieldCheck, Terminal, Wrench } from 'lucide-react';
import { StatusBadge, SummaryValue } from '@/components/admin/AdminOperationsShared';

export function OperationsIncidentCard({ systemHealth, sections, automationRuns, controlStatus }) {
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

export function ServiceLevelCard({ automationRuns, controlStatus }) {
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
          <SummaryValue label="Next due at" value={adminOperationsModel.formatDate(nextDue?.nextDueAt)} />
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
                    <p className="mt-1 text-xs text-gray-500">{row.owner} • {row.script}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 align-top">{row.cadence} / {row.targetHours}h</td>
                  <td className="px-4 py-3 text-sm text-gray-700 align-top">
                    {row.freshnessHours == null ? 'No successful run yet' : adminOperationsModel.formatHours(row.freshnessHours)}
                    {row.overdueHours > 0 ? (
                      <p className="mt-1 text-xs font-medium text-orange-700">Over by {adminOperationsModel.formatHours(row.overdueHours)}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 align-top">{adminOperationsModel.formatDate(row.nextDueAt)}</td>
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

export function LaunchReadinessCard({ sections, automationRuns, controlStatus }) {
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

export function SourceGovernanceCard({ sections }) {
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

export function ControlPlaneCard({ controlStatus }) {
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
          <SummaryValue label="Healthy controls" value={healthy} />
          <SummaryValue label="Watching" value={watching} />
          <SummaryValue label="Blocked" value={blocked} />
          <SummaryValue label="Runner mode" value={controlStatus?.mode || 'unknown'} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{row.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">Layer: {row.layer}</p>
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

export function RunnerAuditTimelineCard({ controlStatus }) {
  const summary = useMemo(() => adminOperationsModel.buildRunnerAuditSummary(controlStatus), [controlStatus]);

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
                Evidence that the automation runner is producing a visible execution trail for hosted admin operations.
              </p>
            </div>
          </div>
          <StatusBadge status={summary.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryValue label="Audit rows" value={summary.totalRuns} />
          <SummaryValue label="Successful" value={summary.succeeded} />
          <SummaryValue label="Failed" value={summary.failed} />
          <SummaryValue label="Running" value={summary.running} />
        </div>

        {summary.entries.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="font-semibold text-amber-900">No runner audit history captured yet.</p>
            <p className="mt-2 text-sm text-amber-800">
              The control panel is not yet producing a visible execution trail from the hosted admin perspective.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {summary.entries.map((entry) => {
              const detail = Array.isArray(entry?.details) ? entry.details.join(' \u2022 ') : entry?.detail;
              return (
                <div key={entry.id || `${entry.runnerJob}-${entry.runId || entry.startedAt}`} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{entry.label || entry.runnerJob || 'Runner event'}</p>
                        <StatusBadge status={entry.status} />
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-medium text-gray-800">Started:</span> {adminOperationsModel.formatDate(entry.startedAt)}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-medium text-gray-800">Finished:</span> {adminOperationsModel.formatDate(entry.finishedAt)}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-medium text-gray-800">Duration:</span> {adminOperationsModel.formatDuration(entry.durationMs)}
                      </p>
                      {detail ? (
                        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
                          <span className="font-medium text-gray-800">Details:</span> {detail}
                        </p>
                      ) : null}
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

export function CapabilityConfidenceCard({ sections, automationRuns, controlStatus }) {
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

export function DataContractsCard({ automationRuns }) {
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

export function RecoveryPlaybookCard({ systemHealth, sections, automationRuns, controlStatus }) {
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
