import { create } from 'zustand'
import {
  setBassDb,
  setMidDb,
  setTrebleDb,
  setReverbAmount
} from '../lib/audioGraph'

interface AudioSettingsState {
  bass: number // dB, -12..+12
  mid: number
  treble: number
  reverb: number // 0..1 wet
  setBass: (v: number) => void
  setMid: (v: number) => void
  setTreble: (v: number) => void
  setReverb: (v: number) => void
  reset: () => void
}

const STORAGE_KEY = 'listal:audioSettings'

function load(): Pick<AudioSettingsState, 'bass' | 'mid' | 'treble' | 'reverb'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { bass: 0, mid: 0, treble: 0, reverb: 0 }
    const p = JSON.parse(raw)
    return {
      bass: numOr(p.bass, 0),
      mid: numOr(p.mid, 0),
      treble: numOr(p.treble, 0),
      reverb: numOr(p.reverb, 0)
    }
  } catch {
    return { bass: 0, mid: 0, treble: 0, reverb: 0 }
  }
}
function save(s: { bass: number; mid: number; treble: number; reverb: number }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
function numOr(v: unknown, d: number): number {
  return typeof v === 'number' && isFinite(v) ? v : d
}

const initial = load()

export const useAudioSettings = create<AudioSettingsState>((set, get) => ({
  ...initial,
  setBass: (v) => {
    setBassDb(v)
    set({ bass: v })
    save({ ...get(), bass: v })
  },
  setMid: (v) => {
    setMidDb(v)
    set({ mid: v })
    save({ ...get(), mid: v })
  },
  setTreble: (v) => {
    setTrebleDb(v)
    set({ treble: v })
    save({ ...get(), treble: v })
  },
  setReverb: (v) => {
    setReverbAmount(v)
    set({ reverb: v })
    save({ ...get(), reverb: v })
  },
  reset: () => {
    setBassDb(0)
    setMidDb(0)
    setTrebleDb(0)
    setReverbAmount(0)
    set({ bass: 0, mid: 0, treble: 0, reverb: 0 })
    save({ bass: 0, mid: 0, treble: 0, reverb: 0 })
  }
}))

// Push saved values into the audio graph on first import so a page reload
// doesn't lose the EQ state.
setBassDb(initial.bass)
setMidDb(initial.mid)
setTrebleDb(initial.treble)
setReverbAmount(initial.reverb)
