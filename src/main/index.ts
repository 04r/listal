import { app, shell, BrowserWindow, session, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Second-account testing hook. Set LISTAL_PROFILE=<name> before launching a
// second dev instance and it gets its own userData dir → its own localStorage
// → its own Supabase session. Lets you run two accounts side by side without
// signing in and out.
const profileName = process.env.LISTAL_PROFILE
if (profileName && /^[a-zA-Z0-9_-]{1,32}$/.test(profileName)) {
  const base = app.getPath('userData')
  app.setPath('userData', `${base}-${profileName}`)
  console.log('[listal] using isolated profile', profileName, 'at', app.getPath('userData'))
}
import icon from '../../resources/icon.png?asset'
import { registerPlaybackIpc } from './ipc/playback'
import { registerLibraryIpc } from './ipc/library'
import { registerAuthIpc } from './ipc/auth'
import { registerLyricsIpc } from './ipc/lyrics'
import { registerDiscordIpc } from './ipc/discord'
import { initDiscord } from './services/discord'
import { registerUpdater } from './services/updater'

// CDN URLs from yt-dlp need an originating Referer to be willing to stream.
// We rewrite headers for known streaming hosts before they leave the renderer.
function installStreamingHeaderShim(): void {
  const HOSTS: Array<[RegExp, { referer: string; origin: string }]> = [
    [/\.googlevideo\.com$/, { referer: 'https://www.youtube.com/', origin: 'https://www.youtube.com' }],
    [/\.sndcdn\.com$/, { referer: 'https://soundcloud.com/', origin: 'https://soundcloud.com' }],
    [/\.bcbits\.com$/, { referer: 'https://bandcamp.com/', origin: 'https://bandcamp.com' }]
  ]
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    try {
      const host = new URL(details.url).hostname
      const match = HOSTS.find(([re]) => re.test(host))
      if (match) {
        const [, { referer, origin }] = match
        details.requestHeaders['Referer'] = referer
        details.requestHeaders['Origin'] = origin
      }
    } catch {
      /* ignore */
    }
    cb({ requestHeaders: details.requestHeaders })
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 920,
    minHeight: 600,
    show: false,
    backgroundColor: '#ececec',
    title: 'Listal',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#e6e6e6', symbolColor: '#000000', height: 28 },
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.listal.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  installStreamingHeaderShim()
  registerPlaybackIpc()
  registerLibraryIpc()
  registerAuthIpc()
  registerLyricsIpc()
  registerDiscordIpc()
  void initDiscord()
  registerUpdater()
  ipcMain.on('open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  // Renderer pings us when the theme changes so we can retint the native
  // window-controls overlay that lives outside the WebContents.
  ipcMain.on('window:set-theme', (_e, isDark: boolean) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.setTitleBarOverlay({
          color: isDark ? '#1e1e1e' : '#e6e6e6',
          symbolColor: isDark ? '#eaeaea' : '#000000'
        })
        win.setBackgroundColor(isDark ? '#1c1c1c' : '#ececec')
      } catch {
        /* not on Windows or not a titleBarOverlay window */
      }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
