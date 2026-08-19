-- Main Phase Market: physical inventory durability, audit, backup, and safe restore.
--
-- Physical inventory is irreplaceable business data. Catalog, pricing, search,
-- and image outputs are generated/rebuildable; Card/Product app_entities are not.

create extension if not exists pgcrypto;

create table if not exists public.inventory_backup_runs (
  id uuid primary key default gen_random_uuid(),
  reason text not null default 'manual',
  status text not null default 'ok' check (status in ('ok', 'failed')),
  entity_count integer not null default 0,
  card_count integer not null default 0,
  product_count integer not null default 0,
  created_by text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_backup_items (
  backup_id uuid not null references public.inventory_backup_runs(id) on delete cascade,
  entity_name text not null check (entity_name in ('Card', 'Product')),
  entity_id text not null,
  created_date timestamptz,
  updated_date timestamptz,
  data jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  primary key (backup_id, entity_name, entity_id)
);

create index if not exists inventory_backup_runs_created_idx
  on public.inventory_backup_runs (created_at desc);

create index if not exists inventory_backup_items_entity_idx
  on public.inventory_backup_items (entity_name, entity_id);

create table if not exists public.inventory_mutation_audit (
  id uuid primary key default gen_random_uuid(),
  entity_name text not null check (entity_name in ('Card', 'Product')),
  entity_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_role text,
  actor_sub text,
  actor_email text,
  old_quantity integer,
  new_quantity integer,
  old_status text,
  new_status text,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists inventory_mutation_audit_entity_idx
  on public.inventory_mutation_audit (entity_name, entity_id, changed_at desc);

create index if not exists inventory_mutation_audit_changed_idx
  on public.inventory_mutation_audit (changed_at desc);

alter table public.inventory_backup_runs enable row level security;
alter table public.inventory_backup_items enable row level security;
alter table public.inventory_mutation_audit enable row level security;

drop policy if exists "service role manages inventory backup runs" on public.inventory_backup_runs;
create policy "service role manages inventory backup runs"
  on public.inventory_backup_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages inventory backup items" on public.inventory_backup_items;
create policy "service role manages inventory backup items"
  on public.inventory_backup_items
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages inventory mutation audit" on public.inventory_mutation_audit;
create policy "service role manages inventory mutation audit"
  on public.inventory_mutation_audit
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.inventory_audit_safe_integer(p_value text)
returns integer
language plpgsql
immutable
as $$
begin
  if p_value is null or trim(p_value) = '' then
    return null;
  end if;

  if trim(p_value) ~ '^-?\d+$' then
    return trim(p_value)::integer;
  end if;

  if trim(p_value) ~ '^-?\d+(\.\d+)?$' then
    return floor(trim(p_value)::numeric)::integer;
  end if;

  return null;
end;
$$;

create or replace function public.audit_inventory_app_entities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_entity_name text;
  v_entity_id text;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then old.data else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then new.data else null end;
  v_entity_name := coalesce(new.entity_name, old.entity_name);
  v_entity_id := coalesce(new.id, old.id);

  if v_entity_name not in ('Card', 'Product') then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  insert into public.inventory_mutation_audit (
    entity_name,
    entity_id,
    action,
    actor_role,
    actor_sub,
    actor_email,
    old_quantity,
    new_quantity,
    old_status,
    new_status,
    old_data,
    new_data
  )
  values (
    v_entity_name,
    v_entity_id,
    tg_op,
    nullif(auth.role(), ''),
    nullif(auth.uid()::text, ''),
    nullif(auth.jwt() ->> 'email', ''),
    public.inventory_audit_safe_integer(v_old ->> 'quantity'),
    public.inventory_audit_safe_integer(v_new ->> 'quantity'),
    nullif(v_old ->> 'status', ''),
    nullif(v_new ->> 'status', ''),
    v_old,
    v_new
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_inventory_app_entities on public.app_entities;
create trigger audit_inventory_app_entities
after insert or update or delete on public.app_entities
for each row
execute function public.audit_inventory_app_entities();

create or replace function public.create_inventory_backup(
  p_reason text default 'manual',
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backup_id uuid;
begin
  insert into public.inventory_backup_runs (reason, created_by, diagnostics)
  values (
    coalesce(nullif(trim(p_reason), ''), 'manual'),
    nullif(trim(coalesce(p_created_by, '')), ''),
    jsonb_build_object('source', 'create_inventory_backup')
  )
  returning id into v_backup_id;

  insert into public.inventory_backup_items (
    backup_id,
    entity_name,
    entity_id,
    created_date,
    updated_date,
    data
  )
  select
    v_backup_id,
    entity_name,
    id,
    created_date,
    updated_date,
    data
  from public.app_entities
  where entity_name in ('Card', 'Product')
  order by entity_name, id;

  update public.inventory_backup_runs
  set
    entity_count = (
      select count(*)::integer
      from public.inventory_backup_items
      where backup_id = v_backup_id
    ),
    card_count = (
      select count(*)::integer
      from public.inventory_backup_items
      where backup_id = v_backup_id and entity_name = 'Card'
    ),
    product_count = (
      select count(*)::integer
      from public.inventory_backup_items
      where backup_id = v_backup_id and entity_name = 'Product'
    ),
    diagnostics = jsonb_build_object(
      'source', 'create_inventory_backup',
      'inventoryEntityTypes', jsonb_build_array('Card', 'Product')
    )
  where id = v_backup_id;

  return v_backup_id;
end;
$$;

create or replace function public.restore_inventory_backup_items(
  p_backup_id uuid,
  p_entity_ids text[],
  p_reason text default 'manual-restore'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restored integer := 0;
begin
  if p_backup_id is null then
    raise exception 'backup_id is required';
  end if;

  if p_entity_ids is null or array_length(p_entity_ids, 1) is null then
    raise exception 'restore requires an explicit entity id allowlist';
  end if;

  insert into public.app_entities (entity_name, id, created_date, updated_date, data)
  select
    item.entity_name,
    item.entity_id,
    coalesce(item.created_date, timezone('utc', now())),
    timezone('utc', now()),
    item.data || jsonb_build_object(
      'updated_date', timezone('utc', now()),
      'inventory_restore_reason', coalesce(nullif(trim(p_reason), ''), 'manual-restore'),
      'inventory_restored_from_backup_id', p_backup_id::text
    )
  from public.inventory_backup_items item
  where item.backup_id = p_backup_id
    and item.entity_id = any(p_entity_ids)
  on conflict (entity_name, id) do update
    set updated_date = timezone('utc', now()),
        data = excluded.data;

  get diagnostics v_restored = row_count;

  return jsonb_build_object(
    'backupId', p_backup_id,
    'requestedEntityIds', p_entity_ids,
    'restored', v_restored,
    'reason', coalesce(nullif(trim(p_reason), ''), 'manual-restore')
  );
end;
$$;

grant execute on function public.create_inventory_backup(text, text) to service_role;
grant execute on function public.restore_inventory_backup_items(uuid, text[], text) to service_role;

insert into public.automation_jobs (job_id, label, cadence, owner, runner_pipeline, depends_on)
values
  ('inventory-backup', 'Physical inventory backup', 'daily', 'inventory', 'inventory-backup', '{}')
on conflict (job_id) do update set
  label = excluded.label,
  cadence = excluded.cadence,
  owner = excluded.owner,
  runner_pipeline = excluded.runner_pipeline,
  depends_on = excluded.depends_on,
  enabled = true,
  updated_at = now();
