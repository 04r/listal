import { create } from 'zustand'
import type { LyricsResult } from '../../../preload'

// The lyrics store lives outside <LyricsPanel> so we can fetch the moment a
// track changes, whether the panel is open or not. When the user finally
// opens the panel it's already there.

interface LyricsState {
  currentUrl: string | null
  data: LyricsResult | null
  loading: boolean
  error: string | null
  fetchFor: (track: {
    sourceUrl: string
    title: string
    artist: string | null
    durationMs: number | null
  } | null) => void
}

const cache = new Map<string, LyricsResult>()

export const useLyrics = create<LyricsState>((set, get) => ({
  currentUrl: null,
  data: null,
  loading: false,
  error: null,

  fetchFor: (track) => {
    if (!track) {
      set({ currentUrl: null, data: null, loading: false, error: null })
      return
    }
    const key = track.sourceUrl
    if (get().currentUrl === key) return // already fetched / fetching
    const cached = cache.get(key)
    if (cached) {
      set({ currentUrl: key, data: cached, loading: false, error: null })
      return
    }
    set({ currentUrl: key, data: null, loading: true, error: null })
    const artist = (track.artist ?? '').replace(/\s*[-–—]\s*topic\s*$/i, '').trim()
    const dur = track.durationMs ? Math.round(track.durationMs / 1000) : null
    window.api
      .getLyrics(artist, track.title, dur)
      .then((r) => {
        // If the user skipped past this track while we were fetching, drop it.
        if (get().currentUrl !== key) return
        if (r.ok) {
          cache.set(key, r.data)
          set({ data: r.data, loading: false })
        } else {
          set({ error: r.error, loading: false })
        }
      })
      .catch((e) => {
        if (get().currentUrl !== key) return
        set({ error: (e as Error).message, loading: false })
      })
  }
}))
