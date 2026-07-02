import { create } from 'zustand'

export type PanelKey =
  | 'lyrics'
  | 'convoy'
  | 'friends'
  | 'queue'
  | 'rooms'
  | 'chat'
export type PanelMode = 'dock' | 'float'

interface PanelModeState {
  modes: Record<PanelKey, PanelMode>
  heights: Record<PanelKey, number> // px, only relevant when docked at top
  columnWidth: number // right stacked-panel column width, px
  set: (k: PanelKey, m: PanelMode) => void
  setHeight: (k: PanelKey, px: number) => void
  setColumnWidth: (px: number) => void
}

const ALL_KEYS: PanelKey[] = ['lyrics', 'convoy', 'friends', 'queue', 'rooms', 'chat']

const STORAGE_KEY = 'listal:panelModes'

interface Stored {
  modes: Record<PanelKey, PanelMode>
  heights: Record<PanelKey, number>
  columnWidth: number
}

function defaults(): Stored {
  const modes: Record<PanelKey, PanelMode> = {} as Record<PanelKey, PanelMode>
  const heights: Record<PanelKey, number> = {} as Record<PanelKey, number>
  for (const k of ALL_KEYS) {
    modes[k] = 'dock'
    heights[k] = 260
  }
  return { modes, heights, columnWidth: 320 }
}

function load(): Stored {
  const d = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return d
    const p = JSON.parse(raw)
    const modes = { ...d.modes }
    const heights = { ...d.heights }
    for (const k of ALL_KEYS) {
      if (p.modes?.[k] === 'float') modes[k] = 'float'
      if (typeof p.heights?.[k] === 'number') heights[k] = p.heights[k]
    }
    return {
      modes,
      heights,
      columnWidth: typeof p.columnWidth === 'number' ? p.columnWidth : d.columnWidth
    }
  } catch {
    return d
  }
}

function save(s: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const initial = load()

export const usePanelMode = create<PanelModeState>((set, get) => ({
  modes: initial.modes,
  heights: initial.heights,
  columnWidth: initial.columnWidth,
  set: (k, m) => {
    const modes = { ...get().modes, [k]: m }
    set({ modes })
    save({ modes, heights: get().heights, columnWidth: get().columnWidth })
  },
  setHeight: (k, px) => {
    const heights = { ...get().heights, [k]: Math.max(120, Math.min(800, px)) }
    set({ heights })
    save({ modes: get().modes, heights, columnWidth: get().columnWidth })
  },
  setColumnWidth: (px) => {
    const columnWidth = Math.max(220, Math.min(600, px))
    set({ columnWidth })
    save({ modes: get().modes, heights: get().heights, columnWidth })
  }
}))
