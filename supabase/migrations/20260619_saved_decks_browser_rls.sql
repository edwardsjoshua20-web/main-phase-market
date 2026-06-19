alter table public.saved_decks enable row level security;

drop policy if exists "saved_decks_select_own" on public.saved_decks;
create policy "saved_decks_select_own"
  on public.saved_decks
  for select
  using (
    user_id = auth.uid()
    or lower(owner_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "saved_decks_insert_own" on public.saved_decks;
create policy "saved_decks_insert_own"
  on public.saved_decks
  for insert
  with check (
    user_id = auth.uid()
    or lower(owner_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "saved_decks_update_own" on public.saved_decks;
create policy "saved_decks_update_own"
  on public.saved_decks
  for update
  using (
    user_id = auth.uid()
    or lower(owner_email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    user_id = auth.uid()
    or lower(owner_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "saved_decks_delete_own" on public.saved_decks;
create policy "saved_decks_delete_own"
  on public.saved_decks
  for delete
  using (
    user_id = auth.uid()
    or lower(owner_email) = lower(auth.jwt() ->> 'email')
  );
