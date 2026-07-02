import { useEffect, useState } from 'react'
import { Trash2, Pencil, Check, Play, RefreshCw, Plus, Sparkles } from 'lucide-react'
import type { Playlist, SearchResult, Track } from '../../../preload'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'
import { TrackList } from './TrackList'
import { ContentSurface } from './LibraryView'

interface Props {
  playlistId: number
}

export function PlaylistView({ playlistId }: Props): React.JSX.Element {
  const { version, bump, setView } = useLibrary()
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const playQueue = usePlayer((s) => s.playQueue)

  useEffect(() => {
    void (async () => {
      const all = await window.api.listPlaylists()
      const found = all.find((p) => p.id === playlistId) ?? null
      setPlaylist(found)
      setDraftName(found?.name ?? '')
      setTracks(await window.api.listPlaylistTracks(playlistId))
    })()
  }, [playlistId, version])

  if (!playlist) {
    return (
      <ContentSurface>
        <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">
          Playlist not found.
        </div>
      </ContentSurface>
    )
  }

  async function saveName(): Promise<void> {
    const name = draftName.trim()
    if (name && name !== playlist?.name) {
      await window.api.renamePlaylist(playlistId, name)
      bump()
    }
    setEditingName(false)
  }

  async function destroy(): Promise<void> {
    if (!confirm(`Delete playlist "${playlist?.name}"? Tracks stay in your library.`)) return
    await window.api.deletePlaylist(playlistId)
    setView({ kind: 'library' })
    bump()
  }

  const totalMs = tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0)

  return (
    <ContentSurface>
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Playlist
        </span>
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName()
              else if (e.key === 'Escape') {
                setDraftName(playlist.name)
                setEditingName(false)
              }
            }}
            className="h-5 border border-[var(--color-border-strong)] bg-[var(--color-input)] px-1 text-[12px] font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="font-semibold text-[var(--color-text)] hover:underline"
            title="Click to rename"
          >
            {playlist.name}
          </button>
        )}
        <span className="text-[var(--color-text-dim)]">
          {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          {totalMs > 0 ? ` · ${fmtTotal(totalMs)}` : ''}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => tracks.length > 0 && void playQueue(tracks, 0)}
            disabled={tracks.length === 0}
            className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)] disabled:opacity-40"
            title="Play playlist"
          >
            <Play size={9} fill="currentColor" />
          </button>
          {editingName ? (
            <button
              onClick={() => void saveName()}
              className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]"
              title="Save name"
            >
              <Check size={11} />
            </button>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]"
              title="Rename"
            >
              <Pencil size={10} />
            </button>
          )}
          <button
            onClick={() => void destroy()}
            className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]"
            title="Delete playlist"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">
          Empty. Search a song up top and use the + on any result to drop it here.
        </div>
      ) : (
        <>
          <TrackList
            tracks={tracks}
            onPlay={(i) => void playQueue(tracks, i)}
            onRemove={async (t) => {
              await window.api.removeTrackFromPlaylist(playlistId, t.id)
              bump()
            }}
          />
          <Recommendations tracks={tracks} playlistId={playlistId} />
        </>
      )}
    </ContentSurface>
  )
}

// Renders 5 song suggestions based on a random seed from the playlist. The
// Refresh button rerolls the seed. Each row has an Add button that inserts
// the track straight into the playlist.
function Recommendations({
  tracks,
  playlistId
}: {
  tracks: Track[]
  playlistId: number
}): React.JSX.Element {
  const [recs, setRecs] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [seedTitle, setSeedTitle] = useState<string | null>(null)
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set())
  const bump = useLibrary((s) => s.bump)

  async function fetchFor(seed: Track): Promise<void> {
    setLoading(true)
    setSeedTitle(seed.title)
    try {
      const all = await window.api.songRadio(seed.sourceUrl)
      // Drop tracks already in the playlist and pick a random 5 from what's left.
      const already = new Set(tracks.map((t) => t.sourceUrl))
      const filtered = all.filter((r) => !already.has(r.sourceUrl))
      // Fisher-Yates on a copy so refresh feels varied.
      for (let i = filtered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[filtered[i], filtered[j]] = [filtered[j], filtered[i]]
      }
      setRecs(filtered.slice(0, 5))
    } catch {
      setRecs([])
    } finally {
      setLoading(false)
    }
  }

  function refresh(): void {
    if (tracks.length === 0) return
    const seed = tracks[Math.floor(Math.random() * tracks.length)]
    void fetchFor(seed)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId])

  async function add(r: SearchResult): Promise<void> {
    const res = await window.api.addTrackFromUrl(r.sourceUrl, playlistId)
    if (res.ok) {
      setAddedUrls((prev) => new Set(prev).add(r.sourceUrl))
      bump()
      window.dispatchEvent(
        new CustomEvent('listal:toast', {
          detail: { message: `Added "${r.title}"`, ttlMs: 2400 }
        })
      )
    } else {
      window.dispatchEvent(
        new CustomEvent('listal:toast', {
          detail: { message: res.error, kind: 'error', ttlMs: 3500 }
        })
      )
    }
  }

  if (tracks.length === 0) return <></>
  return (
    <div className="border-t-2 border-[var(--color-border-strong)]">
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]">
        <Sparkles size={11} className="text-[var(--color-accent)]" />
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          You might like
        </span>
        {seedTitle && (
          <span className="truncate text-[var(--color-text-dim)]">
            based on {seedTitle}
          </span>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          title="Refresh suggestions"
          className="ml-auto grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)] disabled:opacity-40"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {recs.length === 0 && !loading && (
        <div className="px-3 py-2 text-[11px] text-[var(--color-text-dim)]">
          No suggestions right now.
        </div>
      )}
      {recs.map((r) => (
        <div
          key={r.sourceUrl}
          className="group flex items-center gap-2 border-b border-[var(--color-border)]/40 px-2 py-1 text-[12px] hover:bg-[var(--color-surface-3)]"
        >
          {r.thumbnail ? (
            <img
              src={r.thumbnail}
              alt=""
              referrerPolicy="no-referrer"
              className="h-7 w-7 shrink-0 border border-[var(--color-border)] object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
            />
          ) : (
            <div className="h-7 w-7 shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-2)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{r.title}</div>
            <div className="truncate text-[10.5px] text-[var(--color-text-muted)]">
              {r.uploader ?? r.service}
            </div>
          </div>
          <button
            onClick={() => void add(r)}
            disabled={addedUrls.has(r.sourceUrl)}
            title="Add to this playlist"
            className="grid h-6 w-6 shrink-0 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-primary)] text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-50"
          >
            {addedUrls.has(r.sourceUrl) ? <Check size={11} /> : <Plus size={11} />}
          </button>
        </div>
      ))}
    </div>
  )
}

function fmtTotal(ms: number): string {
  if (ms <= 0) return '0 min'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}
