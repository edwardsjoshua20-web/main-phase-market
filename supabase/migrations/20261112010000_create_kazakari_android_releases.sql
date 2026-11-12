create table if not exists public.kazakari_android_releases (
  id uuid primary key default gen_random_uuid(),
  application_id text not null check (application_id = 'net.mainphasemarket.kazakari'),
  version_code integer not null unique check (version_code > 0),
  version_name text not null,
  release_date timestamptz not null,
  storage_path text not null unique,
  file_name text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  release_notes text not null default '',
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists kazakari_android_one_current_release_idx
  on public.kazakari_android_releases (is_current)
  where is_current;

alter table public.kazakari_android_releases enable row level security;

grant select on table public.kazakari_android_releases to authenticated;
grant all on table public.kazakari_android_releases to service_role;
revoke all on table public.kazakari_android_releases from anon;

drop policy if exists "owner reads kazakari android releases" on public.kazakari_android_releases;
create policy "owner reads kazakari android releases"
  on public.kazakari_android_releases for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@mainphasemarket.net');

drop policy if exists "service role manages kazakari android releases" on public.kazakari_android_releases;
create policy "service role manages kazakari android releases"
  on public.kazakari_android_releases for all
  to service_role
  using (true)
  with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kazakari-android-releases',
  'kazakari-android-releases',
  false,
  104857600,
  array['application/vnd.android.package-archive']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage objects intentionally have no anon/authenticated policies. The owner-only
-- Edge Function creates a short-lived signed URL after validating the user session.
