-- Main Phase Market: durable automation control plane.
--
-- Supabase owns the schedule, locks, audit history, and operational truth.
-- A short-lived Edge Function dispatches the heavy Node pipeline to the
-- configured runner, rather than pretending the large catalog jobs can run
-- inside Postgres or a browser request.

create extension if not exists pgcrypto;

create table if not exists public.automation_jobs (
  job_id text primary key,
  label text not null,
  cadence text not null,
  owner text not null,
  runner_pipeline text not null,
  depends_on text[] not null default '{}'::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.automation_jobs(job_id) on delete cascade,
  trigger_source text not null check (trigger_source in ('supabase-cron', 'admin', 'github-actions', 'recovery')),
  status text not null check (status in ('queued', 'dispatching', 'running', 'ok', 'failed', 'cancelled')),
  runner_reference text,
  requested_by text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  error_message text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_runs_job_created_idx
  on public.automation_runs (job_id, created_at desc);

create index if not exists automation_runs_status_created_idx
  on public.automation_runs (status, created_at desc);

-- One active run per job prevents scheduler and manual requests from racing.
create unique index if not exists automation_runs_one_active_job_idx
  on public.automation_runs (job_id)
  where status in ('queued', 'dispatching', 'running');

drop trigger if exists automation_jobs_set_updated_at on public.automation_jobs;
create trigger automation_jobs_set_updated_at
before update on public.automation_jobs
for each row execute function public.set_updated_at();

drop trigger if exists automation_runs_set_updated_at on public.automation_runs;
create trigger automation_runs_set_updated_at
before update on public.automation_runs
for each row execute function public.set_updated_at();

alter table public.automation_jobs enable row level security;
alter table public.automation_runs enable row level security;

-- The browser never writes automation state directly. Edge Functions use the
-- service role and return the safe, admin-focused view to the application.
drop policy if exists "service role manages automation jobs" on public.automation_jobs;
create policy "service role manages automation jobs"
  on public.automation_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages automation runs" on public.automation_runs;
create policy "service role manages automation runs"
  on public.automation_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.automation_jobs (job_id, label, cadence, owner, runner_pipeline, depends_on)
values
  ('card-backfill-refresh', 'Card backfill refresh', 'daily', 'catalog', 'cards', '{}'),
  ('homepage-upcoming-releases', 'Homepage upcoming releases refresh', 'daily', 'homepage', 'homepage', '{}'),
  ('catalog-refresh', 'Catalog refresh', 'every-2-days', 'catalog', 'catalog', '{card-backfill-refresh}'),
  ('image-repair-sync', 'Image repair and sync', 'daily', 'images', 'images', '{catalog-refresh}'),
  ('pricing-refresh', 'Pricing refresh', 'daily-morning', 'pricing', 'pricing', '{catalog-refresh}'),
  ('system-health-report', 'System health report', 'hourly', 'operations', 'health', '{}')
on conflict (job_id) do update set
  label = excluded.label,
  cadence = excluded.cadence,
  owner = excluded.owner,
  runner_pipeline = excluded.runner_pipeline,
  depends_on = excluded.depends_on,
  updated_at = now();

create or replace view public.automation_latest_runs as
select distinct on (job_id)
  job_id,
  id as run_id,
  status,
  trigger_source,
  runner_reference,
  started_at,
  finished_at,
  duration_ms,
  error_message,
  diagnostics,
  created_at,
  updated_at
from public.automation_runs
order by job_id, created_at desc;
