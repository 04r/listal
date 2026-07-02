import { useEffect, useRef } from 'react'
import { getAnalyser } from '../lib/audioGraph'

// Tiny bar-graph visualiser that sits inline in the toolbar's transport row.
// Reads the same AnalyserNode the big AudioVisualizerPanel uses. When nothing
// is playing the analyser reports zeros so the bars flatten on their own.
export function CompactVisualizer({
  width = 80,
  height = 16
}: {
  width?: number
  height?: number
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const analyser = getAnalyser()
    if (!analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const buf = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0

    function accent(): string {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent')
        .trim()
      return v || '#1c5fa9'
    }

    function draw(): void {
      analyser!.getByteFrequencyData(buf)
      ctx!.clearRect(0, 0, width, height)
      const bins = 24
      const per = Math.floor(buf.length / 4 / bins) // bias toward lower bands
      const gap = 1
      const barW = (width - gap * (bins - 1)) / bins
      ctx!.fillStyle = accent()
      for (let i = 0; i < bins; i++) {
        let sum = 0
        for (let j = 0; j < per; j++) sum += buf[i * per + j]
        const v = sum / per / 255
        const bh = Math.max(1, v * height)
        ctx!.fillRect(i * (barW + gap), height - bh, barW, bh)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height])
  return (
    <canvas
      ref={ref}
      style={{ width, height }}
      className="shrink-0 rounded-sm bg-black/10"
    />
  )
}
