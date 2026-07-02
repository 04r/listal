import RPC from 'discord-rpc'

// Discord application "Listal". Only the client ID is needed for RPC —
// the secret is for OAuth2 (we don't use it here).
const CLIENT_ID = '1521613873847992410'

// We treat Discord as a best-effort sidecar: if Discord isn't running, RPC
// login fails and we just no-op. The track-state IPC must never block on it.
let client: RPC.Client | null = null
let ready = false
let lastActivity: PresenceInput | null = null
let loginAttempted = false
let retryTimer: NodeJS.Timeout | null = null
let enabled = true

export interface PresenceInput {
  title: string
  artist: string | null
  service: string // 'youtube' | 'soundcloud' | 'bandcamp' | etc.
  durationSec: number | null
  positionSec: number
  isPlaying: boolean
  // monotonic wall-clock when the current position was sampled (ms)
  capturedAtMs: number
  // Optional source URL so we can show a "Listen on YouTube" button.
  sourceUrl?: string | null
  // User-customisable templates. Tokens: {title} {artist} {service}. When
  // absent we fall back to the defaults below.
  detailsTemplate?: string
  stateTemplate?: string
}

function scheduleRetry(): void {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    loginAttempted = false
    void initDiscord()
  }, 30_000)
}

export async function initDiscord(): Promise<void> {
  if (!enabled) return
  if (loginAttempted) return
  loginAttempted = true
  try {
    client = new RPC.Client({ transport: 'ipc' })
    client.on('ready', () => {
      ready = true
      console.log('[discord] RPC ready')
      if (lastActivity) applyActivity(lastActivity)
    })
    client.on('disconnected', () => {
      ready = false
      console.warn('[discord] disconnected')
      scheduleRetry()
    })
    await client.login({ clientId: CLIENT_ID })
  } catch (e) {
    console.warn('[discord] login failed (Discord not running?):', (e as Error).message)
    client = null
    ready = false
    scheduleRetry()
  }
}

function applyActivity(p: PresenceInput): void {
  if (!client || !ready) return
  // Discord activity types: 0 Playing, 2 Listening, 3 Watching, 5 Competing.
  // The npm `discord-rpc` package's setActivity() drops any `type` field we
  // pass, so we bypass it and hit request('SET_ACTIVITY') directly with the
  // raw activity object. That's the only way to get the "Listening to" prefix
  // (with headphones icon) instead of "Playing".
  const artistOrSvc = p.artist || serviceLabel(p.service)
  const tokens: Record<string, string> = {
    title: p.title || 'Music',
    artist: artistOrSvc,
    service: serviceLabel(p.service)
  }
  const detailsTpl = p.detailsTemplate?.trim() || '🎧 {title}'
  const stateTpl = p.stateTemplate?.trim() || '{artist}'
  const detailsText = clip(fillTemplate(detailsTpl, tokens), 128) || 'Music'
  let state = clip(fillTemplate(stateTpl, tokens), 128) || artistOrSvc
  if (!p.isPlaying && p.durationSec && p.durationSec > 0) {
    state = clip(
      `${state} · paused ${fmtTime(p.positionSec)} / ${fmtTime(p.durationSec)}`,
      128
    )
  } else if (!p.isPlaying) {
    state = clip(`${state} · paused`, 128)
  }

  const assets: Record<string, string | undefined> = {
    large_image: 'listal',
    large_text: p.durationSec ? `Listal · ${fmtTime(p.durationSec)}` : 'Listal',
    small_image: serviceImage(p.service),
    small_text: serviceLabel(p.service)
  }

  const activity: Record<string, unknown> = {
    // 2 = Listening. Discord uses this for the "Listening to" prefix and the
    // headphones icon in the member list.
    type: 2,
    details: detailsText,
    state,
    assets,
    instance: false
  }
  if (p.isPlaying && p.durationSec && p.durationSec > 0) {
    const startMs = p.capturedAtMs - p.positionSec * 1000
    const endMs = startMs + p.durationSec * 1000
    activity.timestamps = {
      start: Math.floor(startMs / 1000),
      end: Math.floor(endMs / 1000)
    }
  } else if (p.isPlaying) {
    activity.timestamps = {
      start: Math.floor((p.capturedAtMs - p.positionSec * 1000) / 1000)
    }
  }
  if (p.sourceUrl && /^https?:\/\//.test(p.sourceUrl)) {
    activity.buttons = [
      { label: `Listen on ${serviceLabel(p.service)}`, url: p.sourceUrl }
    ]
  }
  const rawClient = client as unknown as {
    request: (cmd: string, args: unknown) => Promise<unknown>
  }
  void rawClient
    .request('SET_ACTIVITY', {
      pid: process.pid,
      activity
    })
    .catch((e) => {
      console.warn('[discord] SET_ACTIVITY error', (e as Error).message)
    })
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function setPresence(p: PresenceInput): void {
  if (!enabled) return
  lastActivity = p
  applyActivity(p)
}

export function clearPresence(): void {
  lastActivity = null
  if (!client || !ready) return
  void client.clearActivity().catch(() => {})
}

// Toggle from the renderer's SettingsDialog checkbox. Turning off tears down
// the existing RPC connection so Discord stops showing Listal in the profile.
// Turning back on kicks off a fresh login attempt.
export function setEnabled(v: boolean): void {
  if (enabled === v) return
  enabled = v
  if (!v) {
    if (client && ready) {
      void client.clearActivity().catch(() => {})
      try {
        void client.destroy()
      } catch {
        /* ignore */
      }
    }
    client = null
    ready = false
    loginAttempted = false
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    return
  }
  // Enabled again — kick off a login. If Discord isn't running the retry
  // loop will handle it.
  void initDiscord()
}

function clip(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function fillTemplate(tpl: string, tokens: Record<string, string>): string {
  return tpl.replace(/\{(title|artist|service)\}/g, (_, k) => tokens[k] ?? '')
}

function serviceLabel(service: string): string {
  switch (service) {
    case 'youtube':
      return 'YouTube'
    case 'soundcloud':
      return 'SoundCloud'
    case 'bandcamp':
      return 'Bandcamp'
    case 'spotify':
      return 'Spotify'
    default:
      return 'Listal'
  }
}

function serviceImage(service: string): string {
  // Asset keys that the user must upload in the Discord developer portal under
  // Rich Presence → Art Assets. Fallback to "listal" if a service one isn't
  // uploaded; Discord just hides unknown keys.
  switch (service) {
    case 'youtube':
      return 'youtube'
    case 'soundcloud':
      return 'soundcloud'
    case 'bandcamp':
      return 'bandcamp'
    case 'spotify':
      return 'spotify'
    default:
      return 'listal'
  }
}
