drop policy if exists "public reads active storefront inventory app_entities" on public.app_entities;
create policy "public reads active storefront inventory app_entities"
  on public.app_entities
  for select
  to anon, authenticated
  using (
    entity_name in ('Card', 'Product')
    and lower(coalesce(data ->> 'status', 'active')) = 'active'
  );

drop policy if exists "users read own cart item app_entities" on public.app_entities;
create policy "users read own cart item app_entities"
  on public.app_entities
  for select
  to authenticated
  using (
    entity_name = 'CartItem'
    and public.app_entity_owner_email_matches(data)
  );

drop policy if exists "users create own cart item app_entities" on public.app_entities;
create policy "users create own cart item app_entities"
  on public.app_entities
  for insert
  to authenticated
  with check (
    entity_name = 'CartItem'
    and public.app_entity_owner_email_matches(data)
  );

drop policy if exists "users update own cart item app_entities" on public.app_entities;
create policy "users update own cart item app_entities"
  on public.app_entities
  for update
  to authenticated
  using (
    entity_name = 'CartItem'
    and public.app_entity_owner_email_matches(data)
  )
  with check (
    entity_name = 'CartItem'
    and public.app_entity_owner_email_matches(data)
  );

drop policy if exists "users delete own cart item app_entities" on public.app_entities;
create policy "users delete own cart item app_entities"
  on public.app_entities
  for delete
  to authenticated
  using (
    entity_name = 'CartItem'
    and public.app_entity_owner_email_matches(data)
  );
