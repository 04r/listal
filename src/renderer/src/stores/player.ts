import { create } from 'zustand'
import { Howl } from 'howler'
import type { Track } from '../../../preload'
import { useSocial, type NowPlayingTrack } from './social'

interface PlayerState {
  queue: Track[]
  index: number
  playing: boolean
  loading: boolean
  durationSec: number
  positionSec: number
  volume: number
  error: string | null

  playQueue: (tracks: Track[], startIndex?: number) => Promise<void>
  toggle: () => void
  next: () => Promise<void>
  prev: () => Promise<void>
  seekTo: (sec: number) => void
  setVolume: (v: number) => void
  // Toggle mute. Snapshots the pre-mute level on the way down and restores
  // exactly that level on the way up — never the hardcoded default.
  toggleMute: () => void
}

// Module-scope so a single Howl owns the actual audio element; the store only
// reflects its state. Avoids the "two Howls fighting" problem under React
// re-renders.
let howl: Howl | null = null
let rafId: number | null = null
// Remembered pre-mute volume. Persists across track changes — once the user
// mutes from 0.7, hitting unmute brings them back to 0.7 even three songs later.
let preMuteVolume = 0.85

function stopRaf(): void {
  if (rafId != null) cancelAnimationFrame(rafId)
  rafId = null
}

export const usePlayer = create<PlayerState>((set, get) => {
  async function loadAndPlay(index: number): Promise<void> {
    const { queue } = get()
    if (index < 0 || index >= queue.length) return
    const track = queue[index]
    set({ loading: true, error: null, index, positionSec: 0, durationSec: 0 })

    const result = await window.api.resolveStream(track.sourceUrl)
    if (!result.ok) {
      set({ loading: false, error: result.error, playing: false })
      return
    }

    howl?.unload()
    stopRaf()

    const h = new Howl({
      src: [result.data.streamUrl],
      html5: true,
      format: ['mp4', 'm4a', 'webm', 'mp3', 'ogg'],
      volume: get().volume,
      onload: () => set({ durationSec: h.duration() }),
      onplay: () => {
        set({ playing: true, loading: false })
        pushDiscord(track, howl?.seek() as number ?? 0, true)
        publishSocial(track, howl?.seek() as number ?? 0, true)
        startSocialHeartbeat()
        const tick = (): void => {
          if (!howl) return
          if (howl.playing()) {
            set({ positionSec: howl.seek() as number })
            rafId = requestAnimationFrame(tick)
          }
        }
        rafId = requestAnimationFrame(tick)
        // Warm the next track's stream URL so skipping forward is instant.
        const s = get()
        const upcoming = s.queue[s.index + 1]
        if (upcoming) {
          window.api.resolveStream(upcoming.sourceUrl).catch(() => {
            /* prefetch errors are silent; we'll surface them at real play time */
          })
        }
      },
      onpause: () => {
        set({ playing: false })
        pushDiscord(track, howl?.seek() as number ?? 0, false)
        publishSocial(track, howl?.seek() as number ?? 0, false)
        stopSocialHeartbeat()
        stopRaf()
      },
      onstop: () => {
        set({ playing: false, positionSec: 0 })
        window.api.clearDiscordPresence().catch(() => {})
        publishSocial(null, 0, false)
        stopSocialHeartbeat()
        stopRaf()
      },
      onend: () => {
        set({ playing: false })
        stopRaf()
        void get().next()
      },
      onloaderror: (_id, err) => {
        console.error('[player] load error', err)
        set({ loading: false, error: `Load failed: ${String(err)}`, playing: false })
      },
      onplayerror: (_id, err) => {
        console.error('[player] play error', err)
        set({ loading: false, error: `Play failed: ${String(err)}`, playing: false })
      }
    })
    howl = h
    h.play()
    updateMediaSession(track)
  }

  return {
    queue: [],
    index: -1,
    playing: false,
    loading: false,
    durationSec: 0,
    positionSec: 0,
    volume: 0.85,
    error: null,

    playQueue: async (tracks, startIndex = 0) => {
      set({ queue: tracks })
      await loadAndPlay(startIndex)
    },
    toggle: () => {
      if (!howl) return
      if (howl.playing()) howl.pause()
      else howl.play()
    },
    next: async () => {
      const { index, queue } = get()
      if (index + 1 < queue.length) await loadAndPlay(index + 1)
    },
    prev: async () => {
      const { index, positionSec } = get()
      // Mirror Spotify: if we're more than 3s in, restart this track instead.
      if (positionSec > 3 && howl) {
        howl.seek(0)
        set({ positionSec: 0 })
        return
      }
      if (index > 0) await loadAndPlay(index - 1)
    },
    seekTo: (sec) => {
      if (!howl) return
      howl.seek(sec)
      set({ positionSec: sec })
      const s = get()
      const track = s.queue[s.index]
      if (track) publishSocial(track, sec, s.playing)
    },
    setVolume: (v) => {
      const clamped = Math.max(0, Math.min(1, v))
      set({ volume: clamped })
      howl?.volume(clamped)
    },
    toggleMute: () => {
      const cur = get().volume
      if (cur > 0) {
        preMuteVolume = cur
        set({ volume: 0 })
        howl?.volume(0)
      } else {
        // If preMuteVolume itself was 0 (shouldn't happen normally), pop up to
        // a sane audible level so the click does something visible.
        const restore = preMuteVolume > 0 ? preMuteVolume : 0.85
        set({ volume: restore })
        howl?.volume(restore)
      }
    }
  }
})

