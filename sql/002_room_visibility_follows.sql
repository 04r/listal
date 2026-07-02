-- Migration for Listal v1.0.8
-- Run this once in the Supabase SQL editor. Idempotent.

-- ============================================================================
-- 1. Room visibility
-- ============================================================================

-- Add the new visibility column with three tiers.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS visibility TEXT
  NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','friends','private'));

-- Backfill from the legacy is_public boolean.
UPDATE public.rooms
   SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END
 WHERE visibility = 'public'
   AND is_public = false;

-- Rewrite the browse SELECT policy so friends-only rooms only surface to
-- accepted friends and private rooms only to members / owners.
DROP POLICY IF EXISTS "rooms select" ON public.rooms;
CREATE POLICY "rooms select"
  ON public.rooms FOR SELECT
  USING (
    visibility = 'public'
    OR owner_id = auth.uid()
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1 FROM public.friendships f
         WHERE f.status = 'accepted'
           AND (
             (f.user_a = auth.uid() AND f.user_b = rooms.owner_id)
             OR (f.user_a = rooms.owner_id AND f.user_b = auth.uid())
           )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.room_members m
       WHERE m.room_id = rooms.id AND m.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. Follows (social graph)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followee_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows(followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read the graph (counts + relationships are public).
DROP POLICY IF EXISTS "follows select" ON public.follows;
CREATE POLICY "follows select" ON public.follows
  FOR SELECT USING (auth.role() = 'authenticated');

-- You can only insert rows where you are the follower.
DROP POLICY IF EXISTS "follows insert" ON public.follows;
CREATE POLICY "follows insert" ON public.follows
  FOR INSERT WITH CHECK (follower_id = auth.uid());

-- You can only delete your own outgoing follows.
DROP POLICY IF EXISTS "follows delete" ON public.follows;
CREATE POLICY "follows delete" ON public.follows
  FOR DELETE USING (follower_id = auth.uid());

-- Realtime publish so unfollow / follow updates propagate live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
