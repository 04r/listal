import { create } from 'zustand'

export type PanelKey = 'lyrics' | 'convoy'
export type PanelMode = 'dock' | 'float'

interface PanelModeState {
  modes: Record<PanelKey, PanelMode>
  heights: Record<PanelKey, number> // px, only relevant when docked
  set: (k: PanelKey, m: PanelMode) => void
  setHeight: (k: PanelKey, px: number) => void
}

const STORAGE_KEY = 'listal:panelModes'

function load(): { modes: Record<PanelKey, PanelMode>; heights: Record<PanelKey, number> } {
  const defaults = {
    modes: { lyrics: 'dock' as PanelMode, convoy: 'dock' as PanelMode },
    heights: { lyrics: 260, convoy: 260 }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const p = JSON.parse(raw)
    return {
      modes: {
        lyrics: p.modes?.lyrics === 'float' ? 'float' : 'dock',
        convoy: p.modes?.convoy === 'float' ? 'float' : 'dock'
      },
      heights: {
        lyrics: typeof p.heights?.lyrics === 'number' ? p.heights.lyrics : 260,
        convoy: typeof p.heights?.convoy === 'number' ? p.heights.convoy : 260
      }
    }
  } catch {
    return defaults
  }
}

function save(s: { modes: Record<PanelKey, PanelMode>; heights: Record<PanelKey, number> }): void {
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
  set: (k, m) => {
    const modes = { ...get().modes, [k]: m }
    set({ modes })
    save({ modes, heights: get().heights })
  },
  setHeight: (k, px) => {
    const heights = { ...get().heights, [k]: Math.max(120, Math.min(800, px)) }
    set({ heights })
    save({ modes: get().modes, heights })
  }
}))
