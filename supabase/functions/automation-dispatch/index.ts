import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

const ALLOWED_JOBS = new Set([
  'card-backfill-refresh',
  'homepage-upcoming-releases',
  'catalog-refresh',
  'image-repair-sync',
  'pricing-refresh',
  'system-health-report'
]);
const ALLOWED_TRIGGER_SOURCES = new Set([
  'supabase-cron',
  'admin',
  'github-actions',
  'recovery'
]);

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function isSharedSecretValid(request: Request) {
  const expected = Deno.env.get('MPM_AUTOMATION_SHARED_SECRET')?.trim();
  const received = request.headers.get('x-mpm-automation-secret')?.trim();
  return Boolean(expected && received && expected === received);
}

function isTerminalStatus(status: string) {
  return ['ok', 'failed', 'cancelled'].includes(status);
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (!isSharedSecretValid(request)) {
    return errorResponse('Automation dispatcher is not authorized.', 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'dispatch').trim().toLowerCase();
    const jobId = String(body.jobId || '').trim();
    const source = String(body.triggerSource || 'supabase-cron').trim();
    const supabase = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    );

    if (action === 'status') {
      const { data, error } = await supabase
        .from('automation_latest_runs')
        .select('*')
        .order('job_id');
      if (error) throw error;
      return jsonResponse({ ok: true, runs: data || [] });
    }

    if (!ALLOWED_JOBS.has(jobId)) {
      return errorResponse('Unknown or disallowed automation job.', 400);
    }

    if (action === 'complete') {
      const runId = String(body.runId || '').trim();
      const status = String(body.status || '').trim().toLowerCase();
      if (!runId || !isTerminalStatus(status)) {
        return errorResponse('A runId and terminal status are required for completion.', 400);
      }

      const startedAt = String(body.startedAt || '').trim();
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Number(body.durationMs || 0));
      const { error } = await supabase
        .from('automation_runs')
        .update({
          status,
          started_at: startedAt || null,
          finished_at: finishedAt,
          duration_ms: durationMs || null,
          error_message: status === 'failed' ? String(body.error || 'Automation run failed.') : null,
          diagnostics: body.diagnostics && typeof body.diagnostics === 'object' ? body.diagnostics : {}
        })
        .eq('id', runId)
        .eq('job_id', jobId);
      if (error) throw error;
      return jsonResponse({ ok: true, runId, status });
    }

    if (action !== 'dispatch') {
      return errorResponse('Unsupported automation action.', 400);
    }

    if (!ALLOWED_TRIGGER_SOURCES.has(source)) {
      return errorResponse('Unsupported automation trigger source.', 400);
    }

    const { data: job, error: jobError } = await supabase
      .from('automation_jobs')
      .select('job_id, runner_pipeline, enabled')
      .eq('job_id', jobId)
      .single();
    if (jobError) throw jobError;
    if (!job?.enabled) return errorResponse('This automation job is disabled.', 409);

    const { data: run, error: runError } = await supabase
      .from('automation_runs')
      .insert({ job_id: jobId, trigger_source: source, status: 'dispatching' })
      .select('id')
      .single();
    if (runError) {
      if (String(runError.code || '') === '23505') {
        return jsonResponse({ ok: false, reason: 'job-already-active' }, 409);
      }
      throw runError;
    }

    const repository = getRequiredEnv('GITHUB_AUTOMATION_REPOSITORY');
    const workflow = Deno.env.get('GITHUB_AUTOMATION_WORKFLOW')?.trim() || 'site-automation.yml';
    const token = getRequiredEnv('GITHUB_AUTOMATION_TOKEN');
    const dispatchResponse = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          job_id: jobId,
          pipeline: job.runner_pipeline,
          run_id: run.id,
          trigger_source: source
        }
      })
    });

    if (!dispatchResponse.ok) {
      const detail = await dispatchResponse.text();
      await supabase.from('automation_runs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: `GitHub workflow dispatch failed (${dispatchResponse.status}): ${detail.slice(0, 500)}`
      }).eq('id', run.id);
      return errorResponse('The runner workflow could not be dispatched.', 502);
    }

    const { error: updateError } = await supabase
      .from('automation_runs')
      .update({ status: 'queued', runner_reference: `github-actions:${job.runner_pipeline}` })
      .eq('id', run.id);
    if (updateError) throw updateError;

    return jsonResponse({ ok: true, runId: run.id, jobId, pipeline: job.runner_pipeline }, 202);
  } catch (error) {
    console.error('automation-dispatch error:', error);
    return errorResponse(error);
  }
});
