import { useEffect, useMemo, useRef } from 'react'
import { Loader2, X, Mic2 } from 'lucide-react'
import { usePlayer } from '../stores/player'
import { useLyrics } from '../stores/lyrics'

interface Props {
  onClose: () => void
}

const SOURCE_LABEL: Record<string, string> = {
  lrclib: 'LRCLIB',
  netease: 'NetEase',
  qq: 'QQ Music',
  kugou: 'Kugou',
  genius: 'Genius',
  'lyrics.ovh': 'lyrics.ovh'
}

export function LyricsPanel({ onClose }: Props): React.JSX.Element {
  const track = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : null))
  const positionSec = usePlayer((s) => s.positionSec)
  const durationSec = usePlayer((s) => s.durationSec)
  const seekTo = usePlayer((s) => s.seekTo)

  // Fetching happens in App.tsx on track change; we just render.
  const lyrics = useLyrics((s) => s.data)
  const loading = useLyrics((s) => s.loading)
  const error = useLyrics((s) => s.error)

  // Find the index of the line that should currently be highlighted.
  const synced = lyrics?.synced ?? null
  const positionMs = Math.round(positionSec * 1000)
  const activeIndex = useMemo(() => {
    if (!synced || synced.length === 0) return -1
    // Last line whose start <= position. Simple linear scan; lyrics rarely
    // exceed a few hundred lines.
    let idx = -1
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].tMs <= positionMs) idx = i
      else break
    }
    return idx
  }, [synced, positionMs])

  // Auto-scroll the active line into view.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<Array<HTMLDivElement | null>>([])
  useEffect(() => {
    if (activeIndex < 0) return
    const el = lineRefs.current[activeIndex]
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex])

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-shell)]">
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]">
        <Mic2 size={11} />
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Lyrics
        </span>
        {lyrics?.source && (
          <span className="text-[var(--color-text-dim)]">
            via {SOURCE_LABEL[lyrics.source]}
            {lyrics.synced ? ' · synced' : ' · plain'}
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          aria-label="Close lyrics"
        >
          <X size={12} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 text-[14px] leading-snug">
        {!track && (
          <div className="text-[11px] text-[var(--color-text-muted)]">
            Pick a track to see lyrics.
          </div>
        )}
        {track && loading && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
            <Loader2 size={12} className="animate-spin" />
            Looking up lyrics for {track.title}…
          </div>
        )}
        {track && !loading && error && (
          <div className="text-[11px] text-[var(--color-danger)]">{error}</div>
        )}
        {track && !loading && lyrics && lyrics.instrumental && (
          <div className="text-center text-[12px] text-[var(--color-text-muted)]">
            ♪ Instrumental ♪
          </div>
        )}
        {track && !loading && lyrics && !lyrics.found && (
          <div className="text-[11px] text-[var(--color-text-muted)]">
            No lyrics found across LRCLIB, NetEase, QQ Music, Kugou, Genius, or lyrics.ovh for{' '}
            <span className="text-[var(--color-text)]">{track.title}</span>.
          </div>
        )}

        {/* Synced — Spotify-style, click to seek */}
        {synced && synced.length > 0 && (
          <div className="space-y-2.5">
            {synced.map((line, i) => {
              const isActive = i === activeIndex
              const isPast = i < activeIndex
              return (
                <div
                  key={`${line.tMs}-${i}`}
                  ref={(el) => {
                    lineRefs.current[i] = el
                  }}
                  onClick={() => seekTo(line.tMs / 1000)}
                  className={`cursor-pointer transition-colors ${
                    isActive
                      ? 'text-[15px] font-bold text-[var(--color-accent)]'
                      : isPast
                        ? 'text-[var(--color-text-dim)]'
                        : 'text-[var(--color-text)] hover:text-[var(--color-accent)]'
                  }`}
                  title={fmtStamp(line.tMs)}
                >
                  {line.text}
                </div>
              )
            })}
          </div>
        )}

        {/* Plain only */}
        {!synced && lyrics?.plain && (
          <pre className="whitespace-pre-wrap font-sans text-[13px] text-[var(--color-text)]">
            {lyrics.plain}
          </pre>
        )}
      </div>

      {synced && track && durationSec > 0 && (
        <div className="flex h-6 items-center justify-between border-t border-[var(--color-border)] bg-[var(--grad-header-strong)] px-2 text-[10.5px] text-[var(--color-text-muted)]">
          <span>{synced.length} lines</span>
          <span>{lyrics?.trackName ?? track.title}</span>
        </div>
      )}
    </aside>
  )
}

function fmtStamp(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
