import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Loader2, Play, ListPlus, Link as LinkIcon, Search as SearchIcon } from 'lucide-react'
import type { SearchResult, Playlist, Track } from '../../../preload'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'
import { ContentSurface } from './LibraryView'
import { useSearchQuery } from './Toolbar'

const SERVICE_LABELS: Record<string, { name: string; short: string; tone: string }> = {
  youtube: { name: 'YouTube', short: 'YT', tone: 'bg-red-500/15 text-red-300' },
  soundcloud: { name: 'SoundCloud', short: 'SC', tone: 'bg-orange-500/15 text-orange-300' },
  bandcamp: { name: 'Bandcamp', short: 'BC', tone: 'bg-cyan-500/15 text-cyan-300' }
}

const SERVICE_PRIORITY: Record<string, number> = { youtube: 0, soundcloud: 1, bandcamp: 2 }

interface Group {
  key: string
  titleKey: string
  artistKey: string
  title: string
  uploader: string | null
  durationSec: number | null
  thumbnail: string | null
  sources: SearchResult[]
}

export function SearchView(): React.JSX.Element {
  const [query] = useSearchQuery('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playQueue = usePlayer((s) => s.playQueue)
  const bump = useLibrary((s) => s.bump)

  useEffect(() => {
    window.api.listPlaylists().then(setPlaylists)
  }, [])

  const isUrl = useMemo(() => /^https?:\/\//i.test(query.trim()), [query])
  const groups = useMemo(() => groupResults(results), [results])

  // React to top-bar query changes
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

  async function addAndDo(
    source: SearchResult,
    playlistId: number | null,
    andPlay: boolean,
    busyKeyForRow: string
  ): Promise<void> {
    setBusyKey(busyKeyForRow)
    const res = await window.api.addTrackFromUrl(source.sourceUrl, playlistId)
    setBusyKey(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    bump()
    if (andPlay) await playQueue([res.track as Track], 0)
  }

  async function addUrl(playlistId: number | null, andPlay: boolean): Promise<void> {
    setBusyKey('url')
    setError(null)
    const res = await window.api.addTrackFromUrl(query.trim(), playlistId)
    setBusyKey(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    bump()
    if (andPlay) await playQueue([res.track as Track], 0)
  }

  return (
    <ContentSurface>
      <div className="px-6 pt-6">
        {!query.trim() && !loading && (
          <EmptyHero icon={<SearchIcon size={36} />} title="Search across YouTube, SoundCloud, Bandcamp" subtitle="Use the search bar at the top, or paste any supported link to add it directly." />
        )}

        {loading && results.length === 0 && (
          <div className="flex items-center gap-3 py-4 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={14} className="animate-spin" />
            Searching…
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {isUrl && (
          <UrlCard
            url={query.trim()}
            busy={busyKey === 'url'}
            playlists={playlists}
            onAdd={(pid, play) => void addUrl(pid, play)}
          />
        )}

        {!isUrl && !loading && results.length === 0 && query.trim() && (
          <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
            No results for <span className="text-[var(--color-text)]">&ldquo;{query}&rdquo;</span>
          </div>
        )}
      </div>

      {groups.length > 0 && (
        <ul className="px-2">
          {groups.map((g) => (
            <GroupRow
              key={g.key}
              group={g}
              playlists={playlists}
              busy={busyKey === g.key}
              onPlay={(src) => void addAndDo(src, null, true, g.key)}
              onAddToPlaylist={(src, pid) => void addAndDo(src, pid, false, g.key)}
            />
          ))}
        </ul>
      )}
    </ContentSurface>
  )
}

function EmptyHero({
  icon,
  title,
  subtitle
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}): React.JSX.Element {
  return (
    <div className="grid place-items-center gap-3 py-16 text-center text-[var(--color-text-muted)]">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--color-surface)]">
        {icon}
      </div>
      <div className="text-xl font-semibold text-[var(--color-text)]">{title}</div>
      <div className="max-w-md text-sm">{subtitle}</div>
    </div>
  )
}

function GroupRow({
  group,
  playlists,
  busy,
  onPlay,
  onAddToPlaylist
}: {
  group: Group
  playlists: Playlist[]
  busy: boolean
  onPlay: (source: SearchResult) => void
  onAddToPlaylist: (source: SearchResult, playlistId: number) => void
}): React.JSX.Element {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [playlistsOpen, setPlaylistsOpen] = useState(false)
  const [activeSource, setActiveSource] = useState<SearchResult>(group.sources[0])
  const setView = useLibrary((s) => s.setView)

  return (
    <li className="group flex items-center gap-3 rounded-md px-4 py-2 transition-colors hover:bg-white/5">
      {group.thumbnail ? (
        <img
          src={group.thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          className="h-11 w-11 shrink-0 rounded object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
        />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded bg-[var(--color-surface-2)]" />
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{group.title}</div>
        <div className="truncate text-xs text-[var(--color-text-muted)]">
          <span className="mr-1">Song</span>·{' '}
          {group.uploader ? (
            <button
              onClick={() => setView({ kind: 'artist', name: group.uploader as string })}
              className="hover:text-[var(--color-text)] hover:underline"
            >
              {group.uploader}
            </button>
          ) : (
            '—'
          )}
        </div>
      </div>

      {looksOfficial(activeSource, group.artistKey) && (
        <span
          className="shrink-0 rounded-sm bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-sky-300"
          title="Uploader name matches artist — likely official"
        >
          OFFICIAL
        </span>
      )}

      <span className="w-12 shrink-0 text-right text-xs text-[var(--color-text-muted)] tabular-nums">
        {fmt(activeSource.durationSec)}
      </span>

      {/* Sources dropdown */}
      <div className="relative shrink-0">
        <button
          onClick={() => setSourcesOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text)] hover:text-[var(--color-text)]"
          title="Switch source"
        >
          <span className={`rounded-sm px-1.5 py-0.5 text-[10px] ${SERVICE_LABELS[activeSource.service].tone}`}>
            {SERVICE_LABELS[activeSource.service].short}
          </span>
          {group.sources.length > 1 && (
            <span className="text-[10px] text-[var(--color-text-dim)]">+{group.sources.length - 1}</span>
          )}
          <span className="text-[var(--color-text-dim)]">▾</span>
        </button>
        {sourcesOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSourcesOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-shell)] shadow-xl">
              {group.sources.map((s) => {
                const lbl = SERVICE_LABELS[s.service]
                const active = s.sourceUrl === activeSource.sourceUrl
                return (
                  <button
                    key={s.sourceUrl}
                    onClick={() => {
                      setActiveSource(s)
                      setSourcesOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                      active ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`rounded-sm px-1.5 py-0.5 text-[10px] ${lbl.tone}`}>
                        {lbl.short}
                      </span>
                      <span className="text-[var(--color-text)]">{lbl.name}</span>
                    </span>
                    <span className="tabular-nums text-[var(--color-text-dim)]">
                      {fmt(s.durationSec)}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onPlay(activeSource)}
          disabled={busy}
          title={`Play (${SERVICE_LABELS[activeSource.service].name}) & save`}
          className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setPlaylistsOpen((o) => !o)}
            title="Add to playlist"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--color-text)]"
          >
            <ListPlus size={14} />
          </button>
          {playlistsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPlaylistsOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-shell)] shadow-xl">
                {playlists.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[var(--color-text-dim)]">Make a playlist first.</div>
                ) : (
                  playlists.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onAddToPlaylist(activeSource, p.id)
                        setPlaylistsOpen(false)
                      }}
                      className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface)]"
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

function UrlCard({
  url,
  busy,
  playlists,
  onAdd
}: {
  url: string
  busy: boolean
  playlists: Playlist[]
  onAdd: (playlistId: number | null, andPlay: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-2 flex items-center gap-3 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-4">
      <LinkIcon size={18} className="shrink-0 text-[var(--color-accent)]" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">This looks like a link</div>
        <div className="truncate text-xs text-[var(--color-text-muted)]">{url}</div>
      </div>
      <button
        onClick={() => onAdd(null, true)}
        disabled={busy}
        className="flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
        Play
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={busy}
          className="grid h-9 w-9 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--color-text)] disabled:opacity-50"
          title="Add to playlist"
        >
          <ListPlus size={16} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-shell)] shadow-xl">
              <button
                onClick={() => {
                  onAdd(null, false)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
              >
                <Plus size={12} /> Library only
              </button>
              {playlists.length > 0 && (
                <div className="border-t border-[var(--color-border)] py-1">
                  {playlists.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onAdd(p.id, false)
                        setOpen(false)
                      }}
                      className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface)]"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- grouping ---------------------------------------------------------------

const NOISE_RE =
  /\b(official|audio|video|music|lyric[s]?|hd|4k|remaster(?:ed)?|original|hq|mv|live|explicit|free download|prod\.?(?:\s+by)?)\b/gi

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\(\[].*?[\)\]]/g, ' ')
    .replace(NOISE_RE, ' ')
    .replace(/\s+(ft|feat)\.?\s+.*$/i, ' ')
    .replace(/\.(mp3|m4a|wav|flac|ogg)$/i, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTrack(
  rawTitle: string,
  uploader: string | null
): { artist: string; title: string; artistFromTitle: boolean } {
  const cleanedUploader = (uploader ?? '')
    .replace(/\s*[-–—]\s*topic\s*$/i, '')
    .replace(/[._]+/g, ' ')
    .trim()
  const m = rawTitle.match(/^([^-–—]+?)\s*[-–—]\s*(.+)$/)
  if (m) {
    const left = m[1].trim()
    const right = m[2].trim()
    if (left.length >= 2) return { artist: left, title: right, artistFromTitle: true }
  }
  // No "Artist - Title" pattern → fall back to uploader. Flag this so the
  // "official" badge doesn't fire on the trivial uploader == artist tautology.
  return { artist: cleanedUploader, title: rawTitle.trim(), artistFromTitle: false }
}

// Grouping pass — collapse the same canonical song across services, but only
// when the durations agree to within ±DURATION_TOL_SEC. Without the duration
// gate, "Sunset In Reverse" (3:31) and "Sunset In Reverse (slowed + reverb)"
// (4:42) merge into one row even though they're musically different uploads.
const DURATION_TOL_SEC = 4

// Per-source flag set during grouping — whether the artist was parsed from
// the title's "Artist - Title" pattern (vs. uploader fallback). Drives the
// OFFICIAL badge so we don't fire it on the tautological self-match case.
const artistFromTitleFlag = new Map<string, boolean>()

function groupResults(items: SearchResult[]): Group[] {
  artistFromTitleFlag.clear()
  const groups: Group[] = []
  for (const r of items) {
    const { artist, title, artistFromTitle } = parseTrack(r.title, r.uploader)
    artistFromTitleFlag.set(r.sourceUrl, artistFromTitle)
    const titleKey = normalize(title)
    const artistKey = normalize(artist)
    if (!titleKey && !artistKey) continue

    const existing = groups.find((g) => {
      if (g.titleKey !== titleKey || g.artistKey !== artistKey) return false
      // If both sides have a duration, require them to be close. If either
      // side lacks one we fall back to title+artist-only matching.
      if (g.durationSec != null && r.durationSec != null) {
        return Math.abs(g.durationSec - r.durationSec) <= DURATION_TOL_SEC
      }
      return true
    })

    if (existing) {
      if (!existing.sources.some((s) => s.sourceUrl === r.sourceUrl)) existing.sources.push(r)
      if (!existing.thumbnail && r.thumbnail) existing.thumbnail = r.thumbnail
      if (existing.durationSec == null && r.durationSec != null) existing.durationSec = r.durationSec
    } else {
      groups.push({
        key: `${titleKey}|${artistKey}|${r.durationSec ?? '?'}`,
        titleKey,
        artistKey,
        title,
        uploader: artist || null,
        durationSec: r.durationSec,
        thumbnail: r.thumbnail,
        sources: [r]
      })
    }
  }
  for (const g of groups) {
    g.sources.sort((a, b) => {
      // Promote results whose uploader name matches the parsed artist — those
      // are almost certainly the artist's own upload (especially on SoundCloud
      // where bootleggers rarely match the artist's handle).
      const aOff = looksOfficial(a, g.artistKey) ? 0 : 1
      const bOff = looksOfficial(b, g.artistKey) ? 0 : 1
      if (aOff !== bOff) return aOff - bOff
      return (SERVICE_PRIORITY[a.service] ?? 99) - (SERVICE_PRIORITY[b.service] ?? 99)
    })
  }
  return groups
}

// Official-upload heuristic. Two ways a result counts as official:
//   1. uploader name contains "vevo" or " - Topic" → label-managed channel
//   2. the artist was parsed from the title's "Artist - Title" pattern AND
//      the uploader handle contains that artist (case-insensitive)
// Avoids the tautological case where parseTrack fell back to "artist = uploader"
// because the title had no dash — that would mark every standalone upload as
// official just because the uploader matches itself.
function looksOfficial(r: SearchResult, artistKey: string): boolean {
  const uploaderRaw = (r.uploader ?? '').toLowerCase()
  if (/\bvevo\b/.test(uploaderRaw) || /\btopic\b/.test(uploaderRaw)) return true

  if (!artistKey) return false
  if (!artistFromTitleFlag.get(r.sourceUrl)) return false

  const uploaderKey = normalize(r.uploader ?? '')
  if (!uploaderKey) return false
  const stripped = uploaderKey.replace(/\b(official|music|topic|vevo)\b/g, '').trim()
  if (stripped.length < 2) return false
  return stripped === artistKey || stripped.includes(artistKey)
}

function fmt(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
