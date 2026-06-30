import { usePlayer } from '../stores/player'

// Bottom 1-line status strip, foobar-style:
//   AAC | 192 kbps | 44100 Hz | stereo | 2:14 / 4:21
//
// We don't actually know the bitrate/format because Howler hides them, so we
// inline the source service + queue progress instead.
export function StatusBar(): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playing = usePlayer((s) => s.playing)
  const durationSec = usePlayer((s) => s.durationSec)
  const positionSec = usePlayer((s) => s.positionSec)
  const error = usePlayer((s) => s.error)

  const track = index >= 0 ? queue[index] : null

  const segments: string[] = []
  if (track) {
    segments.push(playing ? 'Playing' : 'Paused')
    segments.push(track.service.toUpperCase())
    segments.push(track.artist ?? '—')
    segments.push(track.title)
    segments.push(`${fmt(positionSec)} / ${fmt(durationSec)}`)
    if (queue.length > 1) segments.push(`${index + 1} / ${queue.length}`)
  } else if (error) {
    segments.push(error)
  } else {
    segments.push('Stopped')
  }

  return (
    <div
      className={`flex h-6 shrink-0 items-center gap-2 border-t border-[var(--color-border-strong)] bg-[linear-gradient(#f0f0f0,#e0e0e0)] px-2 text-[11px] ${
        error ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'
      }`}
    >
      {segments.map((s, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-[var(--color-text-dim)]">|</span>}
          <span className="truncate">{s}</span>
        </span>
      ))}
    </div>
  )
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
