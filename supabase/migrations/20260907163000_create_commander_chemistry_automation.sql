-- Deck Chemistry durable state and existing automation control-plane job.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'main-phase-market-automation',
  'main-phase-market-automation',
  false,
  268435456,
  array['application/vnd.sqlite3', 'application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.automation_jobs (job_id, label, cadence, owner, runner_pipeline, depends_on)
values (
  'commander-chemistry-refresh',
  'Deck Chemistry refresh',
  'daily',
  'commander',
  'commander-chemistry',
  '{}'
)
on conflict (job_id) do update set
  label = excluded.label,
  cadence = excluded.cadence,
  owner = excluded.owner,
  runner_pipeline = excluded.runner_pipeline,
  depends_on = excluded.depends_on,
  enabled = true,
  updated_at = now();
