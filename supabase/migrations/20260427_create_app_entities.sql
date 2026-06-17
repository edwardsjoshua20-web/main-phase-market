create table if not exists public.app_entities (
  entity_name text not null,
  id text not null,
  created_date timestamptz not null default timezone('utc', now()),
  updated_date timestamptz not null default timezone('utc', now()),
  data jsonb not null default '{}'::jsonb,
  primary key (entity_name, id)
);

create index if not exists idx_app_entities_entity_created
  on public.app_entities (entity_name, created_date desc);

alter table public.app_entities enable row level security;

drop policy if exists "service role manages app_entities" on public.app_entities;
create policy "service role manages app_entities"
  on public.app_entities
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists set_app_entities_updated_at on public.app_entities;
create trigger set_app_entities_updated_at
before update on public.app_entities
for each row
execute function public.set_updated_at();
