import { ipcMain } from 'electron'
import {
  connect as spotifyConnect,
  disconnect as spotifyDisconnect,
  isConfigured as spotifyConfigured,
  isConnected as spotifyConnectedFn
} from '../services/spotify'

export interface SpotifyStatus {
  configured: boolean
  connected: boolean
}

export function registerAuthIpc(): void {
  ipcMain.handle(
    'auth:spotifyStatus',
    (): SpotifyStatus => ({
      configured: spotifyConfigured(),
      connected: spotifyConnectedFn()
    })
  )

  ipcMain.handle(
    'auth:spotifyConnect',
    async (): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        await spotifyConnect()
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle('auth:spotifyDisconnect', (): void => {
    spotifyDisconnect()
  })
}
