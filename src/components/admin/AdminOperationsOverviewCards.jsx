import React, { useMemo } from 'react';
import * as adminOperationsModel from '@/services/admin/adminOperationsModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Activity, Image as ImageIcon, ListChecks, CheckCircle2, Lock, ShieldCheck, Wrench, HardDriveDownload } from 'lucide-react';
import { siteAutomationRegistry } from '@/services/automation/siteAutomationRegistry';
import { DependencySummary, JobRunSummary, StatusBadge, SummaryValue } from '@/components/admin/AdminOperationsShared';

const sectionIcons = {
  homepage: Activity,
  catalogs: Database,
  images: ImageIcon,
  pricing: HardDriveDownload,
  readiness: CheckCircle2
};

export function BridgeReadinessCard({ controlStatus }) {
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

export function DashboardAreaBoardCard({ areas }) {
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

export function ActionCenterCard({ systemHealth, sections, automationRuns, controlStatus }) {
  const items = useMemo(
    () => adminOperationsModel.buildActionItems(systemHealth, sections, automationRuns, controlStatus),
    [systemHealth, sections, automationRuns, controlStatus]
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

export function ReadinessCard({ section }) {
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

export function SectionCard({ title, sectionKey, section, automationRuns }) {
  const Icon = sectionIcons[sectionKey] || Wrench;
  const entries = Array.isArray(section?.entries) ? section.entries : [];
  const topLevelStatus = section?.status || section?.overallStatus || 'missing';
  const jobs = (adminOperationsModel.sectionJobMap[sectionKey] || [])
    .map((jobId) => {
      const job = adminOperationsModel.getJobDetails(jobId);
      if (!job) return null;
      return {
        ...job,
        run: adminOperationsModel.getRunRecord(automationRuns, jobId)
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
            <SummaryValue label="Updated" value={adminOperationsModel.formatDate(section.file.modifiedAt)} />
            <SummaryValue label="Freshness" value={adminOperationsModel.formatHours(section.modifiedHoursAgo)} />
            {'releaseCount' in section ? (
              <SummaryValue label="Items" value={section.releaseCount} />
            ) : null}
          </div>
        )}

        {section?.snapshot && (
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryValue label="Snapshot status" value={section.snapshot.status || '—'} />
            <SummaryValue label="Updated" value={adminOperationsModel.formatDate(section.snapshot.file?.modifiedAt)} />
            <SummaryValue label="Freshness" value={adminOperationsModel.formatHours(section.snapshot.modifiedHoursAgo)} />
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
                  <SummaryValue label="Last success" value={adminOperationsModel.formatDate(job.run?.lastSucceededAt)} />
                  <SummaryValue label="Last failure" value={adminOperationsModel.formatDate(job.run?.lastFailedAt)} />
                  <SummaryValue label="Duration" value={adminOperationsModel.formatDuration(job.run?.lastDurationMs)} />
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
                    <td className="px-4 py-3 text-sm text-gray-600">{adminOperationsModel.formatDate(entry.file?.modifiedAt || entry.cards?.file?.modifiedAt || entry.sets?.file?.modifiedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{adminOperationsModel.formatHours(entry.modifiedHoursAgo)}</td>
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
