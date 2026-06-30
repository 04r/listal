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

export interface PresenceInput {
  title: string
  artist: string | null
  service: string // 'youtube' | 'soundcloud' | 'bandcamp' | etc.
  durationSec: number | null
  positionSec: number
  isPlaying: boolean
  // monotonic wall-clock when the current position was sampled (ms)
  capturedAtMs: number
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
  // The library's types don't yet expose `type` so we cast.
  const activity: Record<string, unknown> = {
    type: 2,
    details: clip(p.title, 128) || 'Music',
    state: clip(p.artist || serviceLabel(p.service), 128),
    largeImageKey: 'listal',
    largeImageText: 'Listal',
    smallImageKey: serviceImage(p.service),
    smallImageText: serviceLabel(p.service),
    instance: false
  }
  if (p.isPlaying && p.durationSec && p.durationSec > 0) {
    // Anchor the timeline to the moment we sampled the position so Discord's
    // own clock shows a clean countdown.
    const startMs = p.capturedAtMs - p.positionSec * 1000
    const endMs = startMs + p.durationSec * 1000
    activity.startTimestamp = Math.floor(startMs / 1000)
    activity.endTimestamp = Math.floor(endMs / 1000)
  } else if (p.isPlaying) {
    activity.startTimestamp = Math.floor((p.capturedAtMs - p.positionSec * 1000) / 1000)
  }
  void client.setActivity(activity as RPC.Presence).catch((e) => {
    console.warn('[discord] setActivity error', (e as Error).message)
  })
}

export function setPresence(p: PresenceInput): void {
  lastActivity = p
  applyActivity(p)
}

export function clearPresence(): void {
  lastActivity = null
  if (!client || !ready) return
  void client.clearActivity().catch(() => {})
}

function clip(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
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
