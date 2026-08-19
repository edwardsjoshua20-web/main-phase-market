drop policy if exists "admin reads shipping fulfillment config app_entities" on public.app_entities;
create policy "admin reads shipping fulfillment config app_entities"
  on public.app_entities
  for select
  to authenticated
  using (
    entity_name = 'ShippingFulfillmentConfig'
    and public.is_mainphase_admin()
  );

drop policy if exists "admin creates shipping fulfillment config app_entities" on public.app_entities;
create policy "admin creates shipping fulfillment config app_entities"
  on public.app_entities
  for insert
  to authenticated
  with check (
    entity_name = 'ShippingFulfillmentConfig'
    and id = 'shipping-fulfillment-config-v1'
    and public.is_mainphase_admin()
  );

drop policy if exists "admin updates shipping fulfillment config app_entities" on public.app_entities;
create policy "admin updates shipping fulfillment config app_entities"
  on public.app_entities
  for update
  to authenticated
  using (
    entity_name = 'ShippingFulfillmentConfig'
    and id = 'shipping-fulfillment-config-v1'
    and public.is_mainphase_admin()
  )
  with check (
    entity_name = 'ShippingFulfillmentConfig'
    and id = 'shipping-fulfillment-config-v1'
    and public.is_mainphase_admin()
  );

drop policy if exists "admin deletes shipping fulfillment config app_entities" on public.app_entities;
create policy "admin deletes shipping fulfillment config app_entities"
  on public.app_entities
  for delete
  to authenticated
  using (
    entity_name = 'ShippingFulfillmentConfig'
    and id = 'shipping-fulfillment-config-v1'
    and public.is_mainphase_admin()
  );
