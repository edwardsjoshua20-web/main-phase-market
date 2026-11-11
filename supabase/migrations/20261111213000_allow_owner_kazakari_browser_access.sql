alter table public.kazakari_watch_rules
  alter column user_id set default auth.uid();

grant select on table public.kazakari_preview_snapshots to authenticated;
grant select, insert, update, delete on table public.kazakari_watch_rules to authenticated;

drop policy if exists "owner reads kazakari snapshot" on public.kazakari_preview_snapshots;
create policy "owner reads kazakari snapshot"
  on public.kazakari_preview_snapshots for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net');

drop policy if exists "owner reads own kazakari watches" on public.kazakari_watch_rules;
create policy "owner reads own kazakari watches"
  on public.kazakari_watch_rules for select
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net'
  );

drop policy if exists "owner creates own kazakari watches" on public.kazakari_watch_rules;
create policy "owner creates own kazakari watches"
  on public.kazakari_watch_rules for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net'
  );

drop policy if exists "owner updates own kazakari watches" on public.kazakari_watch_rules;
create policy "owner updates own kazakari watches"
  on public.kazakari_watch_rules for update
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net'
  )
  with check (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net'
  );

drop policy if exists "owner deletes own kazakari watches" on public.kazakari_watch_rules;
create policy "owner deletes own kazakari watches"
  on public.kazakari_watch_rules for delete
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net'
  );
