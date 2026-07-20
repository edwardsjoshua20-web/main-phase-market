import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

const DISPATCH_URL_SUFFIX = '/functions/v1/automation-dispatch';

type PlannedJob = {
  jobId: string;
  reason: string;
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function configuredSecretKeys() {
  // Supabase's scheduled Edge Function request uses a project API key.  Accept
  // either of the platform-provided key registries so the cron job can use the
  // non-sensitive publishable key instead of a service-role credential.
  return ['SUPABASE_SECRET_KEYS', 'SUPABASE_PUBLISHABLE_KEYS'].flatMap((name) => {
    const encoded = Deno.env.get(name)?.trim();
    if (!encoded) return [];

    try {
      const keys = JSON.parse(encoded);
      return Object.values(keys).filter((value): value is string => typeof value === 'string' && value.length > 0);
    } catch {
      return [];
    }
  });
}

function isAuthorized(request: Request) {
  const sharedSecret = Deno.env.get('MPM_AUTOMATION_SHARED_SECRET')?.trim();
  const suppliedSharedSecret = request.headers.get('x-mpm-automation-secret')?.trim();
  if (sharedSecret && suppliedSharedSecret === sharedSecret) return true;

  const suppliedKey = request.headers.get('apikey')?.trim()
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return Boolean(suppliedKey && configuredSecretKeys().includes(suppliedKey));
}

function isEveryOtherUtcDay(now: Date) {
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor(utcMidnight / 86_400_000) % 2 === 0;
}

function buildDueJobs(now: Date): PlannedJob[] {
  const hour = now.getUTCHours();
  const jobs: PlannedJob[] = [{ jobId: 'system-health-report', reason: 'hourly health report' }];

  // These are deliberately separated so dependency-heavy refreshes do not contend for the same runner.
  if (hour === 13) {
    jobs.push(
      { jobId: 'homepage-upcoming-releases', reason: 'daily release feed refresh' },
      { jobId: 'card-backfill-refresh', reason: 'daily raw card refresh' }
    );
  }
  if (hour === 15 && isEveryOtherUtcDay(now)) {
    jobs.push({ jobId: 'catalog-refresh', reason: 'every-other-day catalog normalization' });
  }
  if (hour === 18) {
    jobs.push({ jobId: 'image-repair-sync', reason: 'daily image repair window' });
  }
  if (hour === 19) {
    jobs.push({ jobId: 'pricing-refresh', reason: 'daily pricing refresh window' });
  }

  return jobs;
}

async function dispatchJob(job: PlannedJob) {
  const response = await fetch(`${getRequiredEnv('SUPABASE_URL')}${DISPATCH_URL_SUFFIX}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mpm-automation-secret': getRequiredEnv('MPM_AUTOMATION_SHARED_SECRET')
    },
    body: JSON.stringify({
      action: 'dispatch',
      jobId: job.jobId,
      triggerSource: 'supabase-cron'
    })
  });
  const payload = await response.json().catch(() => ({}));

  return {
    ...job,
    status: response.ok ? 'dispatched' : 'not-dispatched',
    httpStatus: response.status,
    runId: payload?.runId || null,
    detail: payload?.error || payload?.reason || null
  };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (!isAuthorized(request)) {
    return errorResponse('Automation orchestrator is not authorized.', 401);
  }

  if (request.method !== 'POST') {
    return errorResponse('Only POST is supported.', 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requestedAt = typeof body?.requestedAt === 'string' ? new Date(body.requestedAt) : new Date();
    const now = Number.isNaN(requestedAt.getTime()) ? new Date() : requestedAt;
    const dueJobs = buildDueJobs(now);
    const results = [];

    for (const job of dueJobs) {
      results.push(await dispatchJob(job));
    }

    return jsonResponse({
      ok: results.every((result) => result.status === 'dispatched' || result.httpStatus === 409),
      evaluatedAt: now.toISOString(),
      results
    });
  } catch (error) {
    console.error('automation-orchestrator error:', error);
    return errorResponse(error);
  }
});
