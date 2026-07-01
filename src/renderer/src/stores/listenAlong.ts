import { create } from 'zustand'
import { useSocial, type NowPlayingState } from './social'
import { usePlayer } from './player'
import type { Track } from '../../../preload'

interface ListenAlongState {
  hostId: string | null
  unsubFn: (() => void) | null
  // While we're loading the host's new track, ignore further sync attempts so
  // we don't fight ourselves.
  busy: boolean
  follow: (hostId: string) => void
  stop: () => void
  resync: () => void
}

// The host's own audio is the source of truth; we hop onto their timeline once
// at the start of a track and then just let our local playback ride. We only
// re-seek when we can tell the host actually seeked (position jumped vs. the
// projected wall-clock), not on every heartbeat — that's what caused the
// audible micro-stutter every few seconds.
const HOST_SEEK_JUMP_SEC = 2.5

// Track the last state we've seen from this host across `applyHostState`
// calls, keyed inside the closure — one host at a time so a module-scope var
// is fine.
let lastAppliedState: NowPlayingState | null = null

function syntheticTrack(s: NowPlayingState): Track {
  if (!s.track) throw new Error('syntheticTrack called without a track')
  return {
    id: -1,
    service: s.track.service,
    serviceId: s.track.sourceUrl,
    sourceUrl: s.track.sourceUrl,
    title: s.track.title,
    artist: s.track.artist,
    durationMs: s.track.durationSec ? Math.round(s.track.durationSec * 1000) : null,
    thumbnailUrl: s.track.thumbnailUrl,
    addedAt: Date.now()
  }
}

function projectPosition(s: NowPlayingState, atMs: number): number {
  const elapsedSec = (atMs - s.ts) / 1000
  return s.isPlaying ? Math.max(0, s.positionSec + elapsedSec) : s.positionSec
}

async function applyHostState(state: NowPlayingState, opts: { force?: boolean } = {}): Promise<void> {
  if (!state.track) return
  const store = useListenAlong.getState()
  if (store.busy) return

  const player = usePlayer.getState()
  const current = player.queue[player.index]
  const sameSource = current?.sourceUrl === state.track.sourceUrl

  // 1) New track → load + seek to host position. Always.
  if (!sameSource) {
    useListenAlong.setState({ busy: true })
    try {
      await player.playQueue([syntheticTrack(state)], 0)
      // The player needs a moment after load before seek is reliable.
      await new Promise((r) => setTimeout(r, 350))
      const cur = usePlayer.getState()
      const target = projectPosition(state, Date.now())
      cur.seekTo(Math.min(target, cur.durationSec || target))
      if (!state.isPlaying && cur.playing) cur.toggle()
      lastAppliedState = state
    } finally {
      useListenAlong.setState({ busy: false })
    }
    return
  }

  // 2) Play/pause flipped → mirror. Don't reseek — Howler's pause preserves position.
  if (state.isPlaying !== player.playing) {
    player.toggle()
    lastAppliedState = state
    return
  }

  // 3) Explicit resync request — trust the host's number, seek there.
  if (opts.force) {
    const target = projectPosition(state, Date.now())
    player.seekTo(target)
    lastAppliedState = state
    return
  }

  // 4) Otherwise, only correct if the host clearly seeked. We compare the new
  //    state's position to what we'd expect if the host had just kept playing
  //    since the last state we saw. Small differences (network jitter, clock
  //    skew) get ignored — that's what was causing the "stutter every 2s".
  if (lastAppliedState) {
    const expected = projectPosition(lastAppliedState, state.ts)
    const jumped = Math.abs(state.positionSec - expected) > HOST_SEEK_JUMP_SEC
    if (jumped) {
      const target = projectPosition(state, Date.now())
      player.seekTo(target)
    }
  }
  lastAppliedState = state
}

export const useListenAlong = create<ListenAlongState>((set, get) => ({
  hostId: null,
  unsubFn: null,
  busy: false,

  follow: (hostId) => {
    get().stop()
    useSocial.getState().setSuppressPublish(true)
    lastAppliedState = null
    const initial = useSocial.getState().friendStates[hostId]?.state ?? null
    if (initial) void applyHostState(initial)
    const unsub = useSocial.subscribe((s, prev) => {
      if (get().hostId !== hostId) return
      const cur = s.friendStates[hostId]?.state ?? null
      const old = prev.friendStates[hostId]?.state ?? null
      if (cur && cur !== old) void applyHostState(cur)
    })
    set({ hostId, unsubFn: unsub })
  },

  stop: () => {
    const fn = get().unsubFn
    if (fn) fn()
    useSocial.getState().setSuppressPublish(false)
    lastAppliedState = null
    set({ hostId: null, unsubFn: null, busy: false })
  },

  resync: () => {
    const { hostId } = get()
    if (!hostId) return
    const state = useSocial.getState().friendStates[hostId]?.state ?? null
    if (state) void applyHostState(state, { force: true })
  }
}))
