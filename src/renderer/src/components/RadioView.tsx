import { useEffect, useMemo, useState } from 'react'
import { Loader2, Play, Radio, Plus, ExternalLink } from 'lucide-react'
import type { SearchResult, Track } from '../../../preload'
import { usePlayer } from '../stores/player'
import { ContentSurface } from './LibraryView'

const PAGE_SIZE = 20

interface Props {
  seedUrl: string
  seedTitle: string
}

// Similar-songs browser fed by YouTube's own mix (list=RD<id>). Paginated so
// the user can scan through 20 at a time instead of dumping ~50 into the queue
// blind. Chosic-style browse experience.
export function RadioView({ seedUrl, seedTitle }: Props): React.JSX.Element {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [extending, setExtending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const playQueue = usePlayer((s) => s.playQueue)
  const currentUrl = usePlayer((s) => (s.index >= 0 ? s.queue[s.index]?.sourceUrl : null))

  useEffect(() => {
    let cancelled = false
    setResults([])
    setPage(0)
    setError(null)
    setLoading(true)
    window.api
      .songRadio(seedUrl)
      .then((r) => {
        if (cancelled) return
        if (r.length === 0) setError('No mix available for this track.')
        setResults(r)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [seedUrl])

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const pageResults = useMemo(
    () => results.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [results, page]
  )

  function toTrack(r: SearchResult, i: number): Track {
    return {
      id: -1 - i,
      service: r.service,
      serviceId: r.sourceUrl,
      sourceUrl: r.sourceUrl,
      title: r.title,
      artist: r.uploader,
      durationMs: r.durationSec ? Math.round(r.durationSec * 1000) : null,
      thumbnailUrl: r.thumbnail,
      addedAt: Date.now()
    }
  }

  async function playAll(): Promise<void> {
    if (results.length === 0) return
    await playQueue(results.map(toTrack), 0)
  }

  async function playOne(r: SearchResult): Promise<void> {
    await playQueue([toTrack(r, 0)], 0)
  }

  // Extend by chaining a new mix from the last result. YouTube mixes are
  // finite (~25-50 per URL); this stitches on another one so the user can
  // keep exploring.
  async function loadMore(): Promise<void> {
    const last = results[results.length - 1]
    if (!last) return
    setExtending(true)
    try {
      const more = await window.api.songRadio(last.sourceUrl)
      // Drop duplicates we already have.
      const known = new Set(results.map((r) => r.sourceUrl))
      const fresh = more.filter((r) => !known.has(r.sourceUrl))
      setResults((prev) => [...prev, ...fresh])
    } finally {
      setExtending(false)
    }
  }

  const hasMore = page < totalPages - 1

  return (
    <ContentSurface>
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-2 text-[11px]">
        <Radio size={11} />
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Song Radio
        </span>
        <span className="truncate font-semibold text-[var(--color-text)]">{seedTitle}</span>
        <span className="text-[var(--color-text-dim)]">
          {results.length > 0 && `${results.length} similar`}
        </span>
        <button
          onClick={() => void playAll()}
          disabled={results.length === 0}
          className="ml-auto flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-2 py-0.5 text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-40"
        >
          <Play size={10} fill="currentColor" />
          Play all
        </button>
      </div>

      {error && (
        <div className="border-b border-[var(--color-border)] bg-red-500/10 px-3 py-1 text-[11px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-[var(--color-text-muted)]">
          <Loader2 size={12} className="animate-spin" />
          Building radio from {seedTitle}…
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="sticky top-0 z-10 grid grid-cols-[40px_50px_1fr_220px_60px_60px] items-center gap-2 border-b border-[var(--color-border-strong)] bg-[var(--grad-header)] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <span className="text-right">#</span>
            <span></span>
            <span>Title</span>
            <span>Uploader</span>
            <span className="text-right">Time</span>
            <span></span>
          </div>

          {pageResults.map((r, i) => {
            const absoluteIdx = page * PAGE_SIZE + i
            const isCurrent = r.sourceUrl === currentUrl
            return (
              <div
                key={`${r.sourceUrl}-${absoluteIdx}`}
                onDoubleClick={() => void playOne(r)}
                className={`group grid h-10 grid-cols-[40px_50px_1fr_220px_60px_60px] items-center gap-2 border-b border-[var(--color-border)]/40 px-2 text-[12px] ${
                  isCurrent
                    ? 'bg-[var(--color-row-current)] text-[var(--color-row-current-fg)]'
                    : 'hover:bg-[var(--color-surface-3)]'
                }`}
              >
                <span
                  className={`text-right tabular-nums ${
                    isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {absoluteIdx + 1}
                </span>
                {r.thumbnail ? (
                  <img
                    src={r.thumbnail}
                    alt=""
                    className="h-8 w-8 border border-[var(--color-border)] object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 border border-[var(--color-border)] bg-[var(--color-surface)]" />
                )}
                <span className="truncate">{r.title}</span>
                <span
                  className={`truncate ${
                    isCurrent ? 'text-white/80' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {r.uploader ?? '—'}
                </span>
                <span
                  className={`text-right tabular-nums ${
                    isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {fmt(r.durationSec)}
                </span>
                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => void playOne(r)}
                    title="Play now"
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
                  >
                    <Play size={9} fill="currentColor" />
                  </button>
                  <button
                    onClick={() => {
                      const s = usePlayer.getState()
                      s.playQueue([...s.queue, toTrack(r, absoluteIdx)], s.index >= 0 ? s.index : 0)
                    }}
                    title="Add to queue"
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
                  >
                    <Plus size={10} />
                  </button>
                  <button
                    onClick={() =>
                      window.electron.ipcRenderer.send('open-external', r.sourceUrl)
                    }
                    title="Open source"
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  >
                    <ExternalLink size={10} />
                  </button>
                </div>
              </div>
            )
          })}

          <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--grad-header)] px-2 py-1 text-[11px]">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 hover:bg-[var(--grad-btn-hover)] disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-[var(--color-text-muted)]">
              Page {page + 1} / {totalPages}
            </span>
            {hasMore ? (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 hover:bg-[var(--grad-btn-hover)]"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={() => void loadMore()}
                disabled={extending}
                className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 hover:bg-[var(--grad-btn-hover)] disabled:opacity-40"
              >
                {extending && <Loader2 size={10} className="animate-spin" />}
                Load more →
              </button>
            )}
          </div>
        </>
      )}
    </ContentSurface>
  )
}

function fmt(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
