import { useEffect, useMemo, useState } from 'react'
import { Play, Loader2, ExternalLink } from 'lucide-react'
import type { UploaderUploads, Track, ArtistTrack } from '../../../preload'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'
import { ContentSurface } from './LibraryView'

type SortKey = 'default' | 'title' | 'duration_desc' | 'duration_asc'
const PAGE_SIZE = 30

interface Props {
  name: string
}

// Shows what a specific YouTube uploader (channel) has posted. Used when the
// user clicks the "Uploader" column on a track row — those uploaders are often
// fan channels / re-uploaders / single-artist aggregators, not the artist
// themselves, so they get a more channel-browse view rather than the
// MusicBrainz canonical discography ArtistView produces.
export function UploaderView({ name }: Props): React.JSX.Element {
  const [data, setData] = useState<UploaderUploads | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyUrl, setBusyUrl] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('default')
  const [page, setPage] = useState(0)
  const playQueue = usePlayer((s) => s.playQueue)
  const playing = usePlayer((s) => s.playing)
  const currentUrl = usePlayer((s) => (s.index >= 0 ? s.queue[s.index]?.sourceUrl : null))
  const bump = useLibrary((s) => s.bump)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setPage(0)
    setSort('default')
    setLoading(true)
    setError(null)
    window.api
      .getUploaderUploads(name)
      .then((r) => {
        if (cancelled) return
        if (r.ok) setData(r.data)
        else setError(r.error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const sortedTracks = useMemo<ArtistTrack[]>(() => {
    if (!data) return []
    const arr = [...data.tracks]
    if (sort === 'title') {
      arr.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sort === 'duration_desc') {
      arr.sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0))
    } else if (sort === 'duration_asc') {
      arr.sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity))
    }
    return arr
  }, [data, sort])

  const totalPages = Math.max(1, Math.ceil(sortedTracks.length / PAGE_SIZE))
  const pageTracks = useMemo(
    () => sortedTracks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [sortedTracks, page]
  )

  async function playOne(sourceUrl: string): Promise<void> {
    setBusyUrl(sourceUrl)
    try {
      const res = await window.api.addTrackFromUrl(sourceUrl, null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      bump()
      await playQueue([res.track as Track], 0)
    } finally {
      setBusyUrl(null)
    }
  }

  return (
    <ContentSurface>
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Uploader
        </span>
        <span className="font-semibold text-[var(--color-text)]">{name}</span>
        <span className="text-[var(--color-text-dim)]">
          {data ? `${data.tracks.length} uploads` : ''}
        </span>
        {data?.channelUrl && (
          <button
            onClick={() =>
              window.electron.ipcRenderer.send('open-external', data.channelUrl as string)
            }
            className="ml-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Open on YouTube"
          >
            <ExternalLink size={11} />
          </button>
        )}
        {data && data.tracks.length > 0 && (
          <label className="ml-auto flex items-center gap-1 text-[10.5px] text-[var(--color-text-muted)]">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey)
                setPage(0)
              }}
              className="h-5 border border-[var(--color-border-strong)] bg-white px-1 text-[11px]"
            >
              <option value="default">Channel order</option>
              <option value="title">Title (A–Z)</option>
              <option value="duration_desc">Longest first</option>
              <option value="duration_asc">Shortest first</option>
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-[var(--color-text-muted)]">
          <Loader2 size={12} className="animate-spin" />
          Looking up {name}'s channel…
        </div>
      )}

      {!loading && data && data.tracks.length === 0 && (
        <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">
          Couldn't find a YouTube channel for{' '}
          <span className="text-[var(--color-text)]">{name}</span>.
        </div>
      )}

      {/* Column header */}
      {!loading && data && data.tracks.length > 0 && (
        <>
          <div className="sticky top-0 z-10 grid grid-cols-[40px_1fr_60px_28px] items-center gap-2 border-b border-[var(--color-border-strong)] bg-[var(--grad-header)] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <span className="text-right">#</span>
            <span>Title</span>
            <span className="text-right">Time</span>
            <span></span>
          </div>
          {pageTracks.map((t, i) => {
            const absoluteIdx = page * PAGE_SIZE + i
            const isCurrent = t.sourceUrl === currentUrl
            return (
              <div
                key={t.sourceUrl}
                onDoubleClick={() => void playOne(t.sourceUrl)}
                className={`group grid h-6 grid-cols-[40px_1fr_60px_28px] items-center gap-2 border-b border-[var(--color-border)]/40 px-2 text-[12px] ${
                  isCurrent
                    ? 'bg-[var(--color-row-current)] text-[var(--color-row-current-fg)]'
                    : 'hover:bg-[var(--color-surface-3)]'
                }`}
              >
                <div className="grid place-items-center">
                  {busyUrl === t.sourceUrl ? (
                    <Loader2 size={10} className="animate-spin text-[var(--color-text-muted)]" />
                  ) : (
                    <>
                      <span
                        className={`text-right tabular-nums group-hover:hidden ${
                          isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'
                        }`}
                      >
                        {isCurrent && playing ? '▶' : absoluteIdx + 1}
                      </span>
                      <button
                        onClick={() => void playOne(t.sourceUrl)}
                        className={`hidden group-hover:block ${
                          isCurrent ? 'text-white' : 'text-[var(--color-text)]'
                        }`}
                        aria-label={`Play ${t.title}`}
                      >
                        <Play size={10} fill="currentColor" />
                      </button>
                    </>
                  )}
                </div>
                <span className="truncate">{t.title}</span>
                <span
                  className={`text-right tabular-nums ${
                    isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {fmt(t.durationSec)}
                </span>
                <div className="opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => window.electron.ipcRenderer.send('open-external', t.sourceUrl)}
                    title="Open on YouTube"
                    className={isCurrent ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}
                  >
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )
          })}

          {totalPages > 1 && (
            <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--grad-header)] px-2 py-1 text-[11px]">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 hover:bg-[var(--grad-btn-hover)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-[var(--color-text-muted)]">
                Page {page + 1} / {totalPages} · {sortedTracks.length} uploads
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 hover:bg-[var(--grad-btn-hover)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
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