function pushDiscord(track: Track, positionSec: number, isPlaying: boolean): void {
  // Best-effort fire-and-forget. Discord may not be running.
  window.api
    .setDiscordPresence({
      title: track.title,
      artist: track.artist ?? null,
      service: track.service,
      durationSec: track.durationMs ? track.durationMs / 1000 : null,
      positionSec,
      isPlaying
    })
    .catch(() => {})
}

function nowPlayingFromTrack(t: Track): NowPlayingTrack {
  return {
    title: t.title,
    artist: t.artist ?? null,
    sourceUrl: t.sourceUrl,
    service: t.service,
    thumbnailUrl: t.thumbnailUrl ?? null,
    durationSec: t.durationMs ? t.durationMs / 1000 : null
  }
}

function publishSocial(track: Track | null, positionSec: number, isPlaying: boolean): void {
  useSocial.getState().publish({
    track: track ? nowPlayingFromTrack(track) : null,
    positionSec,
    isPlaying,
    ts: Date.now()
  })
}

// Heartbeat the social channel every 4s while playing so listen-along guests
// stay tightly in sync even when nothing else changed.
let socialHeartbeat: ReturnType<typeof setInterval> | null = null
function startSocialHeartbeat(): void {
  if (socialHeartbeat) return
  socialHeartbeat = setInterval(() => {
    if (!howl) return
    const s = usePlayer.getState()
    const track = s.queue[s.index]
    if (!track) return
    publishSocial(track, howl.seek() as number, howl.playing())
  }, 4000)
}
function stopSocialHeartbeat(): void {
  if (socialHeartbeat) clearInterval(socialHeartbeat)
  socialHeartbeat = null
}

function updateMediaSession(track: Track): void {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist ?? '',
    artwork: track.thumbnailUrl ? [{ src: track.thumbnailUrl }] : []
  })
  navigator.mediaSession.setActionHandler('play', () => usePlayer.getState().toggle())
  navigator.mediaSession.setActionHandler('pause', () => usePlayer.getState().toggle())
  navigator.mediaSession.setActionHandler('previoustrack', () => void usePlayer.getState().prev())
  navigator.mediaSession.setActionHandler('nexttrack', () => void usePlayer.getState().next())
}
