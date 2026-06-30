import { useRef } from 'react'
import { Play, Trash2, ExternalLink } from 'lucide-react'
import type { Track } from '../../../preload'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'

// Module-scope set so prefetches survive remounts and dedupe across views.
const prefetched = new Set<string>()
function maybePrefetch(sourceUrl: string): void {
  if (prefetched.has(sourceUrl)) return
  prefetched.add(sourceUrl)
  // Fire-and-forget. resolveStream is idempotent + cached on the main side.
  window.api.resolveStream(sourceUrl).catch(() => {
    prefetched.delete(sourceUrl)
  })
}

interface Props {
  tracks: Track[]
  onPlay: (index: number) => void
  onRemove?: (track: Track) => void
}

export function TrackList({ tracks, onPlay, onRemove }: Props): React.JSX.Element {
  const currentTrack = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : null))
  const playing = usePlayer((s) => s.playing)
  const setView = useLibrary((s) => s.setView)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onRowEnter(url: string): void {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => maybePrefetch(url), 200)
  }
  function onRowLeave(): void {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }

  return (
    <div>
      {/* Column header */}
      <div className="sticky top-0 z-10 grid grid-cols-[40px_1fr_220px_140px_60px_28px] items-center gap-2 border-b border-[var(--color-border-strong)] bg-[linear-gradient(#f0f0f0,#e6e6e6)] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        <span className="text-right">#</span>
        <span>Title</span>
        <span>Uploader</span>
        <span>Service</span>
        <span className="text-right">Time</span>
        <span></span>
      </div>

      {tracks.map((t, i) => {
        const isCurrent = currentTrack?.id === t.id
        return (
          <div
            key={t.id}
            onDoubleClick={() => onPlay(i)}
            onMouseEnter={() => onRowEnter(t.sourceUrl)}
            onMouseLeave={onRowLeave}
            className={`group grid h-6 grid-cols-[40px_1fr_220px_140px_60px_28px] items-center gap-2 border-b border-[var(--color-border)]/40 px-2 text-[12px] ${
              isCurrent
                ? 'bg-[var(--color-row-current)] text-[var(--color-row-current-fg)]'
                : 'hover:bg-[var(--color-surface-3)]'
            }`}
          >
            <div className="grid place-items-center">
              <span
                className={`text-right tabular-nums group-hover:hidden ${
                  isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'
                }`}
              >
                {isCurrent && playing ? '▶' : i + 1}
              </span>
              <button
                onClick={() => onPlay(i)}
                className={`hidden group-hover:block ${
                  isCurrent ? 'text-white' : 'text-[var(--color-text)]'
                }`}
                aria-label={`Play ${t.title}`}
              >
                <Play size={10} fill="currentColor" />
              </button>
            </div>

            <span className="truncate">{t.title}</span>

            <span className="truncate">
              {t.artist ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setView({ kind: 'uploader', name: cleanArtist(t.artist as string) })
                  }}
                  className={`hover:underline ${
                    isCurrent ? 'text-white' : 'text-[var(--color-link)]'
                  }`}
                  title={`Browse ${cleanArtist(t.artist)}'s uploads`}
                >
                  {cleanArtist(t.artist)}
                </button>
              ) : (
                <span className="text-[var(--color-text-dim)]">—</span>
              )}
            </span>

            <span className={`truncate ${isCurrent ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`}>
              {t.service}
            </span>

            <span className={`text-right tabular-nums ${isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'}`}>
              {fmt(t.durationMs)}
            </span>

            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
              <button
                onClick={() => window.electron.ipcRenderer.send('open-external', t.sourceUrl)}
                title="Open source"
                className={isCurrent ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}
              >
                <ExternalLink size={11} />
              </button>
              {onRemove && (
                <button
                  onClick={() => onRemove(t)}
                  title="Remove"
                  className={isCurrent ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-danger)]'}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {tracks.length === 0 && (
        <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">
          Nothing here yet.
        </div>
      )}
    </div>
  )
}

export function TrackListEmpty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">{children}</div>
  )
}

function cleanArtist(name: string): string {
  return name.replace(/\s*[-–—]\s*topic\s*$/i, '').trim()
}

function fmt(ms: number | null): string {
  if (ms == null) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
