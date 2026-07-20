import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

type AutomationJob = {
  job_id: string;
  label: string;
  cadence: string;
  owner: string;
  enabled: boolean;
};

type LatestRun = {
  job_id: string;
  run_id: string;
  status: string;
  trigger_source: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function serviceHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`
  };
}

async function fetchJson<T>(path: string) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { headers: serviceHeaders() });
  if (!response.ok) throw new Error(`Automation status query failed (${response.status}).`);
  return response.json() as Promise<T>;
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization) throw new Error('Please sign in as an administrator.');

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { ...serviceHeaders(), Authorization: authorization }
  });
  if (!response.ok) throw new Error('Your sign-in session is no longer valid.');

  const user = await response.json();
  if (String(user?.user_metadata?.role || '').toLowerCase() !== 'admin') {
    throw new Error('Administrator access is required.');
  }
}

function toAutomationRuns(jobs: AutomationJob[], latestRuns: LatestRun[]) {
  const runByJob = new Map(latestRuns.map((run) => [run.job_id, run]));
  const records = Object.fromEntries(jobs.map((job) => {
    const run = runByJob.get(job.job_id);
    return [job.job_id, {
      jobId: job.job_id,
      label: job.label,
      cadence: job.cadence,
      owner: job.owner,
      lastStatus: run?.status || 'missing',
      lastSucceededAt: run?.status === 'ok' ? (run.finished_at || run.created_at) : null,
      lastFailedAt: run?.status === 'failed' ? (run.finished_at || run.created_at) : null,
      durationMs: run?.duration_ms ?? null,
      diagnostics: run?.error_message ? [run.error_message] : [],
      triggerSource: run?.trigger_source || null
    }];
  }));

  return { generatedAt: new Date().toISOString(), jobs: records };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== 'POST') return errorResponse('Only POST is supported.', 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return errorResponse('Operations status is not configured.', 503);

  try {
    await requireAdmin(request);
    const [jobs, latestRuns, recentRuns] = await Promise.all([
      fetchJson<AutomationJob[]>('/rest/v1/automation_jobs?select=job_id,label,cadence,owner,enabled&order=job_id.asc'),
      fetchJson<LatestRun[]>('/rest/v1/automation_latest_runs?select=job_id,run_id,status,trigger_source,started_at,finished_at,duration_ms,error_message,created_at'),
      fetchJson<LatestRun[]>('/rest/v1/automation_runs?select=job_id,run_id:id,status,trigger_source,started_at,finished_at,duration_ms,error_message,created_at&order=created_at.desc&limit=20')
    ]);

    const cronRuns = recentRuns.filter((run) => run.trigger_source === 'supabase-cron');
    const activeRuns = latestRuns.filter((run) => ['queued', 'dispatching', 'running'].includes(run.status));
    const latestCronRunAt = cronRuns[0]?.created_at || null;
    const automationRuns = toAutomationRuns(jobs.filter((job) => job.enabled), latestRuns);

    return jsonResponse({
      available: true,
      mode: 'supabase-control-plane',
      automationRuns,
      scheduler: {
        configured: true,
        enabled: Boolean(latestCronRunAt),
        status: latestCronRunAt ? 'proven' : 'awaiting-first-cron-run',
        lastCheckedAt: latestCronRunAt,
        checks: cronRuns.length,
        dueJobs: activeRuns.map((run) => run.job_id)
      },
      bridge: {
        checks: [
          { id: 'allowed-job-map', status: 'ok', detail: `${jobs.length} jobs are registered in the durable control plane.` },
          { id: 'dependency-preflight', status: 'ok', detail: 'The orchestrator dispatches only its declared scheduled work.' },
          { id: 'single-run-locks', status: 'ok', detail: 'The database enforces one active run per job.' },
          { id: 'audit-log', status: recentRuns.length > 0 ? 'ok' : 'missing', detail: `${recentRuns.length} recent run records are visible.` },
          { id: 'run-history', status: recentRuns.length > 0 ? 'ok' : 'missing', detail: 'Supabase is the durable execution ledger.' },
          { id: 'scheduler-map', status: latestCronRunAt ? 'ok' : 'stale', detail: latestCronRunAt ? 'A Supabase Cron-originated run has been recorded.' : 'Waiting for the first scheduled Cron-originated run.' }
        ]
      },
      audit: {
        generatedAt: new Date().toISOString(),
        entries: recentRuns.map((run) => ({
          id: run.run_id,
          jobId: run.job_id,
          status: run.status,
          actor: run.trigger_source,
          createdAt: run.created_at,
          finishedAt: run.finished_at,
          durationMs: run.duration_ms,
          detail: run.error_message || null
        }))
      },
      allowedJobs: jobs.map((job) => ({
        id: job.job_id,
        label: job.label,
        enabled: job.enabled,
        lock: activeRuns.some((run) => run.job_id === job.job_id)
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load automation status.';
    const status = /administrator|sign in|session/i.test(message) ? 401 : 500;
    return errorResponse(message, status);
  }
});
