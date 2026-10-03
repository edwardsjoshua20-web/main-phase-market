create table if not exists public.instajudge_error_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'reviewing', 'confirmed_bug', 'expected_behavior', 'fixed', 'closed')),
  game text not null,
  session_id text,
  ruling_id text,
  judge_id text,
  judge_name text,
  route text,
  user_message text not null,
  judge_answer text not null,
  explanation text,
  user_note text,
  engine_operation text,
  engine_verdict text,
  result_class text,
  ai_involved boolean not null default false,
  app_version text,
  scenario_fingerprint text not null,
  card_names text[] not null default '{}',
  state_snapshot jsonb,
  diagnostic_payload jsonb not null default '{}'::jsonb,
  admin_notes text,
  status_history jsonb not null default '[]'::jsonb,
  resolved_at timestamptz
);

alter table public.instajudge_error_reports enable row level security;

create index if not exists instajudge_error_reports_created_at_idx
  on public.instajudge_error_reports (created_at desc);
create index if not exists instajudge_error_reports_status_idx
  on public.instajudge_error_reports (status, created_at desc);
create index if not exists instajudge_error_reports_fingerprint_idx
  on public.instajudge_error_reports (scenario_fingerprint, created_at desc);
create index if not exists instajudge_error_reports_operation_idx
  on public.instajudge_error_reports (engine_operation, created_at desc);
create index if not exists instajudge_error_reports_judge_idx
  on public.instajudge_error_reports (judge_id, created_at desc);
create index if not exists instajudge_error_reports_ai_idx
  on public.instajudge_error_reports (ai_involved, created_at desc);

create or replace function public.set_instajudge_error_report_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_instajudge_error_report_updated_at on public.instajudge_error_reports;
create trigger set_instajudge_error_report_updated_at
before update on public.instajudge_error_reports
for each row execute function public.set_instajudge_error_report_updated_at();

revoke all on table public.instajudge_error_reports from anon, authenticated;
grant all on table public.instajudge_error_reports to service_role;
