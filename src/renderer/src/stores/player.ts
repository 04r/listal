import { create } from 'zustand'
import Hls from 'hls.js'
import type { Track } from '../../../preload'
import { useSocial, type NowPlayingTrack } from './social'
import { useConvoy, queueItemToTrack } from './convoy'
import { attachAudio } from '../lib/audioGraph'

export type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  queue: Track[]
  index: number
  playing: boolean
  loading: boolean
  durationSec: number
  positionSec: number
  volume: number
  error: string | null
  shuffle: boolean
  repeat: RepeatMode

  playQueue: (tracks: Track[], startIndex?: number) => Promise<void>
  toggle: () => void
  next: () => Promise<void>
  prev: () => Promise<void>
  seekTo: (sec: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  playAt: (index: number) => Promise<void>
  removeFromQueue: (index: number) => void
  clearQueue: () => void
}

function pickShuffleIndex(len: number, currentIndex: number): number {
  if (len <= 1) return currentIndex
  let n = Math.floor(Math.random() * (len - 1))
  if (n >= currentIndex) n += 1
  return n
}

// One <audio> for the whole app. hls.js is attached to it when the stream is
// HLS (most SoundCloud tracks), otherwise the URL is assigned directly.
// Howler used to sit here — it can't handle HLS, which meant SoundCloud tracks
// never played.
let audio: HTMLAudioElement | null = null
let hls: Hls | null = null
let rafId: number | null = null
let preMuteVolume = 0.85

function stopRaf(): void {
  if (rafId != null) cancelAnimationFrame(rafId)
  rafId = null
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url)
}

// Tear down whatever is currently playing without triggering `ended`.
function killAudio(): void {
  if (hls) {
    hls.destroy()
    hls = null
  }
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    try {
      audio.load()
    } catch {
      /* ignore */
    }
    audio = null
  }
  stopRaf()
}

