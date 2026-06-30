import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Loader2,
  Volume2,
  VolumeX,
  Search,
  X,
  Mic2,
  Users
} from 'lucide-react'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'
import { useAuth } from '../stores/auth'

interface ToolbarProps {
  lyricsOpen: boolean
  onToggleLyrics: () => void
  friendsOpen: boolean
  onToggleFriends: () => void
  onOpenAuth: () => void
}

// foobar2000-style top chrome: title-area / menubar-row + transport-and-sliders
// row + a thin search row. The window controls (overlay) live in the menubar.
export function Toolbar(props: ToolbarProps): React.JSX.Element {
  return (
    <div className="shrink-0 border-b border-[var(--color-border-strong)] bg-[var(--color-bg)]">
      <Menubar onOpenAuth={props.onOpenAuth} />
      <TransportRow {...props} />
      <SearchRow />
    </div>
  )
}

function Menubar({ onOpenAuth }: { onOpenAuth: () => void }): React.JSX.Element {
  const track = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : null))
  const playing = usePlayer((s) => s.playing)
  const profile = useAuth((s) => s.profile)
  const initializing = useAuth((s) => s.initializing)
  const signOut = useAuth((s) => s.signOut)
  const openAdd = useLibrary((s) => s.openAdd)
  const setView = useLibrary((s) => s.setView)
  const bump = useLibrary((s) => s.bump)

  // Player actions
  const togglePlay = usePlayer((s) => s.toggle)
  const nextTrack = usePlayer((s) => s.next)
  const prevTrack = usePlayer((s) => s.prev)
  const toggleMute = usePlayer((s) => s.toggleMute)
  const seekTo = usePlayer((s) => s.seekTo)

  const [openMenu, setOpenMenu] = useState<string | null>(null)

  async function newPlaylist(): Promise<void> {
    const name = prompt('Playlist name?')
    if (!name?.trim()) return
    const p = await window.api.createPlaylist(name.trim())
    bump()
    setView({ kind: 'playlist', id: p.id })
  }

  async function clearLibrary(): Promise<void> {
    if (!confirm('Delete every track in your library? Playlists keep their entries but rows are gone.'))
      return
    const all = await window.api.listLibraryTracks()
    for (const t of all) await window.api.deleteTrack(t.id)
    bump()
  }

  function showAbout(): void {
    alert(
      'Listal — personal music aggregator\n\n' +
        'Streams from YouTube, SoundCloud, Bandcamp via yt-dlp.\n' +
        'Canonical catalog via MusicBrainz. Lyrics via LRCLIB / NetEase / QQ Music / Kugou / Genius / lyrics.ovh.\n' +
        '\nThis is a personal-use tool.'
    )
  }

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'Add track from URL…', shortcut: 'Ctrl+U', onClick: openAdd },
      { type: 'separator' },
      { label: 'Quit', shortcut: 'Ctrl+Q', onClick: () => window.close() }
    ],
    Edit: [
      { label: 'Clear library…', onClick: () => void clearLibrary(), danger: true }
    ],
    View: [
      { label: 'Library', onClick: () => setView({ kind: 'library' }) },
      { label: 'Search', onClick: () => setView({ kind: 'search' }) },
      { type: 'separator' },
      {
        label: 'Toggle lyrics panel',
        shortcut: 'Ctrl+L',
        onClick: () => window.dispatchEvent(new CustomEvent('listal:toggle-lyrics'))
      },
      {
        label: 'Toggle friends panel',
        shortcut: 'Ctrl+F',
        onClick: () => window.dispatchEvent(new CustomEvent('listal:toggle-friends'))
      }
    ],
    Playback: [
      { label: playing ? 'Pause' : 'Play', shortcut: 'Space', onClick: togglePlay },
      { label: 'Stop', onClick: () => seekTo(0) },
      { type: 'separator' },
      { label: 'Previous', shortcut: 'Ctrl+←', onClick: () => void prevTrack() },
      { label: 'Next', shortcut: 'Ctrl+→', onClick: () => void nextTrack() },
      { type: 'separator' },
      { label: 'Mute / unmute', shortcut: 'M', onClick: toggleMute }
    ],
    Library: [
      { label: 'All tracks', onClick: () => setView({ kind: 'library' }) },
      { type: 'separator' },
      { label: 'New playlist…', shortcut: 'Ctrl+N', onClick: () => void newPlaylist() }
    ],
    Help: [
      {
        label: 'LRCLIB',
        onClick: () => window.electron.ipcRenderer.send('open-external', 'https://lrclib.net')
      },
      {
        label: 'MusicBrainz',
        onClick: () =>
          window.electron.ipcRenderer.send('open-external', 'https://musicbrainz.org')
      },
      { type: 'separator' },
      { label: 'About Listal', onClick: showAbout }
    ]
  }

  return (
    <div className="drag flex h-7 items-center gap-3 border-b border-[var(--color-border)] bg-[linear-gradient(#f8f8f8,#e6e6e6)] px-2 text-[11px] text-[var(--color-text)]">
      <span className="no-drag flex items-center gap-2">
        <span className="font-semibold">Listal</span>
        {track && (
          <span className="text-[var(--color-text-muted)]">
            — {track.artist ? `${track.artist} - ` : ''}
            {track.title} {playing ? '' : '[paused]'}
          </span>
        )}
      </span>
      <span className="no-drag relative ml-3 flex gap-0 text-[11px] text-[var(--color-text)]">
        {Object.entries(menus).map(([label, items]) => (
          <MenuButton
            key={label}
            label={label}
            items={items}
            open={openMenu === label}
            onOpen={() => setOpenMenu(label)}
            onHoverWhileMenuOpen={() => {
              if (openMenu) setOpenMenu(label)
            }}
            onClose={() => setOpenMenu(null)}
          />
        ))}
      </span>
      <span className="no-drag ml-auto pr-[140px]">
        {initializing ? (
          <span className="text-[var(--color-text-dim)]">…</span>
        ) : profile ? (
          <button
            onClick={() => void signOut()}
            title={`Sign out @${profile.username}`}
            className="hover:underline"
          >
            @{profile.username}
          </button>
        ) : (
          <button onClick={onOpenAuth} className="text-[var(--color-link)] hover:underline">
            Sign in
          </button>
        )}
      </span>
    </div>
  )
}

