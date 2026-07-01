import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'
import { useAuth } from '../stores/auth'
import { TransportZone } from './TransportZone'
import { TabBar } from './TabBar'

interface ToolbarProps {
  lyricsOpen: boolean
  onToggleLyrics: () => void
  friendsOpen: boolean
  onToggleFriends: () => void
  convoyOpen: boolean
  onToggleConvoy: () => void
  queueOpen: boolean
  onToggleQueue: () => void
  onOpenAuth: () => void
}

// Top chrome: title-area / menubar-row + top-zone transport row + search row.
// The other zones (bottom/left/right) render from App.tsx directly so they
// can sit alongside the sidebar and content.
export function Toolbar(props: ToolbarProps): React.JSX.Element {
  return (
    <div className="shrink-0 border-b border-[var(--color-border-strong)] bg-[var(--color-bg)]">
      <Menubar onOpenAuth={props.onOpenAuth} />
      <TransportZone
        zone="top"
        orientation="horizontal"
        lyricsOpen={props.lyricsOpen}
        onToggleLyrics={props.onToggleLyrics}
        friendsOpen={props.friendsOpen}
        onToggleFriends={props.onToggleFriends}
        convoyOpen={props.convoyOpen}
        onToggleConvoy={props.onToggleConvoy}
        queueOpen={props.queueOpen}
        onToggleQueue={props.onToggleQueue}
      />
      <TabBar />
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
      },
      {
        label: 'Toggle queue panel',
        onClick: () => window.dispatchEvent(new CustomEvent('listal:toggle-queue'))
      },
      {
        label: 'Convoy',
        shortcut: 'Ctrl+J',
        onClick: () => window.dispatchEvent(new CustomEvent('listal:toggle-convoy'))
      },
      {
        label: 'Rooms',
        onClick: () => window.dispatchEvent(new CustomEvent('listal:toggle-rooms'))
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        shortcut: 'Ctrl+,',
        onClick: () => window.dispatchEvent(new CustomEvent('listal:open-settings'))
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
    ],
    Account: profile
      ? [
          {
            label: `Signed in as @${profile.username}`,
            onClick: () => window.dispatchEvent(new CustomEvent('listal:open-profile'))
          },
          { type: 'separator' },
          {
            label: 'Edit profile…',
            onClick: () => window.dispatchEvent(new CustomEvent('listal:open-profile'))
          },
          {
            label: 'Friends',
            shortcut: 'Ctrl+F',
            onClick: () => window.dispatchEvent(new CustomEvent('listal:toggle-friends'))
          },
          { type: 'separator' },
          { label: 'Sign out', onClick: () => void signOut(), danger: true }
        ]
      : [
          {
            label: 'Sign in / Sign up…',
            onClick: onOpenAuth
          }
        ]
  }

  return (
    <div className="drag flex h-7 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--grad-titlebar)] px-2 text-[11px] text-[var(--color-text)]">
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
      <span className="no-drag ml-auto flex items-center gap-2 pr-[140px]">
        {initializing ? (
          <span className="text-[var(--color-text-dim)]">…</span>
        ) : profile ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('listal:open-profile'))}
            title="Edit profile"
            className="flex items-center gap-1.5 hover:underline"
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-4 w-4 rounded-full border border-[var(--color-border)] object-cover"
              />
            ) : (
              <span className="grid h-4 w-4 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[9px] font-semibold text-[var(--color-text-muted)]">
                {profile.username.slice(0, 1).toUpperCase()}
              </span>
            )}
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
  const rootRef = useRef<HTMLSpanElement | null>(null)

  // Close on outside-click via document, so we don't need an overlay div
  // that blocks hover events on sibling menus (which was breaking the
  // "hover left to switch to previous menu" behaviour).
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent): void => {
      const el = rootRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open, onClose])

  return (
    <span ref={rootRef} className="relative">
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
          className="h-5 w-full border border-[var(--color-border-strong)] bg-[var(--color-input)] pl-6 pr-6 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
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
