create extension if not exists pgcrypto;

create table if not exists public.saved_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  owner_email text,
  name text not null,
  game text not null default 'mtg',
  format text not null default 'commander',
  commander_name text,
  source text,
  tags text[] not null default '{}',
  deck_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_decks_user_id_idx
  on public.saved_decks (user_id);

create index if not exists saved_decks_owner_email_idx
  on public.saved_decks (owner_email);

create index if not exists saved_decks_game_format_idx
  on public.saved_decks (game, format);

create index if not exists saved_decks_updated_at_idx
  on public.saved_decks (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_decks_set_updated_at on public.saved_decks;

create trigger saved_decks_set_updated_at
before update on public.saved_decks
for each row
execute function public.set_updated_at();

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  bio text,
  favorite_game text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_email_idx
  on public.user_profiles (email);

create index if not exists user_profiles_favorite_game_idx
  on public.user_profiles (favorite_game);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  title text not null,
  content text not null,
  game text not null default 'magic',
  category text not null default 'general',
  tags text[] not null default '{}',
  author_name text,
  author_email text,
  is_pinned boolean not null default false,
  is_solved boolean not null default false,
  view_count integer not null default 0,
  reply_count integer not null default 0,
  likes integer not null default 0,
  liked_by text[] not null default '{}',
  last_reply_at timestamptz,
  last_reply_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forum_threads_author_id_idx
  on public.forum_threads (author_id);

create index if not exists forum_threads_game_category_idx
  on public.forum_threads (game, category);

create index if not exists forum_threads_created_at_idx
  on public.forum_threads (created_at desc);

create index if not exists forum_threads_pinned_created_at_idx
  on public.forum_threads (is_pinned, created_at desc);

drop trigger if exists forum_threads_set_updated_at on public.forum_threads;

create trigger forum_threads_set_updated_at
before update on public.forum_threads
for each row
execute function public.set_updated_at();

create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  content text not null,
  author_name text,
  author_email text,
  likes integer not null default 0,
  liked_by text[] not null default '{}',
  is_accepted_answer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forum_replies_thread_id_idx
  on public.forum_replies (thread_id);

create index if not exists forum_replies_author_id_idx
  on public.forum_replies (author_id);

create index if not exists forum_replies_created_at_idx
  on public.forum_replies (created_at asc);

drop trigger if exists forum_replies_set_updated_at on public.forum_replies;

create trigger forum_replies_set_updated_at
before update on public.forum_replies
for each row
execute function public.set_updated_at();
