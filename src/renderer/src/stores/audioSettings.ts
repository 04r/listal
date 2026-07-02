import { create } from 'zustand'
import {
  setBassDb,
  setMidDb,
  setTrebleDb,
  setReverbAmount
} from '../lib/audioGraph'

export interface EqValues {
  bass: number
  mid: number
  treble: number
  reverb: number
}

interface AudioSettingsState extends EqValues {
  presets: Record<string, EqValues>
  activePreset: string | null

  setBass: (v: number) => void
  setMid: (v: number) => void
  setTreble: (v: number) => void
  setReverb: (v: number) => void
  reset: () => void

  savePreset: (name: string) => void
  loadPreset: (name: string) => void
  deletePreset: (name: string) => void
  renamePreset: (from: string, to: string) => void
}

const STORAGE_KEY = 'listal:audioSettings'

interface StoredShape extends EqValues {
  presets?: Record<string, EqValues>
  activePreset?: string | null
}

// Ships as sensible starting points. Users can overwrite any of them with
// their own tuning, or add fresh ones.
const BUILT_IN_PRESETS: Record<string, EqValues> = {
  Flat: { bass: 0, mid: 0, treble: 0, reverb: 0 },
  'Bass boost': { bass: 6, mid: 0, treble: 0, reverb: 0 },
  'Vocal boost': { bass: -2, mid: 4, treble: 2, reverb: 0 },
  Warm: { bass: 3, mid: 0, treble: -2, reverb: 0.15 },
  Bright: { bass: -1, mid: 0, treble: 5, reverb: 0 },
  Hall: { bass: 1, mid: 0, treble: 1, reverb: 0.45 }
}

function loadStored(): StoredShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { bass: 0, mid: 0, treble: 0, reverb: 0 }
    const p = JSON.parse(raw)
    const clean: StoredShape = {
      bass: numOr(p.bass, 0),
      mid: numOr(p.mid, 0),
      treble: numOr(p.treble, 0),
      reverb: numOr(p.reverb, 0),
      activePreset: typeof p.activePreset === 'string' ? p.activePreset : null,
      presets: {}
    }
    if (p.presets && typeof p.presets === 'object') {
      for (const [k, v] of Object.entries(p.presets as Record<string, unknown>)) {
        if (!v || typeof v !== 'object') continue
        const vo = v as Partial<EqValues>
        clean.presets![k] = {
          bass: numOr(vo.bass, 0),
          mid: numOr(vo.mid, 0),
          treble: numOr(vo.treble, 0),
          reverb: numOr(vo.reverb, 0)
        }
      }
    }
    return clean
  } catch {
    return { bass: 0, mid: 0, treble: 0, reverb: 0 }
  }
}

function save(s: StoredShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

function numOr(v: unknown, d: number): number {
  return typeof v === 'number' && isFinite(v) ? v : d
}

const stored = loadStored()

// Merge built-ins with user-saved presets, preferring user's overrides.
const initialPresets: Record<string, EqValues> = {
  ...BUILT_IN_PRESETS,
  ...(stored.presets ?? {})
}

function pushToGraph(v: EqValues): void {
  setBassDb(v.bass)
  setMidDb(v.mid)
  setTrebleDb(v.treble)
  setReverbAmount(v.reverb)
}

export const useAudioSettings = create<AudioSettingsState>((set, get) => ({
  bass: stored.bass,
  mid: stored.mid,
  treble: stored.treble,
  reverb: stored.reverb,
  presets: initialPresets,
  activePreset: stored.activePreset ?? null,

  setBass: (v) => {
    setBassDb(v)
    set({ bass: v, activePreset: null })
    save(snapshot(get()))
  },
  setMid: (v) => {
    setMidDb(v)
    set({ mid: v, activePreset: null })
    save(snapshot(get()))
  },
  setTreble: (v) => {
    setTrebleDb(v)
    set({ treble: v, activePreset: null })
    save(snapshot(get()))
  },
  setReverb: (v) => {
    setReverbAmount(v)
    set({ reverb: v, activePreset: null })
    save(snapshot(get()))
  },
  reset: () => {
    const zero = { bass: 0, mid: 0, treble: 0, reverb: 0 }
    pushToGraph(zero)
    set({ ...zero, activePreset: null })
    save(snapshot(get()))
  },

  savePreset: (name) => {
    const n = name.trim()
    if (!n) return
    const cur: EqValues = {
      bass: get().bass,
      mid: get().mid,
      treble: get().treble,
      reverb: get().reverb
    }
    const presets = { ...get().presets, [n]: cur }
    set({ presets, activePreset: n })
    save(snapshot(get()))
  },
  loadPreset: (name) => {
    const p = get().presets[name]
    if (!p) return
    pushToGraph(p)
    set({ ...p, activePreset: name })
    save(snapshot(get()))
  },
  deletePreset: (name) => {
    // Built-ins can be overwritten but not deleted. Deleting a user preset
    // just drops it and clears activePreset if it was pointing at it.
    const presets = { ...get().presets }
    if (BUILT_IN_PRESETS[name]) {
      // Restore the built-in.
      presets[name] = { ...BUILT_IN_PRESETS[name] }
    } else {
      delete presets[name]
    }
    const activePreset = get().activePreset === name ? null : get().activePreset
    set({ presets, activePreset })
    save(snapshot(get()))
  },
  renamePreset: (from, to) => {
    const t = to.trim()
    if (!t || !get().presets[from]) return
    const presets = { ...get().presets }
    presets[t] = presets[from]
    if (from !== t) delete presets[from]
    const activePreset = get().activePreset === from ? t : get().activePreset
    set({ presets, activePreset })
    save(snapshot(get()))
  }
}))

function snapshot(s: AudioSettingsState): StoredShape {
  return {
    bass: s.bass,
    mid: s.mid,
    treble: s.treble,
    reverb: s.reverb,
    presets: s.presets,
    activePreset: s.activePreset
  }
}

// Push saved values into the audio graph on first import so a page reload
// doesn't lose the EQ state.
pushToGraph({
  bass: stored.bass,
  mid: stored.mid,
  treble: stored.treble,
  reverb: stored.reverb
})

export function builtInPresetNames(): string[] {
  return Object.keys(BUILT_IN_PRESETS)
}
