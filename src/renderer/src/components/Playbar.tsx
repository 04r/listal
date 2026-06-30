import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Loader2,
  Shuffle,
  Repeat,
  ListMusic,
  Mic2
} from 'lucide-react'
import { usePlayer } from '../stores/player'

interface Props {
  rightPanelOpen: boolean
  onToggleRightPanel: () => void
}

export function Playbar({ rightPanelOpen, onToggleRightPanel }: Props): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.loading)
  const durationSec = usePlayer((s) => s.durationSec)
  const positionSec = usePlayer((s) => s.positionSec)
  const volume = usePlayer((s) => s.volume)
  const error = usePlayer((s) => s.error)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seekTo = usePlayer((s) => s.seekTo)
  const setVolume = usePlayer((s) => s.setVolume)

  const track = index >= 0 ? queue[index] : null
  const hasNext = index >= 0 && index + 1 < queue.length
  const hasPrev = index > 0
  const canPlay = !!track

  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="grid h-[88px] grid-cols-[1fr_auto_1fr] items-center gap-4 bg-black px-4 py-2">
      {/* Track info */}
      <div className="flex min-w-0 items-center gap-3">
        {track?.thumbnailUrl ? (
          <img
            src={track.thumbnailUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded bg-[var(--color-surface-2)]" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {track?.title ?? 'Nothing playing'}
          </div>
          <div className="truncate text-xs text-[var(--color-text-muted)] hover:underline">
            {track?.artist ?? (error ? error : 'Pick a track to start')}
          </div>
        </div>
      </div>

      {/* Transport */}
      <div className="flex w-[600px] max-w-[60vw] flex-col items-center gap-2">
        <div className="flex items-center gap-4">
          <button
            disabled
            className="text-[var(--color-text-muted)] opacity-60"
            aria-label="Shuffle"
            title="Shuffle (soon)"
          >
            <Shuffle size={16} />
          </button>
          <button
            onClick={() => void prev()}
            disabled={!hasPrev}
            className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
            aria-label="Previous"
          >
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button
            onClick={toggle}
            disabled={!canPlay}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : playing ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" className="translate-x-[1px]" />
            )}
          </button>
          <button
            onClick={() => void next()}
            disabled={!hasNext}
            className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
            aria-label="Next"
          >
            <SkipForward size={18} fill="currentColor" />
          </button>
          <button
            disabled
            className="text-[var(--color-text-muted)] opacity-60"
            aria-label="Repeat"
            title="Repeat (soon)"
          >
            <Repeat size={16} />
          </button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span className="w-9 text-right text-[11px] text-[var(--color-text-muted)] tabular-nums">
            {fmt(positionSec)}
          </span>
          <Scrubber
            value={positionSec}
            max={durationSec}
            onSeek={seekTo}
            disabled={!canPlay || durationSec <= 0}
          />
          <span className="w-9 text-[11px] text-[var(--color-text-muted)] tabular-nums">
            {fmt(durationSec)}
          </span>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center justify-end gap-3 pr-2 text-[var(--color-text-muted)]">
        <button
          disabled
          title="Lyrics (soon)"
          className="opacity-60 hover:text-[var(--color-text)]"
        >
          <Mic2 size={16} />
        </button>
        <button
          onClick={onToggleRightPanel}
          title="Now playing view"
          className={`hover:text-[var(--color-text)] ${rightPanelOpen ? 'text-[var(--color-accent)]' : ''}`}
        >
          <ListMusic size={16} />
        </button>
        <button
          onClick={() => setVolume(volume > 0 ? 0 : 0.85)}
          className="hover:text-[var(--color-text)]"
          aria-label={volume > 0 ? 'Mute' : 'Unmute'}
        >
          <VolIcon size={16} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24"
        />
      </div>
    </footer>
  )
}

function Scrubber({
  value,
  max,
  onSeek,
  disabled
}: {
  value: number
  max: number
  onSeek: (n: number) => void
  disabled: boolean
}): React.JSX.Element {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="group relative h-4 flex-1">
      <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-[var(--color-surface-3)]">
        <div
          className="h-full rounded-full bg-[var(--color-text-muted)] group-hover:bg-[var(--color-accent)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={max || 1}
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="absolute inset-0 h-full w-full opacity-0 disabled:cursor-not-allowed"
        style={{ pointerEvents: disabled ? 'none' : 'auto' }}
      />
    </div>
  )
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
