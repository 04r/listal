import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  Play,
  Plus,
  Link as LinkIcon,
  Radio,
  ExternalLink,
  User
} from 'lucide-react'
import type { SearchResult, Playlist, Track } from '../../../preload'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'
import { ContentSurface } from './LibraryView'
import { useSearchQuery } from './Toolbar'

export function SearchView(): React.JSX.Element {
  const [query] = useSearchQuery('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; result: SearchResult } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playQueue = usePlayer((s) => s.playQueue)
  const currentUrl = usePlayer((s) => (s.index >= 0 ? s.queue[s.index]?.sourceUrl : null))
  const setView = useLibrary((s) => s.setView)
  const bump = useLibrary((s) => s.bump)

  useEffect(() => {
    window.api.listPlaylists().then(setPlaylists)
  }, [])

  const isUrl = useMemo(() => /^https?:\/\//i.test(query.trim()), [query])

  // React to top-bar query changes with a small debounce.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (!trimmed || /^https?:\/\//i.test(trimmed)) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      setError(null)
      try {
        setResults(await window.api.search(trimmed))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }, 450)
  }, [query])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  async function addAndPlay(r: SearchResult): Promise<void> {
    setBusyKey(r.sourceUrl)
    setError(null)
    const res = await window.api.addTrackFromUrl(r.sourceUrl, null)
    setBusyKey(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    bump()
    await playQueue([res.track as Track], 0)
  }

  async function addOnly(r: SearchResult, playlistId: number | null): Promise<void> {
    setBusyKey(r.sourceUrl)
    setError(null)
    const res = await window.api.addTrackFromUrl(r.sourceUrl, playlistId)
    setBusyKey(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    bump()
  }

  async function playUrl(): Promise<void> {
    setBusyKey('url')
    setError(null)
    const res = await window.api.addTrackFromUrl(query.trim(), null)
    setBusyKey(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    bump()
    await playQueue([res.track as Track], 0)
  }

  function openRadio(r: SearchResult): void {
    setMenu(null)
    setView({ kind: 'radio', seedUrl: r.sourceUrl, seedTitle: r.title })
  }

  return (
    <ContentSurface>
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Search
        </span>
        <span className="text-[var(--color-text-dim)]">
          {query.trim()
            ? isUrl
              ? 'looks like a link'
              : loading
                ? 'searching…'
                : `${results.length} result${results.length === 1 ? '' : 's'}`
            : 'type in the search box up top'}
        </span>
        {loading && <Loader2 size={11} className="animate-spin text-[var(--color-text-muted)]" />}
      </div>

      {error && (
        <div className="border-b border-[var(--color-border)] bg-red-500/10 px-3 py-1 text-[11px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {isUrl && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-2 text-[12px]">
          <LinkIcon size={12} className="shrink-0 text-[var(--color-accent)]" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">This looks like a link</div>
            <div className="truncate text-[10.5px] text-[var(--color-text-muted)]">
              {query.trim()}
            </div>
          </div>
          <button
            onClick={() => void playUrl()}
            disabled={busyKey === 'url'}
            className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-2 py-0.5 text-[11.5px] font-semibold text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-40"
          >
            {busyKey === 'url' ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Play size={10} fill="currentColor" />
            )}
            Play
          </button>
        </div>
      )}

      {!isUrl && query.trim() && !loading && (
        <ArtistCard
          query={query.trim()}
          onOpen={(name) => setView({ kind: 'artist', name })}
        />
      )}

      {!isUrl && results.length > 0 && (
        <>
          <div className="sticky top-0 z-10 grid grid-cols-[40px_50px_1fr_220px_100px_60px_28px] items-center gap-2 border-b border-[var(--color-border-strong)] bg-[var(--grad-header)] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <span className="text-right">#</span>
            <span></span>
            <span>Title</span>
            <span>Uploader</span>
            <span>Service</span>
            <span className="text-right">Time</span>
            <span></span>
          </div>

          {results.map((r, i) => {
            const isCurrent = r.sourceUrl === currentUrl
            const busy = busyKey === r.sourceUrl
            return (
              <div
                key={`${r.sourceUrl}-${i}`}
                onDoubleClick={() => void addAndPlay(r)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, result: r })
                }}
                className={`group grid h-10 grid-cols-[40px_50px_1fr_220px_100px_60px_28px] items-center gap-2 border-b border-[var(--color-border)]/40 px-2 text-[12px] ${
                  isCurrent
                    ? 'bg-[var(--color-row-current)] text-[var(--color-row-current-fg)]'
                    : 'hover:bg-[var(--color-surface-3)]'
                }`}
              >
                <div className="grid place-items-center">
                  {busy ? (
                    <Loader2 size={10} className="animate-spin text-[var(--color-text-muted)]" />
                  ) : (
                    <>
                      <span
                        className={`text-right tabular-nums group-hover:hidden ${
                          isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <button
                        onClick={() => void addAndPlay(r)}
                        className={`hidden group-hover:block ${
                          isCurrent ? 'text-white' : 'text-[var(--color-text)]'
                        }`}
                        aria-label={`Play ${r.title}`}
                      >
                        <Play size={10} fill="currentColor" />
                      </button>
                    </>
                  )}
                </div>
                {r.thumbnail ? (
                  <img
                    src={r.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 border border-[var(--color-border)] object-cover"
                    onError={(e) =>
                      ((e.target as HTMLImageElement).style.visibility = 'hidden')
                    }
                  />
                ) : (
                  <div className="h-8 w-8 border border-[var(--color-border)] bg-[var(--color-surface-2)]" />
                )}
                <span className="truncate">{r.title}</span>
                <span className="truncate">
                  {r.uploader ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setView({ kind: 'uploader', name: r.uploader as string })
                      }}
                      className={`hover:underline ${
                        isCurrent ? 'text-white' : 'text-[var(--color-link)]'
                      }`}
                      title={`Browse ${r.uploader}'s uploads`}
                    >
                      {r.uploader}
                    </button>
                  ) : (
                    <span className={isCurrent ? 'text-white/80' : 'text-[var(--color-text-dim)]'}>
                      —
                    </span>
                  )}
                </span>
                <span
                  className={`truncate ${
                    isCurrent ? 'text-white/80' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {r.service}
                </span>
                <span
                  className={`text-right tabular-nums ${
                    isCurrent ? 'text-white' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {fmt(r.durationSec)}
                </span>
                <div className="flex justify-end opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() =>
                      window.electron.ipcRenderer.send('open-external', r.sourceUrl)
                    }
                    title="Open source"
                    className={
                      isCurrent
                        ? 'text-white'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }
                  >
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )}

      {!isUrl && !loading && results.length === 0 && query.trim() && (
        <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">
          No results for &ldquo;{query}&rdquo;.
        </div>
      )}
      {!isUrl && !query.trim() && !loading && (
        <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">
          Type in the search bar up top to search YouTube, SoundCloud, and Bandcamp. Paste a URL
          to add a track directly.
        </div>
      )}

      {menu && (
        <div
          className="fixed z-50 min-w-[200px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] py-1 text-[12px] shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<Play size={11} fill="currentColor" />}
            label="Play now"
            onClick={() => {
              const r = menu.result
              setMenu(null)
              void addAndPlay(r)
            }}
          />
          <MenuItem
            icon={<Plus size={11} />}
            label="Add to library"
            onClick={() => {
              const r = menu.result
              setMenu(null)
              void addOnly(r, null)
            }}
          />
          {playlists.length > 0 && (
            <div>
              <div className="border-t border-[var(--color-border)] px-3 py-1 text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Add to playlist
              </div>
              {playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    const r = menu.result
                    setMenu(null)
                    void addOnly(r, p.id)
                  }}
                  className="block w-full truncate px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="my-1 border-t border-[var(--color-border)]" />
          <MenuItem
            icon={<Radio size={11} />}
            label="Song Radio"
            onClick={() => openRadio(menu.result)}
          />
          <MenuItem
            icon={<ExternalLink size={11} />}
            label="Open source"
            onClick={() => {
              window.electron.ipcRenderer.send('open-external', menu.result.sourceUrl)
              setMenu(null)
            }}
          />
        </div>
      )}
    </ContentSurface>
  )
}

// Debounced artist lookup. Fires Spotify + MusicBrainz in parallel; whichever
// resolves with a plausible match becomes the card. Falls back to "Browse as
// artist" so you can always jump into ArtistView from search.
function ArtistCard({
  query,
  onOpen
}: {
  query: string
  onOpen: (name: string) => void
}): React.JSX.Element | null {
  interface Info {
    name: string
    image: string | null
    followers: number | null
    source: 'spotify' | 'musicbrainz' | 'query'
  }
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setLoading(true)
    const timer = setTimeout(async () => {
      // Best-effort — either lookup can fail (no Spotify auth, MB offline).
      const [sp, mb] = await Promise.allSettled([
        window.api.getArtistFromSpotify(query),
        window.api.getArtistCatalog(query)
      ])
      if (cancelled) return
      const spok = sp.status === 'fulfilled' && sp.value.ok ? sp.value.data : null
      const mbok = mb.status === 'fulfilled' && mb.value.ok ? mb.value.data : null
      const spFound = spok && spok.found ? spok : null
      const mbFound = mbok && mbok.mbid ? mbok : null
      const name = spFound?.artistName ?? mbFound?.artistName ?? query
      const image = spFound?.artistImage ?? null
      const followers = spFound?.followers ?? null
      if (spFound || mbFound) {
        setInfo({
          name,
          image,
          followers,
          source: spFound ? 'spotify' : 'musicbrainz'
        })
      } else {
        // No lookup succeeded — still show a card so the user can jump in.
        setInfo({ name: query, image: null, followers: null, source: 'query' })
      }
      setLoading(false)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (loading || !info) return null
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-2 text-[12px]">
      {info.image ? (
        <img
          src={info.image}
          alt=""
          referrerPolicy="no-referrer"
          className="h-12 w-12 shrink-0 border border-[var(--color-border-strong)] object-cover"
        />
      ) : (
        <div className="grid h-12 w-12 shrink-0 place-items-center border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
          <User size={20} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          Artist
        </div>
        <div className="truncate text-[14px] font-semibold text-[var(--color-text)]">
          {info.name}
        </div>
        <div className="truncate text-[10.5px] text-[var(--color-text-dim)]">
          {info.followers != null
            ? `${fmtFollowers(info.followers)} listeners · ${labelFor(info.source)}`
            : labelFor(info.source)}
        </div>
      </div>
      <button
        onClick={() => onOpen(info.name)}
        className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-[var(--grad-primary-hover)]"
      >
        Browse
      </button>
    </div>
  )
}

function labelFor(source: 'spotify' | 'musicbrainz' | 'query'): string {
  if (source === 'spotify') return 'Spotify'
  if (source === 'musicbrainz') return 'MusicBrainz'
  return 'search'
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function MenuItem({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)]"
    >
      {icon}
      {label}
    </button>
  )
}

function fmt(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
