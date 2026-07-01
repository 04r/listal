import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, canonicalPair, type Profile, type FriendshipRow } from '../lib/supabase'
import { useSocial } from './social'

export interface FriendEntry {
  profile: Profile
  status: 'accepted' | 'pending_in' | 'pending_out'
}

interface FriendsState {
  meId: string | null
  entries: FriendEntry[]
  loading: boolean
  error: string | null
  channel: RealtimeChannel | null

  // Bring the store online for the given user. Idempotent.
  start: (meId: string) => Promise<void>
  stop: () => Promise<void>
  refresh: () => Promise<void>
  sendRequest: (username: string) => Promise<{ ok: true } | { ok: false; error: string }>
  decide: (other: Profile, accept: boolean) => Promise<void>
  unfriend: (other: Profile) => Promise<void>
}

async function fetchEntries(meId: string): Promise<FriendEntry[]> {
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`user_a.eq.${meId},user_b.eq.${meId}`)
  if (error) throw error
  const others = (rows ?? []).map((r: FriendshipRow) => {
    const otherId = r.user_a === meId ? r.user_b : r.user_a
    let status: FriendEntry['status']
    if (r.status === 'accepted') status = 'accepted'
    else if (r.requested_by === meId) status = 'pending_out'
    else status = 'pending_in'
    return { otherId, status }
  })
  if (others.length === 0) return []
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .in('id', others.map((o) => o.otherId))
  if (pErr) throw pErr
  const byId = new Map<string, Profile>()
  for (const p of profiles ?? []) byId.set(p.id, p)
  return others
    .map((o) => {
      const p = byId.get(o.otherId)
      return p ? { profile: p, status: o.status } : null
    })
    .filter((x): x is FriendEntry => x != null)
}

// StrictMode double-fires effects in dev. Both fires call start(), and if we
// only guard against a completed init the second call tries to add
// postgres_changes callbacks to an already-subscribed channel and blows up
// with "cannot add postgres_changes callbacks after subscribe()".
const startingFor = new Set<string>()
let windowFocusHooked = false

export const useFriends = create<FriendsState>((set, get) => ({
  meId: null,
  entries: [],
  loading: false,
  error: null,
  channel: null,

  start: async (meId) => {
    if (get().meId === meId && get().channel) return
    if (startingFor.has(meId)) return
    startingFor.add(meId)
    if (get().channel) await get().channel!.unsubscribe()
    set({ meId, loading: true, error: null, channel: null })

    // Initial load
    try {
      const entries = await fetchEntries(meId)
      set({ entries, loading: false })
      useSocial
        .getState()
        .setFriendIds(entries.filter((e) => e.status === 'accepted').map((e) => e.profile.id))
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }

    // Realtime: re-fetch on any friendship row change involving me. RLS already
    // filters the stream so we only see rows we're a party to, but the channel
    // filter isn't expressive enough for our OR — we just re-fetch on anything.
    // We also listen for a broadcast on our per-user channel so that the
    // accepter can nudge the requester directly, in case the postgres_changes
    // stream doesn't reach the requester (RLS on the replication side).
    const ch = supabase
      .channel(`friends:${meId}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          void get().refresh()
        }
      )
      .on('broadcast', { event: 'friend_changed' }, () => {
        void get().refresh()
      })
      .subscribe()
    set({ channel: ch })
    startingFor.delete(meId)

    // Refresh whenever the window regains focus / visibility. Cheap safety net
    // for any missed realtime event.
    if (!windowFocusHooked) {
      windowFocusHooked = true
      const onFocus = (): void => {
        const meIdNow = useFriends.getState().meId
        if (meIdNow) void useFriends.getState().refresh()
      }
      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') onFocus()
      })
    }
  },

  stop: async () => {
    const ch = get().channel
    if (ch) await ch.unsubscribe()
    set({ meId: null, entries: [], channel: null, error: null })
    useSocial.getState().setFriendIds([])
  },

  refresh: async () => {
    const meId = get().meId
    if (!meId) return
    try {
      const entries = await fetchEntries(meId)
      set({ entries, error: null })
      useSocial
        .getState()
        .setFriendIds(entries.filter((e) => e.status === 'accepted').map((e) => e.profile.id))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  sendRequest: async (username) => {
    const meId = get().meId
    if (!meId) return { ok: false, error: 'Not signed in.' }
    const target = username.trim().toLowerCase().replace(/^@/, '')
    if (!target) return { ok: false, error: 'Username required.' }
    try {
      const { data: profile, error: lookupErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', target)
        .maybeSingle()
      if (lookupErr) return { ok: false, error: lookupErr.message }
      if (!profile) return { ok: false, error: `No user @${target} found.` }
      if (profile.id === meId) return { ok: false, error: "You can't friend yourself." }
      const pair = canonicalPair(meId, profile.id)
      const { error: insertErr } = await supabase.from('friendships').insert({
        ...pair,
        status: 'pending',
        requested_by: meId
      })
      if (insertErr) return { ok: false, error: insertErr.message }
      try {
        const nudge = supabase.channel(`friends:${profile.id}`)
        await nudge.subscribe()
        await nudge.send({ type: 'broadcast', event: 'friend_changed', payload: {} })
        await nudge.unsubscribe()
      } catch {
        /* best-effort */
      }
      await get().refresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  decide: async (other, accept) => {
    const meId = get().meId
    if (!meId) return
    const pair = canonicalPair(meId, other.id)
    const { error } = await supabase
      .from('friendships')
      .update({
        status: accept ? 'accepted' : 'declined',
        decided_at: new Date().toISOString()
      })
      .eq('user_a', pair.user_a)
      .eq('user_b', pair.user_b)
    if (error) set({ error: error.message })
    // Nudge the other party so they don't have to restart to see the change.
    // Uses a one-shot ephemeral channel; no persistence needed.
    try {
      const nudge = supabase.channel(`friends:${other.id}`)
      await nudge.subscribe()
      await nudge.send({ type: 'broadcast', event: 'friend_changed', payload: {} })
      await nudge.unsubscribe()
    } catch {
      // Best-effort — realtime + focus-refresh still covers this.
    }
    await get().refresh()
  },

  unfriend: async (other) => {
    const meId = get().meId
    if (!meId) return
    const pair = canonicalPair(meId, other.id)
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_a', pair.user_a)
      .eq('user_b', pair.user_b)
    if (error) set({ error: error.message })
    await get().refresh()
  }
}))
