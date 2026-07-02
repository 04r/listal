import { useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { FloatingWindow } from './FloatingWindow'
import { getAnalyser } from '../lib/audioGraph'

interface Props {
  onClose: () => void
}

type Mode = 'bars' | 'wave' | 'circle'

// Floating audio visualizer that taps the master output. Renders a spectrum,
// a waveform, or a polar bar-graph. Movable + resizable via FloatingWindow.
export function AudioVisualizerPanel({ onClose }: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem('listal:viz:mode')
      if (saved === 'bars' || saved === 'wave' || saved === 'circle') return saved
    } catch {
      /* ignore */
    }
    return 'bars'
  })

  useEffect(() => {
    try {
      localStorage.setItem('listal:viz:mode', mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  return (
    <FloatingWindow
      name="visualizer"
      defaultRect={{ x: 120, y: 140, w: 320, h: 200 }}
      minW={200}
      minH={140}
      onClose={onClose}
      title={
        <>
          <Activity size={11} />
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Visualizer
          </span>
          <span className="ml-auto flex gap-0.5 text-[10px]" data-nodrag>
            <ModeBtn active={mode === 'bars'} onClick={() => setMode('bars')}>
              Bars
            </ModeBtn>
            <ModeBtn active={mode === 'wave'} onClick={() => setMode('wave')}>
              Wave
            </ModeBtn>
            <ModeBtn active={mode === 'circle'} onClick={() => setMode('circle')}>
              Circle
            </ModeBtn>
          </span>
        </>
      }
    >
      <VizCanvas mode={mode} />
    </FloatingWindow>
  )
}

function ModeBtn({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`border border-[var(--color-border-strong)] px-1.5 py-0 uppercase tracking-wider ${
        active
          ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
          : 'bg-[var(--grad-btn)] text-[var(--color-text-muted)] hover:bg-[var(--grad-btn-hover)]'
      }`}
    >
      {children}
    </button>
  )
}

function VizCanvas({ mode }: { mode: Mode }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const analyser = getAnalyser()
    if (!analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const freqBuf = new Uint8Array(analyser.frequencyBinCount)
    const timeBuf = new Uint8Array(analyser.fftSize)

    // ResizeObserver keeps the canvas backing store in sync with its CSS size
    // so the visualisation stays crisp when the window is resized.
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    })
    ro.observe(canvas)

    function accent(): string {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent')
        .trim()
      return v || '#1c5fa9'
    }
    function borderColor(): string {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-border')
        .trim()
      return v || '#c8c8c8'
    }

    function draw(): void {
      const w = canvas!.clientWidth
      const h = canvas!.clientHeight
      ctx!.clearRect(0, 0, w, h)

      if (mode === 'bars') {
        analyser!.getByteFrequencyData(freqBuf)
        const bins = 48
        const per = Math.floor(freqBuf.length / bins)
        const barW = w / bins
        ctx!.fillStyle = accent()
        for (let i = 0; i < bins; i++) {
          let sum = 0
          for (let j = 0; j < per; j++) sum += freqBuf[i * per + j]
          const v = sum / per / 255
          const bh = Math.max(2, v * h)
          ctx!.fillRect(i * barW + 1, h - bh, Math.max(1, barW - 2), bh)
        }
      } else if (mode === 'wave') {
        analyser!.getByteTimeDomainData(timeBuf)
        ctx!.strokeStyle = accent()
        ctx!.lineWidth = 1.5
        ctx!.beginPath()
        const slice = w / timeBuf.length
        for (let i = 0; i < timeBuf.length; i++) {
          const v = timeBuf[i] / 128 - 1
          const y = h / 2 + v * (h / 2 - 4)
          if (i === 0) ctx!.moveTo(i * slice, y)
          else ctx!.lineTo(i * slice, y)
        }
        ctx!.stroke()
        ctx!.strokeStyle = borderColor()
        ctx!.setLineDash([2, 2])
        ctx!.beginPath()
        ctx!.moveTo(0, h / 2)
        ctx!.lineTo(w, h / 2)
        ctx!.stroke()
        ctx!.setLineDash([])
      } else {
        analyser!.getByteFrequencyData(freqBuf)
        const cx = w / 2
        const cy = h / 2
        const r = Math.min(w, h) / 4
        const bins = 64
        const per = Math.floor(freqBuf.length / bins)
        ctx!.strokeStyle = accent()
        ctx!.lineWidth = 2
        for (let i = 0; i < bins; i++) {
          let sum = 0
          for (let j = 0; j < per; j++) sum += freqBuf[i * per + j]
          const v = sum / per / 255
          const angle = (i / bins) * Math.PI * 2 - Math.PI / 2
          const len = 4 + v * Math.min(w, h) * 0.35
          const x1 = cx + Math.cos(angle) * r
          const y1 = cy + Math.sin(angle) * r
          const x2 = cx + Math.cos(angle) * (r + len)
          const y2 = cy + Math.sin(angle) * (r + len)
          ctx!.beginPath()
          ctx!.moveTo(x1, y1)
          ctx!.lineTo(x2, y2)
          ctx!.stroke()
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [mode])

  return <canvas ref={ref} className="block h-full w-full bg-[var(--color-input)]" />
}
