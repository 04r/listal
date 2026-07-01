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

-- Realtime: ship friendship inserts/updates/deletes so friend requests
-- appear instantly without a refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friendships'
  ) then
    execute 'alter publication supabase_realtime add table public.friendships';
  end if;
end $$;

-- Realtime: profile updates (display name, avatar) — so friends see the
-- change without restarting their app.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;

-- ---------- convoys ----------
-- Shared listening sessions (Spotify Jam equivalent). The convoys row itself
-- is the playback source of truth: any participant can update it, and every
-- other participant mirrors it into their local player via realtime.
create table if not exists public.convoys (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  code text unique not null,
  name text,
  dj_mode text not null default 'open' check (dj_mode in ('open', 'host_only')),
  current_track_url text,
  current_track_title text,
  current_track_artist text,
  current_track_service text,
  current_track_thumbnail text,
  current_track_duration_sec numeric,
  current_position_sec numeric not null default 0,
  is_playing boolean not null default false,
  position_ts timestamptz not null default now(),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists convoys_code_active_idx
  on public.convoys (code) where ended_at is null;

alter table public.convoys enable row level security;

-- Any signed-in user can look up by code; join-by-code needs this.
drop policy if exists "convoys_read" on public.convoys;
create policy "convoys_read" on public.convoys
  for select using (auth.role() = 'authenticated');

drop policy if exists "convoys_host_insert" on public.convoys;
create policy "convoys_host_insert" on public.convoys
  for insert with check (auth.uid() = host_id);

-- Any participant can push playback state. The check that we're a participant
-- is enforced through the convoy_participants membership.
drop policy if exists "convoys_participant_update" on public.convoys;
create policy "convoys_participant_update" on public.convoys
  for update using (
    exists (
      select 1 from public.convoy_participants cp
      where cp.convoy_id = id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "convoys_host_delete" on public.convoys;
create policy "convoys_host_delete" on public.convoys
  for delete using (auth.uid() = host_id);

-- ---------- convoy_participants ----------
create table if not exists public.convoy_participants (
  convoy_id uuid not null references public.convoys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'guest' check (role in ('host', 'dj', 'guest')),
  joined_at timestamptz not null default now(),
  primary key (convoy_id, user_id)
);

create index if not exists convoy_participants_user_idx
  on public.convoy_participants (user_id);

alter table public.convoy_participants enable row level security;

-- Any signed-in user can read participant rows; they need it to render the
-- roster when they join.
drop policy if exists "convoy_participants_read" on public.convoy_participants;
create policy "convoy_participants_read" on public.convoy_participants
  for select using (auth.role() = 'authenticated');

drop policy if exists "convoy_participants_self_insert" on public.convoy_participants;
create policy "convoy_participants_self_insert" on public.convoy_participants
  for insert with check (auth.uid() = user_id);

drop policy if exists "convoy_participants_self_delete" on public.convoy_participants;
create policy "convoy_participants_self_delete" on public.convoy_participants
  for delete using (auth.uid() = user_id);

-- Host can kick anyone.
drop policy if exists "convoy_participants_host_delete" on public.convoy_participants;
create policy "convoy_participants_host_delete" on public.convoy_participants
  for delete using (
    exists (
      select 1 from public.convoys c
      where c.id = convoy_id and c.host_id = auth.uid()
    )
  );

-- ---------- convoy_queue ----------
create table if not exists public.convoy_queue (
  id bigserial primary key,
  convoy_id uuid not null references public.convoys(id) on delete cascade,
  position numeric not null,
  service text not null,
  source_url text not null,
  title text not null,
  artist text,
  thumbnail_url text,
  duration_sec numeric,
  added_by uuid not null references public.profiles(id),
  added_at timestamptz not null default now()
);

create index if not exists convoy_queue_position_idx
  on public.convoy_queue (convoy_id, position);

alter table public.convoy_queue enable row level security;

drop policy if exists "convoy_queue_read" on public.convoy_queue;
create policy "convoy_queue_read" on public.convoy_queue
  for select using (
    exists (
      select 1 from public.convoy_participants cp
      where cp.convoy_id = convoy_queue.convoy_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "convoy_queue_insert" on public.convoy_queue;
create policy "convoy_queue_insert" on public.convoy_queue
  for insert with check (
    auth.uid() = added_by
    and exists (
      select 1 from public.convoy_participants cp
      where cp.convoy_id = convoy_queue.convoy_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "convoy_queue_delete" on public.convoy_queue;
create policy "convoy_queue_delete" on public.convoy_queue
  for delete using (
    exists (
      select 1 from public.convoy_participants cp
      where cp.convoy_id = convoy_queue.convoy_id and cp.user_id = auth.uid()
    )
  );

-- Realtime publications.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='convoys')
  then execute 'alter publication supabase_realtime add table public.convoys'; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='convoy_participants')
  then execute 'alter publication supabase_realtime add table public.convoy_participants'; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='convoy_queue')
  then execute 'alter publication supabase_realtime add table public.convoy_queue'; end if;
end $$;
