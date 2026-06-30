-- Run this in your Supabase project's SQL editor once.
-- Tables: profiles, friendships. RLS policies included.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 2 and 32),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- Anyone signed in can read profiles (so we can look people up by username).
alter table public.profiles enable row level security;

drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- ---------- friendships ----------
-- Stored once per pair using canonical (user_a < user_b) ordering.
create table if not exists public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by = user_a or requested_by = user_b)
);

alter table public.friendships enable row level security;

drop policy if exists "friendships_party_read" on public.friendships;
create policy "friendships_party_read" on public.friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "friendships_party_insert" on public.friendships;
create policy "friendships_party_insert" on public.friendships
  for insert with check (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() = requested_by
  );

-- Only the OTHER party (not the requester) can flip pending -> accepted/declined.
drop policy if exists "friendships_recipient_update" on public.friendships;
create policy "friendships_recipient_update" on public.friendships
  for update using (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() <> requested_by
  );

-- Either party can unfriend.
drop policy if exists "friendships_party_delete" on public.friendships;
create policy "friendships_party_delete" on public.friendships
  for delete using (auth.uid() = user_a or auth.uid() = user_b);

-- ---------- messages ----------
-- Simple 1:1 DMs between accepted friends. No editing; delete is soft via
-- whatever you want later — for now the user list is small.
create table if not exists public.messages (
  id bigserial primary key,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_to_user_idx
  on public.messages (to_user, created_at desc);
create index if not exists messages_from_user_idx
  on public.messages (from_user, created_at desc);

alter table public.messages enable row level security;

-- Either party can read.
drop policy if exists "messages_party_read" on public.messages;
create policy "messages_party_read" on public.messages
  for select using (auth.uid() = from_user or auth.uid() = to_user);

-- You can only send if you're the sender AND you're accepted friends with
-- the recipient. RLS does the friendship check so a guest can't bypass.
drop policy if exists "messages_friend_send" on public.messages;
create policy "messages_friend_send" on public.messages
  for insert with check (
    auth.uid() = from_user
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.user_a = auth.uid() and f.user_b = to_user)
          or (f.user_b = auth.uid() and f.user_a = to_user)
        )
    )
  );

-- Recipient can flip read_at.
drop policy if exists "messages_mark_read" on public.messages;
create policy "messages_mark_read" on public.messages
  for update using (auth.uid() = to_user);

-- Realtime: ship message inserts to the renderer so chat updates live.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;
