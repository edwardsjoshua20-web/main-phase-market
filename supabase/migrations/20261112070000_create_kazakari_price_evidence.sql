-- Additive, Kazakari-only evidence storage. Price observations are immutable.

create table if not exists public.kazakari_preferred_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  retailer text not null check (retailer in ('home-depot','lowes','walmart','dollar-general','menards')),
  store_number text not null check (length(trim(store_number)) between 1 and 40),
  zip_code text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, retailer, store_number)
);

create table if not exists public.kazakari_price_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  retailer text not null check (retailer in ('home-depot','lowes','walmart','dollar-general','menards')),
  product_identifier text,
  upc text check (upc is null or upc ~ '^[0-9]{8,14}$'),
  product_name text,
  category text,
  image_url text,
  product_url text,
  store_number text not null check (length(trim(store_number)) between 1 and 40),
  store_zip text,
  store_address text,
  observed_price numeric(12,2) not null check (observed_price >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  price_type text not null check (price_type in ('register-price','retailer-app-price','shelf-tag-price','customer-reported-price')),
  evidence_tier text not null check (evidence_tier in ('tier-1-register-confirmed','tier-2-retailer-app-observed','tier-3-reported-watchlist')),
  evidence_method text not null,
  availability_status text check (availability_status is null or availability_status in ('in-stock','limited','out-of-stock','unknown')),
  observed_at timestamptz not null,
  collected_at timestamptz not null default now(),
  evidence_path text,
  evidence_reference text,
  notes text,
  source text not null default 'family-submission'
);

create index if not exists kazakari_price_observations_identity_idx
  on public.kazakari_price_observations(retailer, upc, product_identifier, store_number, observed_at desc);
create index if not exists kazakari_price_observations_user_idx
  on public.kazakari_price_observations(user_id, observed_at desc);

alter table public.kazakari_preferred_stores enable row level security;
alter table public.kazakari_price_observations enable row level security;

grant select, insert, update, delete on public.kazakari_preferred_stores to authenticated;
grant select, insert on public.kazakari_price_observations to authenticated;
revoke update, delete on public.kazakari_price_observations from authenticated, anon;
grant all on public.kazakari_preferred_stores, public.kazakari_price_observations to service_role;

create policy "authorized family manages own preferred stores"
  on public.kazakari_preferred_stores for all to authenticated
  using (
    user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) in
      ('admin@mainphasemarket.net','zqbee2016@yahoo.com')
  )
  with check (
    user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) in
      ('admin@mainphasemarket.net','zqbee2016@yahoo.com')
  );

create policy "authorized family reads price evidence"
  on public.kazakari_price_observations for select to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@mainphasemarket.net','zqbee2016@yahoo.com'));

create policy "authorized family inserts own immutable price evidence"
  on public.kazakari_price_observations for insert to authenticated
  with check (
    user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) in
      ('admin@mainphasemarket.net','zqbee2016@yahoo.com')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kazakari-price-evidence','kazakari-price-evidence',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=excluded.allowed_mime_types;

create policy "authorized family uploads own price evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id='kazakari-price-evidence'
    and (storage.foldername(name))[1]=auth.uid()::text
    and lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@mainphasemarket.net','zqbee2016@yahoo.com')
  );

create policy "authorized family reads price evidence objects"
  on storage.objects for select to authenticated
  using (
    bucket_id='kazakari-price-evidence'
    and lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@mainphasemarket.net','zqbee2016@yahoo.com')
  );
