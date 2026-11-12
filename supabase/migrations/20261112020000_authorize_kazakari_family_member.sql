-- Kazakari remains private. Access is limited to the owner and the explicitly
-- authorized family member; unrelated administrators are not included.

drop policy if exists "owner reads kazakari snapshot" on public.kazakari_preview_snapshots;
drop policy if exists "authorized users read kazakari snapshot" on public.kazakari_preview_snapshots;
create policy "authorized users read kazakari snapshot"
  on public.kazakari_preview_snapshots for select
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@mainphasemarket.net',
      'zqbee2016@yahoo.com'
    )
  );

drop policy if exists "owner reads own kazakari watches" on public.kazakari_watch_rules;
drop policy if exists "authorized users read own kazakari watches" on public.kazakari_watch_rules;
create policy "authorized users read own kazakari watches"
  on public.kazakari_watch_rules for select
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@mainphasemarket.net',
      'zqbee2016@yahoo.com'
    )
  );

drop policy if exists "owner creates own kazakari watches" on public.kazakari_watch_rules;
drop policy if exists "authorized users create own kazakari watches" on public.kazakari_watch_rules;
create policy "authorized users create own kazakari watches"
  on public.kazakari_watch_rules for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@mainphasemarket.net',
      'zqbee2016@yahoo.com'
    )
  );

drop policy if exists "owner updates own kazakari watches" on public.kazakari_watch_rules;
drop policy if exists "authorized users update own kazakari watches" on public.kazakari_watch_rules;
create policy "authorized users update own kazakari watches"
  on public.kazakari_watch_rules for update
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@mainphasemarket.net',
      'zqbee2016@yahoo.com'
    )
  )
  with check (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@mainphasemarket.net',
      'zqbee2016@yahoo.com'
    )
  );

drop policy if exists "owner deletes own kazakari watches" on public.kazakari_watch_rules;
drop policy if exists "authorized users delete own kazakari watches" on public.kazakari_watch_rules;
create policy "authorized users delete own kazakari watches"
  on public.kazakari_watch_rules for delete
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@mainphasemarket.net',
      'zqbee2016@yahoo.com'
    )
  );

drop policy if exists "owner reads kazakari android releases" on public.kazakari_android_releases;
drop policy if exists "authorized users read kazakari android releases" on public.kazakari_android_releases;
create policy "authorized users read kazakari android releases"
  on public.kazakari_android_releases for select
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'admin@mainphasemarket.net',
      'zqbee2016@yahoo.com'
    )
  );
