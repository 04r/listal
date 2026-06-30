import { ipcMain } from 'electron'
import { setPresence, clearPresence, type PresenceInput } from '../services/discord'

export function registerDiscordIpc(): void {
  ipcMain.handle('discord:set', (_e, p: PresenceInput) => {
    setPresence({ ...p, capturedAtMs: Date.now() })
  })
  ipcMain.handle('discord:clear', () => {
    clearPresence()
  })
}
