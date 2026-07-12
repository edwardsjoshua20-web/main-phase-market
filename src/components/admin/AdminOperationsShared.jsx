import React from 'react';
import * as adminOperationsModel from '@/services/admin/adminOperationsModel';
import { Badge } from '@/components/ui/badge';

const statusTone = {
  ok: 'bg-green-100 text-green-700 border-green-200',
  degraded: 'bg-amber-100 text-amber-700 border-amber-200',
  stale: 'bg-orange-100 text-orange-700 border-orange-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  running: 'bg-blue-100 text-blue-700 border-blue-200',
  blocked: 'bg-amber-100 text-amber-700 border-amber-200'
};

export function StatusBadge({ status }) {
  const normalized = String(status || 'missing').toLowerCase();
  return (
    <Badge variant="outline" className={statusTone[normalized] || statusTone.missing}>
      {normalized}
    </Badge>
  );
}

export function SummaryValue({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export function DependencySummary({ job, automationRuns, controlStatus }) {
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

export function JobRunSummary({ run }) {
  if (!run) {
    return <p className="text-xs text-gray-500">No run history yet.</p>;
  }

  return (
    <div className="space-y-1 text-xs text-gray-600">
      <div className="flex items-center gap-2">
        <StatusBadge status={run.lastStatus || 'missing'} />
        <span>Duration: {adminOperationsModel.formatDuration(run.lastDurationMs)}</span>
      </div>
      <p>Last success: {adminOperationsModel.formatDate(run.lastSucceededAt)}</p>
      <p>Last failure: {adminOperationsModel.formatDate(run.lastFailedAt)}</p>
      {run.lastError ? <p className="text-red-600">Why: {run.lastError}</p> : null}
    </div>
  );
}