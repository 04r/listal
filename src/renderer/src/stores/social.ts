import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSettings } from './settings'

// Dev builds always log. Opt out in DevTools via:
//   localStorage.setItem('listal:social-debug', '0')
// Turn off silence in prod builds by setting it to '1'.
function dbg(...args: unknown[]): void {
  if (typeof window === 'undefined') return
  const flag = window.localStorage?.getItem('listal:social-debug')
  const isDev = import.meta.env.DEV
  if (flag === '0') return
  if (flag === '1' || isDev) console.log('[social]', ...args)
}

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
  presenceMode?: 'online' | 'idle' | 'busy' | 'invisible'
}

interface FriendState {
  online: boolean
  state: NowPlayingState | null
}

interface SocialState {
  meId: string | null
  hostChannel: RealtimeChannel | null
  hostSubscribed: boolean
  // userId -> their channel subscription
  subs: Record<string, RealtimeChannel>
  friendStates: Record<string, FriendState>
  // The state we most recently broadcast, used to skip duplicates.
  lastPublished: NowPlayingState | null
  // Set by listenAlong.follow so player's own publishSocial calls no-op
  // while we're syncing to somebody else — avoids the feedback loop.
  suppressPublish: boolean

  start: (meId: string) => void
  stop: () => Promise<void>
  setFriendIds: (ids: string[]) => void
  publish: (state: NowPlayingState) => void
  setSuppressPublish: (v: boolean) => void
}

function channelName(userId: string): string {
  return `np:${userId}`
}

// Presence entries can pile up when a client reconnects (each join is a new
// entry under the same key until the old one expires). We pick the newest by
// looking at the payload's own `ts` — the host stamps every state with the
// wall-clock at capture. Falls back to array order if `ts` is missing.
function pickHostState(presenceState: Record<string, unknown[]>): NowPlayingState | null {
  let best: NowPlayingState | null = null
  for (const entries of Object.values(presenceState)) {
    for (const raw of entries) {
      const e = raw as { state?: NowPlayingState }
      if (!e?.state) continue
      if (!best || (e.state.ts ?? 0) > (best.ts ?? 0)) best = e.state
    }
  }
  return best
}

// Expose the store to the DevTools console so you can inspect it:
//   window.__listal.social.getState()
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as unknown as { __listal?: Record<string, unknown> }).__listal ??= {}
}

const useSocialImpl = create<SocialState>((set, get) => ({
  meId: null,
  hostChannel: null,
  hostSubscribed: false,
  subs: {},
  friendStates: {},
  lastPublished: null,
  suppressPublish: false,

  setSuppressPublish: (v) => set({ suppressPublish: v }),

  start: (meId) => {
    const existing = get().hostChannel
    if (existing && get().meId === meId) return
    if (existing) {
      void existing.untrack().catch(() => {})
      void existing.unsubscribe()
    }

    dbg('start host channel', meId)
    // The host channel: we join our own np:<meId> and track our state.
    // Friends subscribed to the same channel see presence sync events.
    const ch = supabase.channel(channelName(meId), {
      config: { presence: { key: meId } }
    })
    ch.subscribe((status) => {
      dbg('host status', status)
      if (status === 'SUBSCRIBED') {
        set({ hostSubscribed: true })
        // Re-broadcast whatever we last knew so listeners that joined while we
        // were still subscribing pick up the latest state.
        const last = get().lastPublished
        const payload =
          last ?? {
            track: null,
            positionSec: 0,
            isPlaying: false,
            ts: Date.now()
          }
        set({ lastPublished: payload })
        void ch.track({ state: payload }).then((r) => dbg('track init', r))
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        set({ hostSubscribed: false })
        // Rejoin — Supabase closes idle presence channels sometimes and drops
        // us on rate-limit spikes. Without this the app looks fine but never
        // publishes another update.
        const currentId = get().meId
        if (currentId === meId) {
          dbg('host channel dropped, rejoining in 1.5s', status)
          setTimeout(() => {
            const still = get()
            if (still.meId === meId && still.hostChannel === ch) {
              set({ hostChannel: null })
              get().start(meId)
            }
          }, 1500)
        }
      }
    })

    set({ meId, hostChannel: ch, hostSubscribed: false })
  },

  stop: async () => {
    const { hostChannel, subs } = get()
    if (hostChannel) {
      await hostChannel.untrack().catch(() => {})
      await hostChannel.unsubscribe()
    }
    for (const c of Object.values(subs)) await c.unsubscribe()
    set({
      meId: null,
      hostChannel: null,
      hostSubscribed: false,
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
    dbg('setFriendIds', { want: [...want], current: [...current] })

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
        dbg('friend presence sync', id, presence)
        const state = pickHostState(presence)
        const online = Object.keys(presence).length > 0
        set((s) => ({
          friendStates: {
            ...s.friendStates,
            [id]: { online, state }
          }
        }))
      })
      ch.subscribe((status) => {
        dbg('friend sub status', id, status)
      })
      nextSubs[id] = ch
      nextStates[id] = nextStates[id] ?? { online: false, state: null }
    }

    set({ subs: nextSubs, friendStates: nextStates })
  },

  publish: (state) => {
    const { hostChannel, hostSubscribed, lastPublished } = get()
    const settings = useSettings.getState()
    // Invisible mode: untrack entirely so we don't appear online anywhere.
    if (settings.presenceMode === 'invisible') {
      if (hostChannel) void hostChannel.untrack().catch(() => {})
      set({ lastPublished: null })
      return
    }
    // Attach the current mode + hide-now-playing preference. Friends read
    // these off the payload to render the right status.
    const outgoing: NowPlayingState = {
      ...state,
      track: settings.hideNowPlaying ? null : state.track,
      presenceMode: settings.presenceMode
    }
    const trackChanged = lastPublished?.track?.sourceUrl !== outgoing.track?.sourceUrl
    const playFlipped = !lastPublished || lastPublished.isPlaying !== outgoing.isPlaying
    const modeChanged = lastPublished?.presenceMode !== outgoing.presenceMode
    const important = trackChanged || playFlipped || modeChanged
    if (!important && lastPublished && outgoing.ts - lastPublished.ts < 1500) {
      return
    }
    if (!hostChannel) {
      dbg('publish skipped: no channel')
      return
    }
    set({ lastPublished: outgoing })
    if (!hostSubscribed) {
      dbg('publish queued (not yet subscribed)', outgoing)
      return
    }
    void hostChannel.track({ state: outgoing }).then((r) => dbg('track ack', r))
  }
}))

export const useSocial = useSocialImpl

// React to presence-mode / hide-now-playing changes: republish immediately so
// friends see the switch without waiting for the next tick.
if (typeof window !== 'undefined') {
  let lastMode = useSettings.getState().presenceMode
  let lastHide = useSettings.getState().hideNowPlaying
  useSettings.subscribe((s) => {
    if (s.presenceMode !== lastMode || s.hideNowPlaying !== lastHide) {
      lastMode = s.presenceMode
      lastHide = s.hideNowPlaying
      const last = useSocialImpl.getState().lastPublished
      if (last) {
        useSocialImpl.getState().publish({ ...last, ts: Date.now() })
      } else if (useSocialImpl.getState().hostChannel) {
        useSocialImpl.getState().publish({
          track: null,
          positionSec: 0,
          isPlaying: false,
          ts: Date.now()
        })
      }
    }
  })
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  const w = window as unknown as { __listal?: Record<string, unknown> }
  ;(w.__listal ??= {}).social = useSocialImpl
}
