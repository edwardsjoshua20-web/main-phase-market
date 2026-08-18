create table if not exists public.checkout_finalizations (
  idempotency_key text primary key,
  status text not null default 'processing' check (status in ('processing', 'finalized')),
  order_entity_id text,
  created_date timestamptz not null default timezone('utc', now()),
  updated_date timestamptz not null default timezone('utc', now()),
  finalized_at timestamptz,
  error_message text
);

create index if not exists idx_checkout_finalizations_order_entity
  on public.checkout_finalizations (order_entity_id)
  where order_entity_id is not null;

alter table public.checkout_finalizations enable row level security;

drop policy if exists "service role manages checkout finalizations" on public.checkout_finalizations;
create policy "service role manages checkout finalizations"
  on public.checkout_finalizations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.checkout_jsonb_int(value jsonb, fallback integer default 0)
returns integer
language sql
immutable
as $$
  select case
    when value is null then fallback
    when jsonb_typeof(value) = 'number' then greatest(0, floor((value #>> '{}')::numeric)::integer)
    when jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^-?\d+(\.\d+)?$' then greatest(0, floor((value #>> '{}')::numeric)::integer)
    else fallback
  end;
$$;

create or replace function public.finalize_checkout_order_atomic(
  p_idempotency_key text,
  p_order_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_now timestamptz := timezone('utc', now());
  v_claim public.checkout_finalizations%rowtype;
  v_order_id text;
  v_order_payload jsonb;
  v_existing_order jsonb;
  v_item jsonb;
  v_item_id text;
  v_requested_quantity integer;
  v_inventory_entity text;
  v_inventory_id text;
  v_inventory_data jsonb;
  v_current_quantity integer;
  v_next_quantity integer;
begin
  if v_key = '' then
    raise exception 'idempotency key is required';
  end if;

  if p_order_payload is null or jsonb_typeof(p_order_payload) <> 'object' then
    raise exception 'order payload object is required';
  end if;

  insert into public.checkout_finalizations (idempotency_key, status, created_date, updated_date)
  values (v_key, 'processing', v_now, v_now)
  on conflict (idempotency_key) do nothing;

  select *
    into v_claim
    from public.checkout_finalizations
   where idempotency_key = v_key
   for update;

  if not found then
    raise exception 'failed to claim checkout finalization for %', v_key;
  end if;

  if v_claim.status = 'finalized' then
    select data
      into v_existing_order
      from public.app_entities
     where entity_name = 'Order'
       and id = v_claim.order_entity_id
     limit 1;

    if v_existing_order is null then
      raise exception 'checkout finalization % points to missing order %', v_key, v_claim.order_entity_id;
    end if;

    return jsonb_build_object(
      'order', v_existing_order,
      'already_finalized', true
    );
  end if;

  v_order_id := coalesce(nullif(p_order_payload->>'id', ''), 'stripe_session:' || v_key);
  v_order_payload := p_order_payload || jsonb_build_object(
    'id', v_order_id,
    'stripe_session_id', v_key,
    'created_date', coalesce(nullif(p_order_payload->>'created_date', ''), v_now::text),
    'updated_date', v_now::text
  );

  insert into public.app_entities (entity_name, id, created_date, updated_date, data)
  values ('Order', v_order_id, v_now, v_now, v_order_payload);

  for v_item in
    select value from jsonb_array_elements(coalesce(v_order_payload->'items', '[]'::jsonb))
  loop
    v_item_id := trim(coalesce(v_item->>'card_id', ''));
    if v_item_id = '' then
      continue;
    end if;

    v_requested_quantity := greatest(1, public.checkout_jsonb_int(v_item->'quantity', 1));

    select entity_name, id, data
      into v_inventory_entity, v_inventory_id, v_inventory_data
      from public.app_entities
     where entity_name = 'Card'
       and id = v_item_id
     for update;

    if not found then
      select entity_name, id, data
        into v_inventory_entity, v_inventory_id, v_inventory_data
        from public.app_entities
       where entity_name = 'Product'
         and id = v_item_id
       for update;
    end if;

    if not found then
      raise exception 'Inventory record not found for %', coalesce(v_item->>'card_name', v_item_id);
    end if;

    v_current_quantity := public.checkout_jsonb_int(v_inventory_data->'quantity', 0);
    if v_current_quantity < v_requested_quantity then
      raise exception 'Insufficient inventory for %. Requested %, available %.',
        coalesce(v_item->>'card_name', v_item_id), v_requested_quantity, v_current_quantity;
    end if;

    v_next_quantity := v_current_quantity - v_requested_quantity;

    update public.app_entities
       set updated_date = v_now,
           data = jsonb_set(v_inventory_data, '{quantity}', to_jsonb(v_next_quantity), true)
                  || jsonb_build_object('updated_date', v_now::text)
     where entity_name = v_inventory_entity
       and id = v_inventory_id;
  end loop;

  update public.checkout_finalizations
     set status = 'finalized',
         order_entity_id = v_order_id,
         finalized_at = v_now,
         updated_date = v_now,
         error_message = null
   where idempotency_key = v_key;

  return jsonb_build_object(
    'order', v_order_payload,
    'already_finalized', false
  );
end;
$$;
