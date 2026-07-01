import { ipcMain } from 'electron'
import { resolveStream, type ResolvedStream } from '../services/ytdlp'

export type ResolveStreamResult =
  | { ok: true; data: ResolvedStream }
  | { ok: false; error: string }

export function registerPlaybackIpc(): void {
  ipcMain.handle(
    'playback:resolve',
    async (_evt, url: string, priority = false): Promise<ResolveStreamResult> => {
      try {
        const data = await resolveStream(url, priority)
        return { ok: true, data }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )
}
