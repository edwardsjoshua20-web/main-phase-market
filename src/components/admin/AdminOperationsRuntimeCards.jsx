import React, { useMemo } from 'react';
import * as adminOperationsModel from '@/services/admin/adminOperationsModel';
import { siteAutomationRegistry } from '@/services/automation/siteAutomationRegistry';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DependencySummary, StatusBadge, SummaryValue } from '@/components/admin/AdminOperationsShared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Play, RefreshCw, ShieldCheck, Terminal } from 'lucide-react';

export function AutomationHistoryCard({ automationRuns }) {
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
                const run = adminOperationsModel.getRunRecord(automationRuns, job.id);
                return (
                  <tr key={job.id}>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-medium text-gray-900">{job.label}</p>
                      <p className="mt-1 text-xs text-gray-500">{job.script}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 align-top">{job.owner}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 align-top">{job.cadence}</td>
                    <td className="px-4 py-3 text-sm align-top"><StatusBadge status={run?.lastStatus || 'missing'} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{adminOperationsModel.formatDate(run?.lastSucceededAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{adminOperationsModel.formatDate(run?.lastFailedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{adminOperationsModel.formatDuration(run?.lastDurationMs)}</td>
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

export function PipelineControlsCard({ automationRuns, controlStatus, onRunJob, startingJobId }) {
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
            <SummaryValue label="Last checked" value={adminOperationsModel.formatDate(controlStatus?.scheduler?.lastCheckedAt)} />
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
                      <p className="text-sm font-medium text-gray-900">{adminOperationsModel.getJobDetails(job.jobId)?.label || job.jobId}</p>
                      <p className="mt-1 text-xs text-gray-500">{job.reason}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 align-top">{job.cadence}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{adminOperationsModel.formatDate(job.lastRunAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 align-top">{adminOperationsModel.formatDate(job.nextRunAt)}</td>
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
            const run = adminOperationsModel.getRunRecord(automationRuns, job.id);
            const readiness = adminOperationsModel.getControlReadiness(run);
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
                  <SummaryValue label="Last success" value={adminOperationsModel.formatDate(run?.lastSucceededAt)} />
                  <SummaryValue label="Duration" value={adminOperationsModel.formatDuration(run?.lastDurationMs)} />
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
                        ? `Locked by run ${lock.runId || 'unknown'} started ${adminOperationsModel.formatDate(lock.startedAt)}.`
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