type MenuItem =
  | {
      type?: undefined
      label: string
      shortcut?: string
      onClick: () => void
      danger?: boolean
    }
  | { type: 'separator' }

function MenuButton({
  label,
  items,
  open,
  onOpen,
  onHoverWhileMenuOpen,
  onClose
}: {
  label: string
  items: MenuItem[]
  open: boolean
  onOpen: () => void
  onHoverWhileMenuOpen: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <span className="relative">
      <button
        onClick={() => (open ? onClose() : onOpen())}
        onMouseEnter={onHoverWhileMenuOpen}
        className={`px-2 py-0.5 hover:bg-[var(--color-surface-3)] ${
          open ? 'bg-[var(--color-surface-3)]' : ''
        }`}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} />
          <div className="absolute left-0 top-full z-40 min-w-[200px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] py-1 shadow-2xl">
            {items.map((item, i) => {
              if (item.type === 'separator')
                return <div key={i} className="my-1 border-t border-[var(--color-border)]" />
              return (
                <button
                  key={i}
                  onClick={() => {
                    item.onClick()
                    onClose()
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1 text-left hover:bg-[var(--color-row-current)] hover:text-[var(--color-row-current-fg)] ${
                    item.danger ? 'text-[var(--color-danger)]' : ''
                  }`}
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span className="ml-6 text-[10.5px] text-[var(--color-text-dim)]">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </span>
  )
}

function TransportRow({
  lyricsOpen,
  onToggleLyrics,
  friendsOpen,
  onToggleFriends
}: ToolbarProps): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.loading)
  const durationSec = usePlayer((s) => s.durationSec)
  const positionSec = usePlayer((s) => s.positionSec)
  const volume = usePlayer((s) => s.volume)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seekTo = usePlayer((s) => s.seekTo)
  const setVolume = usePlayer((s) => s.setVolume)
  const toggleMute = usePlayer((s) => s.toggleMute)

  const canPlay = index >= 0 && index < queue.length
  const hasNext = index >= 0 && index + 1 < queue.length
  const hasPrev = index > 0

  return (
    <div className="flex h-9 items-center gap-2 border-b border-[var(--color-border)] bg-[linear-gradient(#f4f4f4,#e8e8e8)] px-2">
      <TbButton title="Stop" onClick={() => seekTo(0)} disabled={!canPlay}>
        <Square size={11} fill="currentColor" />
      </TbButton>
      <TbButton
        title={playing ? 'Pause' : 'Play'}
        onClick={toggle}
        disabled={!canPlay}
      >
        {loading ? (
          <Loader2 size={11} className="animate-spin" />
        ) : playing ? (
          <Pause size={11} fill="currentColor" />
        ) : (
          <Play size={11} fill="currentColor" className="translate-x-[1px]" />
        )}
      </TbButton>
      <TbButton title="Previous" onClick={() => void prev()} disabled={!hasPrev}>
        <SkipBack size={11} fill="currentColor" />
      </TbButton>
      <TbButton title="Next" onClick={() => void next()} disabled={!hasNext}>
        <SkipForward size={11} fill="currentColor" />
      </TbButton>

      <div className="mx-2 h-5 w-px bg-[var(--color-border-strong)]" />

      {/* Volume slider — classic foobar's left side. */}
      <button
        onClick={toggleMute}
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        aria-label={volume === 0 ? 'Unmute' : 'Mute'}
        title={volume === 0 ? 'Unmute' : 'Mute'}
      >
        {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
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

      {/* Seek slider stretches to fill the row */}
      <span className="ml-3 w-9 text-right text-[11px] tabular-nums text-[var(--color-text-muted)]">
        {fmt(positionSec)}
      </span>
      <input
        type="range"
        min={0}
        max={durationSec || 1}
        step={0.1}
        value={positionSec}
        disabled={!canPlay || durationSec <= 0}
        onChange={(e) => seekTo(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-9 text-[11px] tabular-nums text-[var(--color-text-muted)]">
        {fmt(durationSec)}
      </span>

      <button
        onClick={onToggleLyrics}
        title="Lyrics"
        className={`ml-1 grid h-6 w-7 place-items-center border border-[var(--color-border-strong)] ${
          lyricsOpen
            ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
            : 'bg-[linear-gradient(#ffffff,#dcdcdc)] text-[var(--color-text)] hover:bg-[linear-gradient(#ffffff,#cccccc)]'
        }`}
      >
        <Mic2 size={11} />
      </button>

      <button
        onClick={onToggleFriends}
        title="Friends"
        className={`grid h-6 w-7 place-items-center border border-[var(--color-border-strong)] ${
          friendsOpen
            ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
            : 'bg-[linear-gradient(#ffffff,#dcdcdc)] text-[var(--color-text)] hover:bg-[linear-gradient(#ffffff,#cccccc)]'
        }`}
      >
        <Users size={11} />
      </button>
    </div>
  )
}

function TbButton({
  children,
  onClick,
  title,
  disabled
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid h-6 w-7 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] text-[var(--color-text)] hover:bg-[linear-gradient(#ffffff,#cccccc)] active:bg-[#c0c0c0] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function SearchRow(): React.JSX.Element {
  const { view, setView } = useLibrary()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (view.kind === 'search') inputRef.current?.focus()
  }, [view.kind])

  function onChange(v: string): void {
    setQuery(v)
    if (view.kind !== 'search') setView({ kind: 'search' })
    dispatchSearchQuery(v)
  }

  return (
    <div className="flex h-7 items-center gap-2 bg-[var(--color-bg)] px-2">
      <span className="text-[11px] text-[var(--color-text-muted)]">Search:</span>
      <label className="relative flex-1">
        <Search
          size={11}
          className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => view.kind !== 'search' && setView({ kind: 'search' })}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Artist or song or paste a link…"
          className="h-5 w-full border border-[var(--color-border-strong)] bg-white pl-6 pr-6 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        {query && (
          <button
            onClick={() => onChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={11} />
          </button>
        )}
      </label>
    </div>
  )
}

const SEARCH_EVT = 'zp:search-query'

function dispatchSearchQuery(q: string): void {
  window.dispatchEvent(new CustomEvent<string>(SEARCH_EVT, { detail: q }))
}

export function useSearchQuery(initial = ''): [string, (v: string) => void] {
  const [q, setQ] = useState(initial)
  useEffect(() => {
    const handler = (e: Event): void => {
      setQ((e as CustomEvent<string>).detail)
    }
    window.addEventListener(SEARCH_EVT, handler)
    return () => window.removeEventListener(SEARCH_EVT, handler)
  }, [])
  return [q, setQ]
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
