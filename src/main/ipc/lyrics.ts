import { ipcMain } from 'electron'
import { fetchLyrics, type LyricsResult } from '../services/lyrics'

export function registerLyricsIpc(): void {
  ipcMain.handle(
    'lyrics:fetch',
    async (
      _e,
      artist: string,
      title: string,
      durationSec: number | null
    ): Promise<{ ok: true; data: LyricsResult } | { ok: false; error: string }> => {
      try {
        const data = await fetchLyrics(artist, title, durationSec)
        return { ok: true, data }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )
}

export type { LyricsResult }
