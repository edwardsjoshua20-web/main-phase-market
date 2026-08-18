create or replace function public.is_mainphase_admin()
returns boolean
language sql
stable
as $$
  select
    auth.role() = 'service_role'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net';
$$;

create or replace function public.app_entity_owner_email_matches(row_data jsonb)
returns boolean
language sql
stable
as $$
  select lower(coalesce(row_data ->> 'user_email', row_data ->> 'owner_email', row_data ->> 'author_email', ''))
    = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

drop policy if exists "admin reads inventory app_entities" on public.app_entities;
create policy "admin reads inventory app_entities"
  on public.app_entities
  for select
  to authenticated
  using (
    entity_name in ('Card', 'Product')
    and public.is_mainphase_admin()
  );

drop policy if exists "admin writes inventory app_entities" on public.app_entities;
create policy "admin writes inventory app_entities"
  on public.app_entities
  for insert
  to authenticated
  with check (
    entity_name in ('Card', 'Product')
    and public.is_mainphase_admin()
  );

drop policy if exists "admin updates inventory app_entities" on public.app_entities;
create policy "admin updates inventory app_entities"
  on public.app_entities
  for update
  to authenticated
  using (
    entity_name in ('Card', 'Product')
    and public.is_mainphase_admin()
  )
  with check (
    entity_name in ('Card', 'Product')
    and public.is_mainphase_admin()
  );

drop policy if exists "admin deletes inventory app_entities" on public.app_entities;
create policy "admin deletes inventory app_entities"
  on public.app_entities
  for delete
  to authenticated
  using (
    entity_name in ('Card', 'Product')
    and public.is_mainphase_admin()
  );

drop policy if exists "public reads published community decks" on public.app_entities;
create policy "public reads published community decks"
  on public.app_entities
  for select
  to anon, authenticated
  using (
    entity_name = 'CommunityDeck'
    and lower(coalesce(data ->> 'is_published', 'false')) in ('true', '1', 'yes')
  );

drop policy if exists "users read own community deck app_entities" on public.app_entities;
create policy "users read own community deck app_entities"
  on public.app_entities
  for select
  to authenticated
  using (
    entity_name = 'CommunityDeck'
    and public.app_entity_owner_email_matches(data)
  );

drop policy if exists "users create own community deck app_entities" on public.app_entities;
create policy "users create own community deck app_entities"
  on public.app_entities
  for insert
  to authenticated
  with check (
    entity_name = 'CommunityDeck'
    and public.app_entity_owner_email_matches(data)
  );

drop policy if exists "users update own community deck app_entities" on public.app_entities;
create policy "users update own community deck app_entities"
  on public.app_entities
  for update
  to authenticated
  using (
    entity_name = 'CommunityDeck'
    and (
      public.app_entity_owner_email_matches(data)
      or public.is_mainphase_admin()
    )
  )
  with check (
    entity_name = 'CommunityDeck'
    and (
      public.app_entity_owner_email_matches(data)
      or public.is_mainphase_admin()
    )
  );

drop policy if exists "users delete own community deck app_entities" on public.app_entities;
create policy "users delete own community deck app_entities"
  on public.app_entities
  for delete
  to authenticated
  using (
    entity_name = 'CommunityDeck'
    and (
      public.app_entity_owner_email_matches(data)
      or public.is_mainphase_admin()
    )
  );

drop policy if exists "forum_threads_insert_auth" on public.forum_threads;
create policy "forum_threads_insert_auth"
  on public.forum_threads
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    or lower(coalesce(author_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "forum_threads_update_own" on public.forum_threads;
create policy "forum_threads_update_own"
  on public.forum_threads
  for update
  to authenticated
  using (
    author_id = auth.uid()
    or lower(coalesce(author_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_mainphase_admin()
  )
  with check (
    author_id = auth.uid()
    or lower(coalesce(author_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_mainphase_admin()
  );

drop policy if exists "forum_threads_delete_own" on public.forum_threads;
create policy "forum_threads_delete_own"
  on public.forum_threads
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    or lower(coalesce(author_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_mainphase_admin()
  );
