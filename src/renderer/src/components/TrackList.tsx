import { useEffect, useRef, useState } from 'react'
import { Play, Trash2, ExternalLink, Radio, Send, ListPlus, Check } from 'lucide-react'
import type { Track, Playlist } from '../../../preload'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'
import { ShareDialog } from './ShareDialog'
import type { Attachment } from '../lib/attachments'

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
  const [menu, setMenu] = useState<{ x: number; y: number; track: Track } | null>(null)
  const [share, setShare] = useState<Attachment | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [playlistSubmenu, setPlaylistSubmenu] = useState(false)
  const [addedTo, setAddedTo] = useState<number | null>(null)

  function onRowEnter(url: string): void {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => maybePrefetch(url), 200)
  }
  function onRowLeave(): void {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }

  function onContextMenu(e: React.MouseEvent, t: Track): void {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, track: t })
    setPlaylistSubmenu(false)
    setAddedTo(null)
    void window.api.listPlaylists().then(setPlaylists)
  }

  async function addTrackToPlaylist(playlistId: number, t: Track): Promise<void> {
    const res = await window.api.addExistingTrackToPlaylist(playlistId, t.id)
    if (res.ok) {
      setAddedTo(playlistId)
      setTimeout(() => {
        setMenu(null)
        setPlaylistSubmenu(false)
      }, 500)
    }
  }

  function openSongRadio(seed: Track): void {
    setMenu(null)
    setView({ kind: 'radio', seedUrl: seed.sourceUrl, seedTitle: seed.title })
  }

  function shareTrack(t: Track): void {
    setMenu(null)
    setShare({
      kind: 'song',
      song: {
        service: t.service,
        sourceUrl: t.sourceUrl,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnailUrl,
        durationSec: t.durationMs ? t.durationMs / 1000 : null
      }
    })
  }

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

  return (
    <div>
      {/* Column header */}
      <div className="sticky top-0 z-10 grid grid-cols-[40px_1fr_220px_140px_60px_28px] items-center gap-2 border-b border-[var(--color-border-strong)] bg-[var(--grad-header)] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
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
            onContextMenu={(e) => onContextMenu(e, t)}
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

      {menu && (
        <div
          className="fixed z-50 min-w-[180px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] py-1 text-[12px] shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => openSongRadio(menu.track)}
            className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)]"
          >
            <Radio size={11} />
            Song Radio
          </button>
          <div
            onMouseEnter={() => setPlaylistSubmenu(true)}
            onMouseLeave={() => setPlaylistSubmenu(false)}
            className="relative"
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)]"
            >
              <ListPlus size={11} />
              Add to playlist
              <span className="ml-auto text-[10px] opacity-60">▸</span>
            </button>
            {playlistSubmenu && (
              <div
                className="absolute left-full top-0 min-w-[200px] max-h-[280px] overflow-y-auto border border-[var(--color-border-strong)] bg-[var(--color-shell)] py-1 shadow-2xl"
              >
                {playlists.length === 0 && (
                  <div className="px-3 py-1 text-[11px] text-[var(--color-text-dim)]">
                    No playlists yet.
                  </div>
                )}
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void addTrackToPlaylist(p.id, menu.track)}
                    className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)]"
                  >
                    {addedTo === p.id ? <Check size={11} /> : <ListPlus size={11} />}
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => shareTrack(menu.track)}
            className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)]"
          >
            <Send size={11} />
            Share…
          </button>
          <button
            onClick={() => {
              window.electron.ipcRenderer.send('open-external', menu.track.sourceUrl)
              setMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)]"
          >
            <ExternalLink size={11} />
            Open source
          </button>
        </div>
      )}

      {share && <ShareDialog attachment={share} onClose={() => setShare(null)} />}
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
