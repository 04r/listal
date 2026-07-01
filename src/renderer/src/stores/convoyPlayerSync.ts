import { useConvoy, type ConvoySession } from './convoy'
import { usePlayer } from './player'
import type { Track } from '../../../preload'

// Watches the Convoy session for changes and mirrors them into the local
// player. Runs the whole time a Convoy is active. Broadcast suppression is
// flipped while we apply state so player events don't bounce right back into
// the DB.
//
// Separated from convoy.ts so we don't create a circular import with
// player.ts (player.ts imports convoy for broadcasting).

const SYNC_THRESHOLD_SEC = 1.5

function sessionToTrack(s: ConvoySession): Track | null {
  if (!s.current_track_url) return null
  return {
    id: -1,
    service: s.current_track_service ?? 'youtube',
    serviceId: s.current_track_url,
    sourceUrl: s.current_track_url,
    title: s.current_track_title ?? 'Unknown',
    artist: s.current_track_artist,
    durationMs: s.current_track_duration_sec
      ? Math.round(s.current_track_duration_sec * 1000)
      : null,
    thumbnailUrl: s.current_track_thumbnail,
    addedAt: Date.now()
  }
}

function projectedPosition(s: ConvoySession): number {
  const elapsedSec = (Date.now() - new Date(s.position_ts).getTime()) / 1000
  return s.is_playing ? Math.max(0, s.current_position_sec + elapsedSec) : s.current_position_sec
}

// Prevent overlapping applies. Without this, an in-flight playQueue could be
// interrupted by another subscribe firing (from setSuppress, loadParticipants,
// etc.), spawning duplicate Howler instances and blowing up memory.
let applying = false

async function applySession(next: ConvoySession, prev: ConvoySession | null): Promise<void> {
  if (applying) return
  applying = true
  const player = usePlayer.getState()
  const currentLocal = player.queue[player.index]
  const trackChanged = next.current_track_url !== prev?.current_track_url
  const localMissingCorrectTrack =
    next.current_track_url && currentLocal?.sourceUrl !== next.current_track_url

  useConvoy.getState().setSuppress(true)
  try {
    // 1) Different track than what we're playing — load it.
    if (trackChanged || localMissingCorrectTrack) {
      const t = sessionToTrack(next)
      if (t) {
        await player.playQueue([t], 0)
        // Give Howler a moment before seeking.
        await new Promise((r) => setTimeout(r, 350))
        const p = usePlayer.getState()
        const target = projectedPosition(next)
        p.seekTo(Math.min(target, p.durationSec || target))
        if (!next.is_playing && p.playing) p.toggle()
      }
      return
    }

    // 2) Play/pause flipped — mirror.
    if (prev && next.is_playing !== prev.is_playing) {
      if (next.is_playing !== player.playing) player.toggle()
    }

    // 3) Position update (someone else seeked or wall-clock drift). Only
    //    seek if the gap is real, otherwise the player would micro-stutter
    //    every heartbeat.
    if (prev && next.position_ts !== prev.position_ts) {
      const target = projectedPosition(next)
      if (Math.abs(player.positionSec - target) > SYNC_THRESHOLD_SEC) {
        player.seekTo(target)
      }
    }
  } finally {
    // Small delay so player events triggered above settle before we allow
    // outgoing broadcasts again.
    setTimeout(() => useConvoy.getState().setSuppress(false), 150)
    applying = false
  }
}

let unsub: (() => void) | null = null

export function startConvoyPlayerSync(): void {
  if (unsub) return
  let lastSession: ConvoySession | null = null
  unsub = useConvoy.subscribe((state) => {
    const s = state.session
    if (!s) {
      lastSession = null
      return
    }
    // Bail if the session reference hasn't changed. Every set() in the convoy
    // store (participants, queue, suppressBroadcast, meId) fires this
    // callback — without this guard we'd re-run applySession dozens of times
    // a second and pin the CPU.
    if (s === lastSession) return
    const prev = lastSession && lastSession.id === s.id ? lastSession : null
    lastSession = s
    void applySession(s, prev)
  })
}

export function stopConvoyPlayerSync(): void {
  if (unsub) {
    unsub()
    unsub = null
  }
}
