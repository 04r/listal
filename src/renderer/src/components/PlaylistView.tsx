import { useEffect, useState } from 'react'
import { Trash2, Pencil, Check, Play } from 'lucide-react'
import type { Playlist, Track } from '../../../preload'
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
            className="h-5 border border-[var(--color-border-strong)] bg-white px-1 text-[12px] font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
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
            className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#fff,#dcdcdc)] text-[var(--color-text)] hover:bg-[linear-gradient(#fff,#cccccc)] disabled:opacity-40"
            title="Play playlist"
          >
            <Play size={9} fill="currentColor" />
          </button>
          {editingName ? (
            <button
              onClick={() => void saveName()}
              className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#fff,#dcdcdc)] text-[var(--color-text)] hover:bg-[linear-gradient(#fff,#cccccc)]"
              title="Save name"
            >
              <Check size={11} />
            </button>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#fff,#dcdcdc)] text-[var(--color-text)] hover:bg-[linear-gradient(#fff,#cccccc)]"
              title="Rename"
            >
              <Pencil size={10} />
            </button>
          )}
          <button
            onClick={() => void destroy()}
            className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#fff,#dcdcdc)] text-[var(--color-text)] hover:bg-[linear-gradient(#fff,#cccccc)]"
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
        <TrackList
          tracks={tracks}
          onPlay={(i) => void playQueue(tracks, i)}
          onRemove={async (t) => {
            await window.api.removeTrackFromPlaylist(playlistId, t.id)
            bump()
          }}
        />
      )}
    </ContentSurface>
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
