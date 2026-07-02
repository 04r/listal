import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { useAudioSettings } from '../stores/audioSettings'
import { FloatingWindow } from './FloatingWindow'

interface Props {
  onClose: () => void
}

// Floating audio-controls window: 3-band EQ, reverb wet, and a live curve
// so users get visual feedback as they push sliders.
export function AudioSettingsPanel({ onClose }: Props): React.JSX.Element {
  const bass = useAudioSettings((s) => s.bass)
  const mid = useAudioSettings((s) => s.mid)
  const treble = useAudioSettings((s) => s.treble)
  const reverb = useAudioSettings((s) => s.reverb)
  const setBass = useAudioSettings((s) => s.setBass)
  const setMid = useAudioSettings((s) => s.setMid)
  const setTreble = useAudioSettings((s) => s.setTreble)
  const setReverb = useAudioSettings((s) => s.setReverb)
  const reset = useAudioSettings((s) => s.reset)

  return (
    <FloatingWindow
      name="audio"
      defaultRect={{
        x: Math.max(60, Math.floor(window.innerWidth / 2) - 170),
        y: 120,
        w: 340,
        h: 340
      }}
      minW={280}
      minH={280}
      title={
        <>
          <SlidersHorizontal size={11} />
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Audio
          </span>
        </>
      }
      onClose={onClose}
    >
      <div className="flex h-full flex-col overflow-y-auto p-3 text-[11.5px]">
        <EqCurve bass={bass} mid={mid} treble={treble} />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Slider label="Bass" unit="dB" min={-12} max={12} step={0.5} value={bass} onChange={setBass} />
          <Slider label="Mid" unit="dB" min={-12} max={12} step={0.5} value={mid} onChange={setMid} />
          <Slider label="Treble" unit="dB" min={-12} max={12} step={0.5} value={treble} onChange={setTreble} />
        </div>
        <div className="mt-3">
          <Slider label="Reverb" unit="%" min={0} max={100} step={1} value={reverb * 100} onChange={(n) => setReverb(n / 100)} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={reset}
            className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-1 text-[11px] hover:bg-[var(--grad-btn-hover)]"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        </div>
      </div>
    </FloatingWindow>
  )
}

function Slider({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange
}: {
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="tabular-nums text-[10.5px] text-[var(--color-text)]">
          {value.toFixed(unit === '%' ? 0 : 1)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}

// Draws a rough approximation of the current EQ curve — a sum of three
// gaussian bumps centred on the bass / mid / treble bands.
function EqCurve({
  bass,
  mid,
  treble
}: {
  bass: number
  mid: number
  treble: number
}): React.JSX.Element {
  const W = 300
  const H = 80
  const bands = [
    { x: W * 0.15, g: bass },
    { x: W * 0.5, g: mid },
    { x: W * 0.85, g: treble }
  ]
  function y(px: number): number {
    let sum = 0
    for (const b of bands) {
      const s = 60
      sum += b.g * Math.exp(-((px - b.x) ** 2) / (2 * s * s))
    }
    return H / 2 - (sum / 12) * (H / 2)
  }
  let d = ''
  for (let px = 0; px <= W; px += 2) {
    d += (px === 0 ? 'M' : 'L') + px + ',' + y(px).toFixed(1) + ' '
  }
  return (
    <div className="border border-[var(--color-border-strong)] bg-[var(--color-input)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[80px] w-full">
        <line
          x1={0}
          x2={W}
          y1={H / 2}
          y2={H / 2}
          stroke="var(--color-border)"
          strokeDasharray="2 2"
        />
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
      </svg>
    </div>
  )
}
