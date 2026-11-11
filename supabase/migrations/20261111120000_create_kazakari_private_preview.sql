create table if not exists public.kazakari_preview_snapshots (
  id text primary key,
  payload jsonb not null,
  generated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.kazakari_watch_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  retailer text,
  category text,
  store_id text,
  product_id text,
  minimum_discount numeric not null default 50 check (minimum_discount between 0 and 100),
  newly_discounted boolean not null default true,
  price_drops boolean not null default true,
  end_of_clearance boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists kazakari_watch_rules_user_idx
  on public.kazakari_watch_rules (user_id, created_at);

alter table public.kazakari_preview_snapshots enable row level security;
alter table public.kazakari_watch_rules enable row level security;

drop policy if exists "service role manages kazakari snapshots" on public.kazakari_preview_snapshots;
create policy "service role manages kazakari snapshots"
  on public.kazakari_preview_snapshots for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages kazakari watches" on public.kazakari_watch_rules;
create policy "service role manages kazakari watches"
  on public.kazakari_watch_rules for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant all on table public.kazakari_preview_snapshots to service_role;
grant all on table public.kazakari_watch_rules to service_role;
revoke all on table public.kazakari_preview_snapshots from anon, authenticated;
revoke all on table public.kazakari_watch_rules from anon, authenticated;
