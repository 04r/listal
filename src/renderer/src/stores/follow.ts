import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface FollowState {
  // People I follow (their profile IDs).
  followingIds: Set<string>
  // Cached counters keyed by profile id.
  counts: Record<string, { followers: number; following: number }>
  meId: string | null

  start: (meId: string) => Promise<void>
  stop: () => void
  isFollowing: (userId: string) => boolean
  follow: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  unfollow: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  loadCounts: (userId: string) => Promise<void>
}

export const useFollow = create<FollowState>((set, get) => ({
  followingIds: new Set(),
  counts: {},
  meId: null,

  start: async (meId) => {
    set({ meId })
    const { data } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', meId)
    const ids = new Set<string>()
    for (const row of data ?? []) ids.add((row as { followee_id: string }).followee_id)
    set({ followingIds: ids })
  },

  stop: () => set({ followingIds: new Set(), counts: {}, meId: null }),

  isFollowing: (userId) => get().followingIds.has(userId),

  follow: async (userId) => {
    const meId = get().meId
    if (!meId) return { ok: false, error: 'Not signed in' }
    if (meId === userId) return { ok: false, error: "You can't follow yourself" }
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: meId, followee_id: userId })
    if (error) return { ok: false, error: error.message }
    const next = new Set(get().followingIds)
    next.add(userId)
    set({ followingIds: next })
    void get().loadCounts(userId)
    return { ok: true }
  },

  unfollow: async (userId) => {
    const meId = get().meId
    if (!meId) return { ok: false, error: 'Not signed in' }
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', meId)
      .eq('followee_id', userId)
    if (error) return { ok: false, error: error.message }
    const next = new Set(get().followingIds)
    next.delete(userId)
    set({ followingIds: next })
    void get().loadCounts(userId)
    return { ok: true }
  },

  loadCounts: async (userId) => {
    // Two head counts in parallel — Supabase's count on filtered queries.
    const [followersRes, followingRes] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
    ])
    const followers = followersRes.count ?? 0
    const following = followingRes.count ?? 0
    set((s) => ({ counts: { ...s.counts, [userId]: { followers, following } } }))
  }
}))
