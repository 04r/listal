import { create } from 'zustand'

export type Theme = 'light' | 'dark'
export type PanelSide = 'left' | 'right' | 'hidden'
export type PanelKey = 'friends' | 'convoy' | 'queue' | 'lyrics' | 'chat' | 'rooms'

// Named blocks that can be dragged around the chrome.
export type ToolbarSlot =
  | 'transport'      // stop / play / prev / next
  | 'shuffle-repeat' // shuffle + repeat buttons
  | 'volume'         // volume icon + slider
  | 'timeline'       // position + times
  | 'panel-toggles'  // queue / lyrics / friends / convoy

// Zones a slot can live in. Each zone renders somewhere different on screen.
export type Zone = 'top' | 'bottom' | 'left' | 'right'

interface Settings {
  theme: Theme
  accent: string // hex, applied to --color-accent + related
  panelSides: Record<PanelKey, PanelSide>
  // Ordered list of slots per zone. Empty array = zone doesn't render.
  zoneContents: Record<Zone, ToolbarSlot[]>
  customizeMode: boolean
  discordRpc: boolean // send now-playing to Discord Rich Presence
}

interface SettingsState extends Settings {
  setTheme: (t: Theme) => void
  setAccent: (hex: string) => void
  setPanelSide: (key: PanelKey, side: PanelSide) => void
  setZoneContents: (next: Record<Zone, ToolbarSlot[]>) => void
  moveSlot: (slot: ToolbarSlot, toZone: Zone, beforeSlot: ToolbarSlot | null) => void
  setCustomizeMode: (v: boolean) => void
  setDiscordRpc: (v: boolean) => void
  resetAll: () => void
}

const ALL_SLOTS: ToolbarSlot[] = [
  'transport',
  'shuffle-repeat',
  'volume',
  'timeline',
  'panel-toggles'
]

const DEFAULT_ZONE_CONTENTS: Record<Zone, ToolbarSlot[]> = {
  top: [...ALL_SLOTS],
  bottom: [],
  left: [],
  right: []
}

const STORAGE_KEY = 'listal:settings'

const DEFAULTS: Settings = {
  theme: 'light',
  accent: '#1c5fa9',
  panelSides: {
    friends: 'right',
    convoy: 'right',
    queue: 'right',
    lyrics: 'right',
    chat: 'right',
    rooms: 'right'
  },
  zoneContents: DEFAULT_ZONE_CONTENTS,
  customizeMode: false,
  discordRpc: true
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Settings> & {
      toolbarOrder?: ToolbarSlot[]
    }
    const validSlots = new Set<ToolbarSlot>(ALL_SLOTS)

    // Reconcile zoneContents so every slot appears exactly once across all
    // zones. Handles both migration from the old flat toolbarOrder and slots
    // added in later releases.
    const saved = parsed.zoneContents
    const zc: Record<Zone, ToolbarSlot[]> = { top: [], bottom: [], left: [], right: [] }
    const seen = new Set<ToolbarSlot>()
    if (saved) {
      for (const z of ['top', 'bottom', 'left', 'right'] as Zone[]) {
        const list = Array.isArray(saved[z]) ? saved[z] : []
        for (const s of list) {
          if (validSlots.has(s as ToolbarSlot) && !seen.has(s as ToolbarSlot)) {
            zc[z].push(s as ToolbarSlot)
            seen.add(s as ToolbarSlot)
          }
        }
      }
    } else if (Array.isArray(parsed.toolbarOrder)) {
      // v1 migration: old flat order becomes the top zone.
      for (const s of parsed.toolbarOrder) {
        if (validSlots.has(s) && !seen.has(s)) {
          zc.top.push(s)
          seen.add(s)
        }
      }
    }
    // Any slot not accounted for goes to top.
    for (const s of ALL_SLOTS) {
      if (!seen.has(s)) zc.top.push(s)
    }

    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      accent: typeof parsed.accent === 'string' ? parsed.accent : DEFAULTS.accent,
      panelSides: { ...DEFAULTS.panelSides, ...(parsed.panelSides ?? {}) },
      zoneContents: zc,
      customizeMode: false,
      discordRpc: parsed.discordRpc === false ? false : true
    }
  } catch {
    return DEFAULTS
  }
}

function save(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),

  setTheme: (theme) => {
    set({ theme })
    save({ ...get(), theme })
  },
  setAccent: (accent) => {
    set({ accent })
    save({ ...get(), accent })
  },
  setPanelSide: (key, side) => {
    const panelSides = { ...get().panelSides, [key]: side }
    set({ panelSides })
    save({ ...get(), panelSides })
  },
  setZoneContents: (zoneContents) => {
    set({ zoneContents })
    save({ ...get(), zoneContents })
  },
  moveSlot: (slot, toZone, beforeSlot) => {
    const cur = get().zoneContents
    const next: Record<Zone, ToolbarSlot[]> = {
      top: cur.top.filter((s) => s !== slot),
      bottom: cur.bottom.filter((s) => s !== slot),
      left: cur.left.filter((s) => s !== slot),
      right: cur.right.filter((s) => s !== slot)
    }
    const list = next[toZone]
    if (beforeSlot === null) {
      list.push(slot)
    } else {
      const at = list.indexOf(beforeSlot)
      if (at < 0) list.push(slot)
      else list.splice(at, 0, slot)
    }
    set({ zoneContents: next })
    save({ ...get(), zoneContents: next })
  },
  setCustomizeMode: (customizeMode) => {
    // Not persisted — intentional. See load().
    set({ customizeMode })
  },
  setDiscordRpc: (discordRpc) => {
    set({ discordRpc })
    save({ ...get(), discordRpc })
  },
  resetAll: () => {
    set({ ...DEFAULTS })
    save(DEFAULTS)
  }
}))

// Rough luminance so we can pick a readable foreground for the accent.
function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length !== 6) return 0.5
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const lin = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// Shift a hex toward black or white. Used for hover-tints of the accent.
function shift(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const nums = [0, 1, 2].map((i) => {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16)
    const next = Math.max(0, Math.min(255, v + amt))
    return next.toString(16).padStart(2, '0')
  })
  return `#${nums.join('')}`
}

// Applies the theme + accent to <html>. Called from App.tsx.
export function applySettingsToDom(s: Pick<Settings, 'theme' | 'accent'>): void {
  const root = document.documentElement
  root.setAttribute('data-theme', s.theme)
  root.style.setProperty('--color-accent', s.accent)
  root.style.setProperty('--color-accent-hover', shift(s.accent, s.theme === 'dark' ? 20 : -20))
  root.style.setProperty('--color-row-current', s.accent)
  root.style.setProperty('--color-link', s.theme === 'dark' ? shift(s.accent, 40) : s.accent)
  root.style.setProperty(
    '--color-accent-fg',
    relativeLuminance(s.accent) > 0.5 ? '#000000' : '#ffffff'
  )
  root.style.setProperty(
    '--color-row-current-fg',
    relativeLuminance(s.accent) > 0.5 ? '#000000' : '#ffffff'
  )
  // Ask main to retint the native window-controls overlay.
  try {
    ;(window as unknown as {
      electron?: { ipcRenderer: { send: (ch: string, ...args: unknown[]) => void } }
    }).electron?.ipcRenderer.send('window:set-theme', s.theme === 'dark')
  } catch {
    /* ignore */
  }
}
