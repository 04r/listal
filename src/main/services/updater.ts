import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

// Wires electron-updater to GitHub Releases (see electron-builder.yml publish:
// provider). Flow:
//   1. On startup we call checkForUpdates().
//   2. If a newer version exists, download in the background.
//   3. When the download finishes, prompt the user to restart now or later.
//   4. Renderer can also trigger a manual check via IPC 'updater:check'.
//
// We only run in packaged builds. The dev main process can also drive it
// against a dev-app-update.yml for local testing, but that's opt-in via the
// FORCE_UPDATE_CHECK env var so we don't spam the API during normal dev.
export function registerUpdater(): void {
  const enabled = app.isPackaged || process.env.FORCE_UPDATE_CHECK === '1'
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('error', (err) => {
    console.error('[updater] error', err?.message ?? err)
    broadcast('updater:status', { kind: 'error', message: String(err?.message ?? err) })
  })
  autoUpdater.on('checking-for-update', () => {
    broadcast('updater:status', { kind: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    broadcast('updater:status', { kind: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    broadcast('updater:status', { kind: 'up-to-date', version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    broadcast('updater:status', {
      kind: 'downloading',
      percent: Math.round(p.percent),
      bps: Math.round(p.bytesPerSecond)
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    broadcast('updater:status', { kind: 'downloaded', version: info.version })
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) {
      // No window; just install on next quit.
      return
    }
    void dialog
      .showMessageBox(win, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Listal ${info.version} is ready to install.`,
        detail: 'Restart the app now to apply the update, or wait until you close it.'
      })
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall()
      })
  })

  ipcMain.handle('updater:check', async () => {
    if (!enabled) return { ok: false, error: 'Updates only run in packaged builds.' }
    try {
      const r = await autoUpdater.checkForUpdates()
      return { ok: true, version: r?.updateInfo?.version ?? null }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall()
  })

  if (enabled) {
    // First check ~5s after launch so we don't fight the initial render.
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => {
        console.error('[updater] initial check failed', e)
      })
    }, 5000)

    // Poll every 6 hours in case the app stays open.
    setInterval(
      () => {
        autoUpdater.checkForUpdates().catch((e) => {
          console.error('[updater] periodic check failed', e)
        })
      },
      6 * 60 * 60 * 1000
    )
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
