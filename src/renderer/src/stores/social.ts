import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// What we broadcast to friends so they can see "now playing" and so the
// listen-along guest knows what to resolve and where to seek to.
export interface NowPlayingTrack {
  title: string
  artist: string | null
  sourceUrl: string
  service: string
  thumbnailUrl: string | null
  durationSec: number | null
}

export interface NowPlayingState {
  track: NowPlayingTrack | null
  positionSec: number
  isPlaying: boolean
  ts: number // host wall-clock when sampled, ms since epoch
}

interface FriendState {
  online: boolean
  state: NowPlayingState | null
}

interface SocialState {
  meId: string | null
  hostChannel: RealtimeChannel | null
  // userId -> their channel subscription
  subs: Record<string, RealtimeChannel>
  friendStates: Record<string, FriendState>
  // The state we most recently broadcast, used to skip duplicates.
  lastPublished: NowPlayingState | null

  start: (meId: string) => void
  stop: () => Promise<void>
  setFriendIds: (ids: string[]) => void
  publish: (state: NowPlayingState) => void
}

function channelName(userId: string): string {
  return `np:${userId}`
}

// Presence tracks a payload per "key" — Supabase uses the joining socket id as
// the key by default. We only care about the most recent state from the host,
// so we pluck the first entry on every sync.
function pickHostState(presenceState: Record<string, unknown[]>): NowPlayingState | null {
  for (const entries of Object.values(presenceState)) {
    if (entries.length > 0) {
      const e = entries[0] as { state?: NowPlayingState }
      if (e?.state) return e.state
    }
  }
  return null
}

export const useSocial = create<SocialState>((set, get) => ({
  meId: null,
  hostChannel: null,
  subs: {},
  friendStates: {},
  lastPublished: null,

  start: (meId) => {
    const existing = get().hostChannel
    if (existing && get().meId === meId) return
    if (existing) void existing.unsubscribe()

    // The host channel: we join our own np:<meId> and track our state.
    // Friends who subscribe to the same channel see presence sync events.
    // We don't pin a presence key — Supabase auto-assigns a UUID per join,
    // and we only ever read entries that carry a `state` payload, so any
    // empty entries from listeners are ignored.
    const ch = supabase.channel(channelName(meId))
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Send an initial empty state so friends know I'm online but idle.
        const last = get().lastPublished
        void ch.track({
          state:
            last ?? {
              track: null,
              positionSec: 0,
              isPlaying: false,
              ts: Date.now()
            }
        })
      }
    })

    set({ meId, hostChannel: ch })
  },

  stop: async () => {
    const { hostChannel, subs } = get()
    if (hostChannel) await hostChannel.unsubscribe()
    for (const c of Object.values(subs)) await c.unsubscribe()
    set({
      meId: null,
      hostChannel: null,
      subs: {},
      friendStates: {},
      lastPublished: null
    })
  },

  setFriendIds: (ids) => {
    const { subs, meId } = get()
    if (!meId) return
    const want = new Set(ids.filter((id) => id !== meId))
    const current = new Set(Object.keys(subs))

    const nextSubs = { ...subs }
    const nextStates = { ...get().friendStates }

    // Drop subs for friends no longer in the list.
    for (const id of current) {
      if (!want.has(id)) {
        void subs[id].unsubscribe()
        delete nextSubs[id]
        delete nextStates[id]
      }
    }

    // Add subs for new friends.
    for (const id of want) {
      if (current.has(id)) continue
      const ch = supabase.channel(channelName(id))
      ch.on('presence', { event: 'sync' }, () => {
        const presence = ch.presenceState() as Record<string, unknown[]>
        const state = pickHostState(presence)
        const online = Object.keys(presence).length > 0
        set((s) => ({
          friendStates: {
            ...s.friendStates,
            [id]: { online, state }
          }
        }))
      })
      ch.subscribe()
      nextSubs[id] = ch
      nextStates[id] = nextStates[id] ?? { online: false, state: null }
    }

    set({ subs: nextSubs, friendStates: nextStates })
  },

  publish: (state) => {
    const { hostChannel, lastPublished } = get()
    if (!hostChannel) return
    // Skip if nothing meaningful changed (same source/playing flag and <2s drift).
    if (
      lastPublished &&
      lastPublished.track?.sourceUrl === state.track?.sourceUrl &&
      lastPublished.isPlaying === state.isPlaying &&
      Math.abs(lastPublished.positionSec - state.positionSec) < 1.5 &&
      state.ts - lastPublished.ts < 1500
    ) {
      return
    }
    set({ lastPublished: state })
    void hostChannel.track({ state })
  }
}))