export const usePlayer = create<PlayerState>((set, get) => {
  async function loadAndPlay(index: number): Promise<void> {
    const { queue } = get()
    if (index < 0 || index >= queue.length) return
    const track = queue[index]
    set({ loading: true, error: null, index, positionSec: 0, durationSec: 0 })

    // Priority=true so the current-track resolve jumps ahead of any leftover
    // prefetches still queued from the previous song.
    const result = await window.api.resolveStream(track.sourceUrl, true)
    if (!result.ok) {
      set({ loading: false, error: result.error, playing: false })
      return
    }

    killAudio()

    const a = new Audio()
    a.preload = 'auto'
    a.crossOrigin = 'anonymous'
    a.volume = get().volume
    audio = a
    try {
      attachAudio(a)
    } catch (e) {
      console.warn('[player] failed to attach audio graph', e)
    }

    a.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(a.duration)) set({ durationSec: a.duration })
    })
    a.addEventListener('play', () => {
      set({ playing: true, loading: false })
      pushDiscord(track, a.currentTime, true)
      publishSocial(track, a.currentTime, true)
      publishConvoy(track, a.currentTime, true)
      startSocialHeartbeat()
      const tick = (): void => {
        if (!audio) return
        if (!audio.paused) set({ positionSec: audio.currentTime })
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      // Prefetch the next 3 tracks in the background. Main throttles them to
      // 2 yt-dlp processes at a time so this doesn't spike the CPU.
      const s = get()
      for (let i = 1; i <= 3; i++) {
        const upcoming = s.queue[s.index + i]
        if (!upcoming) break
        window.api.resolveStream(upcoming.sourceUrl, false).catch(() => {})
      }
    })
    a.addEventListener('pause', () => {
      // Ignore pauses fired by teardown — audio.src has been cleared.
      if (!audio) return
      set({ playing: false })
      pushDiscord(track, a.currentTime, false)
      publishSocial(track, a.currentTime, false)
      publishConvoy(track, a.currentTime, false)
      stopSocialHeartbeat()
      stopRaf()
    })
    a.addEventListener('ended', () => {
      set({ playing: false })
      stopRaf()
      const s = get()
      if (s.repeat === 'one' && audio) {
        audio.currentTime = 0
        void audio.play()
        return
      }
      void get().next()
    })
    a.addEventListener('error', () => {
      const err = a.error
      const msg = err ? `Playback error (code ${err.code})` : 'Playback error'
      console.error('[player] audio error', err)
      set({ loading: false, error: msg, playing: false })
    })

    const streamUrl = result.data.streamUrl
    if (isHlsUrl(streamUrl) && Hls.isSupported()) {
      // HLS path — SoundCloud, some YouTube live/premiere.
      const h = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Don't cap buffer too tightly — we want smooth playback, not seek-
        // friendliness for a live stream we don't have.
        maxBufferLength: 60
      })
      hls = h
      h.on(Hls.Events.MANIFEST_PARSED, () => {
        void a.play().catch((e) => {
          console.error('[player] hls play() rejected', e)
          set({ loading: false, error: `Play failed: ${String(e)}`, playing: false })
        })
      })
      h.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return
        console.error('[player] hls fatal', data)
        set({
          loading: false,
          error: `Stream error: ${data.details ?? 'unknown'}`,
          playing: false
        })
      })
      h.attachMedia(a)
      h.loadSource(streamUrl)
    } else {
      // Progressive audio — YouTube, Bandcamp, most direct URLs.
      a.src = streamUrl
      void a.play().catch((e) => {
        console.error('[player] play() rejected', e)
        set({ loading: false, error: `Play failed: ${String(e)}`, playing: false })
      })
    }

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
    shuffle: false,
    repeat: 'off' as RepeatMode,

    playQueue: async (tracks, startIndex = 0) => {
      const c = useConvoy.getState()
      if (c.session) {
        // In a Convoy: the local player only ever holds the current track.
        // Everything else goes into the shared queue so every participant
        // sees the same up-next list.
        const first = tracks[startIndex] ?? tracks[0]
        if (!first) return
        const rest = tracks.filter((_, i) => i !== startIndex)
        set({ queue: [first] })
        await loadAndPlay(0)
        if (rest.length > 0) await c.addTracksToQueue(rest)
        return
      }
      set({ queue: tracks })
      await loadAndPlay(startIndex)
    },
    toggle: () => {
      if (!audio) return
      if (audio.paused) void audio.play()
      else audio.pause()
    },
    next: async () => {
      const c = useConvoy.getState()
      if (c.session) {
        const item = await c.advanceQueue()
        if (!item) {
          killAudio()
          set({ playing: false, positionSec: 0 })
          await c.broadcastPlayback({ is_playing: false, current_position_sec: 0 })
          return
        }
        const t = queueItemToTrack(item)
        set({ queue: [t] })
        await loadAndPlay(0)
        return
      }
      const { index, queue, shuffle, repeat } = get()
      if (queue.length === 0) return
      if (shuffle) {
        await loadAndPlay(pickShuffleIndex(queue.length, index))
        return
      }
      if (index + 1 < queue.length) {
        await loadAndPlay(index + 1)
        return
      }
      // End of queue.
      if (repeat === 'all') await loadAndPlay(0)
    },
    prev: async () => {
      const c = useConvoy.getState()
      if (c.session) {
        if (audio) {
          audio.currentTime = 0
          set({ positionSec: 0 })
        }
        return
      }
      const { index, positionSec } = get()
      if (positionSec > 3 && audio) {
        audio.currentTime = 0
        set({ positionSec: 0 })
        return
      }
      if (index > 0) await loadAndPlay(index - 1)
    },
    seekTo: (sec) => {
      if (!audio) return
      audio.currentTime = sec
      set({ positionSec: sec })
      const s = get()
      const track = s.queue[s.index]
      if (track) {
        publishSocial(track, sec, s.playing)
        publishConvoy(track, sec, s.playing)
        pushDiscord(track, sec, s.playing)
      }
    },
    setVolume: (v) => {
      const clamped = Math.max(0, Math.min(1, v))
      set({ volume: clamped })
      if (audio) audio.volume = clamped
    },
    toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

    cycleRepeat: () =>
      set((s) => ({
        repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off'
      })),

    playAt: async (targetIndex) => {
      const { queue } = get()
      if (targetIndex < 0 || targetIndex >= queue.length) return
      await loadAndPlay(targetIndex)
    },

    removeFromQueue: (targetIndex) => {
      const { queue, index } = get()
      if (targetIndex < 0 || targetIndex >= queue.length) return
      // Never remove the currently playing track this way — it would leave us
      // in a weird state where positionSec keeps advancing over nothing.
      if (targetIndex === index) return
      const next = queue.filter((_, i) => i !== targetIndex)
      // If we removed something above the current index, shift the pointer.
      const newIndex = targetIndex < index ? index - 1 : index
      set({ queue: next, index: newIndex })
    },

    clearQueue: () => {
      const { queue, index } = get()
      // Keep the currently playing track so we don't yank audio out from under
      // the user; drop everything else.
      const cur = index >= 0 ? queue[index] : null
      set({ queue: cur ? [cur] : [], index: cur ? 0 : -1 })
    },

    toggleMute: () => {
      const cur = get().volume
      if (cur > 0) {
        preMuteVolume = cur
        set({ volume: 0 })
        if (audio) audio.volume = 0
      } else {
        const restore = preMuteVolume > 0 ? preMuteVolume : 0.85
        set({ volume: restore })
        if (audio) audio.volume = restore
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
      isPlaying,
      sourceUrl: track.sourceUrl
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
  // While listening along, don't re-broadcast the host's state as our own —
  // that creates a feedback loop and floods the channel with duplicates.
  // listenAlong flips this suppression flag when it starts/stops following.
  if (useSocial.getState().suppressPublish) return
  useSocial.getState().publish({
    track: track ? nowPlayingFromTrack(track) : null,
    positionSec,
    isPlaying,
    ts: Date.now()
  })
}

// Mirror local playback into the current Convoy's shared session row so every
// participant follows along. Suppressed while we're applying an incoming
// convoy update, otherwise we'd bounce our own state right back.
let lastConvoyBroadcastAt = 0
function publishConvoy(track: Track | null, positionSec: number, isPlaying: boolean): void {
  const c = useConvoy.getState()
  if (!c.session || c.suppressBroadcast) return
  // Track change and play/pause flips go through immediately; heartbeats and
  // seeks throttle to 1s so we don't spam the DB with UPDATEs.
  const now = Date.now()
  const lastTrack = c.session.current_track_url
  const lastPlaying = c.session.is_playing
  const trackChanged = (track?.sourceUrl ?? null) !== lastTrack
  const playFlipped = isPlaying !== lastPlaying
  if (!trackChanged && !playFlipped && now - lastConvoyBroadcastAt < 1000) return
  lastConvoyBroadcastAt = now
  void c.broadcastTrack(track, positionSec, isPlaying)
}

// Heartbeat the social channel every 2s while playing so listen-along guests
// stay tightly in sync even when nothing else changed. The publish() throttle
// in social.ts stops this from actually hitting the wire faster than 1.5s.
let socialHeartbeat: ReturnType<typeof setInterval> | null = null
function startSocialHeartbeat(): void {
  if (socialHeartbeat) return
  socialHeartbeat = setInterval(() => {
    if (!audio) return
    const s = usePlayer.getState()
    const track = s.queue[s.index]
    if (!track) return
    publishSocial(track, audio.currentTime, !audio.paused)
  }, 2000)
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
