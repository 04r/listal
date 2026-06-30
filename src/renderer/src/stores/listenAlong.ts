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
}

const SYNC_THRESHOLD_SEC = 2.5

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

function projectHostPosition(s: NowPlayingState): number {
  // Where the host is right now, assuming clocks roughly agree.
  const elapsedSec = (Date.now() - s.ts) / 1000
  return s.isPlaying ? Math.max(0, s.positionSec + elapsedSec) : s.positionSec
}

async function applyHostState(state: NowPlayingState): Promise<void> {
  if (!state.track) return
  const store = useListenAlong.getState()
  if (store.busy) return

  const player = usePlayer.getState()
  const current = player.queue[player.index]
  const sameSource = current?.sourceUrl === state.track.sourceUrl
  const target = projectHostPosition(state)

  if (!sameSource) {
    useListenAlong.setState({ busy: true })
    try {
      await player.playQueue([syntheticTrack(state)], 0)
      // The player needs a moment after load before seek is reliable.
      await new Promise((r) => setTimeout(r, 350))
      const cur = usePlayer.getState()
      cur.seekTo(Math.min(target, cur.durationSec || target))
      if (!state.isPlaying && cur.playing) cur.toggle()
    } finally {
      useListenAlong.setState({ busy: false })
    }
    return
  }

  if (Math.abs(player.positionSec - target) > SYNC_THRESHOLD_SEC) {
    player.seekTo(target)
  }
  if (state.isPlaying !== player.playing) {
    player.toggle()
  }
}

export const useListenAlong = create<ListenAlongState>((set, get) => ({
  hostId: null,
  unsubFn: null,
  busy: false,

  follow: (hostId) => {
    get().stop()
    const initial = useSocial.getState().friendStates[hostId]?.state ?? null
    if (initial) void applyHostState(initial)
    // React to every social-store change. We diff inside so we only act when
    // *this* host's state changed.
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
    set({ hostId: null, unsubFn: null, busy: false })
  }
}))
