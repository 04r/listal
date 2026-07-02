import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { LibraryView } from './components/LibraryView'
import { PlaylistView } from './components/PlaylistView'
import { SearchView } from './components/SearchView'
import { ArtistView } from './components/ArtistView'
import { UploaderView } from './components/UploaderView'
import { RadioView } from './components/RadioView'
import { LyricsPanel } from './components/LyricsPanel'
import { AuthDialog } from './components/AuthDialog'
import { ClaimUsernameDialog } from './components/ClaimUsernameDialog'
import { ProfileDialog } from './components/ProfileDialog'
import { FriendsPanel } from './components/FriendsPanel'
import { ConvoyPanel } from './components/ConvoyPanel'
import { ConvoyDialog } from './components/ConvoyDialog'
import { QueuePanel } from './components/QueuePanel'
import { RoomsPanel } from './components/RoomsPanel'
import { RoomView } from './components/RoomView'
import { SettingsDialog } from './components/SettingsDialog'
import { TransportZone } from './components/TransportZone'
import { ChatPanel } from './components/ChatPanel'
import { AddTrackDialog } from './components/AddTrackDialog'
import { ToastLayer } from './components/Toast'
import { AudioSettingsPanel } from './components/AudioSettingsPanel'
import { AudioVisualizerPanel } from './components/AudioVisualizerPanel'
import { useLibrary } from './stores/library'
import { useAuth } from './stores/auth'
import { useSocial } from './stores/social'
import { useFriends } from './stores/friends'
import { useConvoy } from './stores/convoy'
import { useRooms } from './stores/rooms'
import { useChat } from './stores/chat'
import { startConvoyPlayerSync, stopConvoyPlayerSync } from './stores/convoyPlayerSync'
import { usePlayer } from './stores/player'
import { useLyrics } from './stores/lyrics'
import { useSettings, applySettingsToDom, type PanelKey } from './stores/settings'
import { usePanelMode } from './stores/panelMode'

function App(): React.JSX.Element {
  const view = useLibrary((s) => s.view)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [convoyOpen, setConvoyOpen] = useState(false)
  const [convoyDialogOpen, setConvoyDialogOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [roomsOpen, setRoomsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const panelSides = useSettings((s) => s.panelSides)
  const discordRpc = useSettings((s) => s.discordRpc)
  const [vizOpen, setVizOpen] = useState(false)
  const panelModes = usePanelMode((s) => s.modes)
  const columnWidth = usePanelMode((s) => s.columnWidth)
  const setColumnWidth = usePanelMode((s) => s.setColumnWidth)
  const chatOpen = useChat((s) => s.peer !== null)

  // Push theme + accent onto <html> whenever they change.
  useEffect(() => {
    applySettingsToDom({ theme, accent })
  }, [theme, accent])

  // Push the Discord RPC toggle into the main process. Runs on startup so a
  // freshly-loaded renderer restores the persisted state.
  useEffect(() => {
    void window.api.setDiscordEnabled(discordRpc)
    if (!discordRpc) void window.api.clearDiscordPresence()
  }, [discordRpc])
  const [authOpen, setAuthOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profile = useAuth((s) => s.profile)
  const needsUsername = useAuth((s) => s.needsUsername)
  const initializing = useAuth((s) => s.initializing)
  const convoySession = useConvoy((s) => s.session)
  const currentTrack = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : null))

  // Kick off lyrics fetch the moment the current track changes, whether the
  // panel is open or not. LyricsPanel just reads from the store.
  useEffect(() => {
    useLyrics.getState().fetchFor(
      currentTrack
        ? {
            sourceUrl: currentTrack.sourceUrl,
            title: currentTrack.title,
            artist: currentTrack.artist,
            durationMs: currentTrack.durationMs
          }
        : null
    )
  }, [currentTrack?.sourceUrl])

  // Spin up presence channels + friends list once we know who we are. Cleaning
  // these up on sign-out releases the Supabase realtime sockets.
  useEffect(() => {
    if (profile?.id) {
      useSocial.getState().start(profile.id)
      void useFriends.getState().start(profile.id)
      useConvoy.getState().setMeId(profile.id)
      void useRooms.getState().start(profile.id)
      startConvoyPlayerSync()
    } else {
      void useSocial.getState().stop()
      void useFriends.getState().stop()
      void useConvoy.getState().leave()
      useConvoy.getState().setMeId(null)
      void useRooms.getState().stop()
      stopConvoyPlayerSync()
    }
  }, [profile?.id])

  // Friends panel only makes sense when signed in.
  function toggleFriends(): void {
    if (!profile) {
      setAuthOpen(true)
      return
    }
    setFriendsOpen((v) => !v)
    // Two right panels shouldn't stack.
    if (!friendsOpen) setConvoyOpen(false)
  }

  function toggleConvoy(): void {
    if (!profile) {
      setAuthOpen(true)
      return
    }
    // No active Convoy: open the create/join dialog instead of the panel.
    if (!convoySession) {
      setConvoyDialogOpen(true)
      return
    }
    setConvoyOpen((v) => !v)
    if (!convoyOpen) {
      setFriendsOpen(false)
      setQueueOpen(false)
    }
  }

  function toggleQueue(): void {
    setQueueOpen((v) => !v)
    if (!queueOpen) {
      setFriendsOpen(false)
      setConvoyOpen(false)
      setRoomsOpen(false)
    }
  }

  function toggleRooms(): void {
    if (!profile) {
      setAuthOpen(true)
      return
    }
    setRoomsOpen((v) => !v)
    if (!roomsOpen) {
      setFriendsOpen(false)
      setConvoyOpen(false)
      setQueueOpen(false)
    }
  }

  // Menubar dispatches custom events; listen here so panels toggle without
  // having to thread setters through every level.
  useEffect(() => {
    const lyr = (): void => setLyricsOpen((v) => !v)
    const fr = (): void => toggleFriends()
    const cvy = (): void => toggleConvoy()
    const q = (): void => toggleQueue()
    const rm = (): void => toggleRooms()
    const st = (): void => setSettingsOpen(true)
    const prof = (): void => {
      if (profile) setProfileOpen(true)
      else setAuthOpen(true)
    }
    window.addEventListener('listal:toggle-lyrics', lyr)
    window.addEventListener('listal:toggle-friends', fr)
    window.addEventListener('listal:toggle-convoy', cvy)
    window.addEventListener('listal:toggle-queue', q)
    window.addEventListener('listal:toggle-rooms', rm)
    window.addEventListener('listal:open-settings', st)
    window.addEventListener('listal:open-profile', prof)
    const ao = (): void => setAudioOpen((v) => !v)
    window.addEventListener('listal:toggle-audio', ao)
    const vz = (): void => setVizOpen((v) => !v)
    window.addEventListener('listal:toggle-visualizer', vz)
    return () => {
      window.removeEventListener('listal:toggle-lyrics', lyr)
      window.removeEventListener('listal:toggle-friends', fr)
      window.removeEventListener('listal:toggle-convoy', cvy)
      window.removeEventListener('listal:toggle-queue', q)
      window.removeEventListener('listal:toggle-rooms', rm)
      window.removeEventListener('listal:open-settings', st)
      window.removeEventListener('listal:open-profile', prof)
      window.removeEventListener('listal:toggle-audio', ao)
      window.removeEventListener('listal:toggle-visualizer', vz)
    }
  }, [profile, convoySession, friendsOpen, convoyOpen, queueOpen, roomsOpen])

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <Toolbar
        lyricsOpen={lyricsOpen}
        onToggleLyrics={() => setLyricsOpen((o) => !o)}
        friendsOpen={friendsOpen}
        onToggleFriends={toggleFriends}
        convoyOpen={convoyOpen}
        onToggleConvoy={toggleConvoy}
        queueOpen={queueOpen}
        onToggleQueue={toggleQueue}
        onOpenAuth={() => setAuthOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        {initializing ? (
          <main className="min-w-0 flex-1 overflow-hidden bg-[var(--color-surface)]">
            <AuthSplash />
          </main>
        ) : !profile ? (
          <main className="min-w-0 flex-1 overflow-hidden bg-[var(--color-surface)]">
            <SignedOutPrompt onSignIn={() => setAuthOpen(true)} />
          </main>
        ) : (
          <>
            <TransportZone
              zone="left"
              orientation="vertical"
              lyricsOpen={lyricsOpen}
              onToggleLyrics={() => setLyricsOpen((o) => !o)}
              friendsOpen={friendsOpen}
              onToggleFriends={toggleFriends}
              convoyOpen={convoyOpen}
              onToggleConvoy={toggleConvoy}
              queueOpen={queueOpen}
              onToggleQueue={toggleQueue}
            />
            {renderPanels('left', {
              friendsOpen,
              convoyOpen,
              queueOpen,
              lyricsOpen,
              roomsOpen,
              convoySession,
              profile,
              panelSides,
              onCloseFriends: () => setFriendsOpen(false),
              onCloseConvoy: () => setConvoyOpen(false),
              onCloseQueue: () => setQueueOpen(false),
              onCloseLyrics: () => setLyricsOpen(false),
              onCloseRooms: () => setRoomsOpen(false)
            })}
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-hidden bg-[var(--color-surface)]">
              {view.kind === 'library' && <LibraryView />}
              {view.kind === 'search' && <SearchView />}
              {view.kind === 'playlist' && <PlaylistView playlistId={view.id} />}
              {view.kind === 'artist' && <ArtistView key={view.name} name={view.name} />}
              {view.kind === 'uploader' && (
                <UploaderView key={view.name} name={view.name} />
              )}
              {view.kind === 'radio' && (
                <RadioView key={view.seedUrl} seedUrl={view.seedUrl} seedTitle={view.seedTitle} />
              )}
              {view.kind === 'room' && <RoomView key={view.roomId} roomId={view.roomId} />}
            </main>
            <RightPanelColumn
              panelModes={panelModes}
              columnWidth={columnWidth}
              onColumnDrag={(dx) => setColumnWidth(columnWidth - dx)}
              friendsOpen={friendsOpen}
              convoyOpen={convoyOpen}
              queueOpen={queueOpen}
              lyricsOpen={lyricsOpen}
              roomsOpen={roomsOpen}
              chatOpen={chatOpen}
              convoySession={!!convoySession}
              onCloseFriends={() => setFriendsOpen(false)}
              onCloseConvoy={() => setConvoyOpen(false)}
              onCloseQueue={() => setQueueOpen(false)}
              onCloseLyrics={() => setLyricsOpen(false)}
              onCloseRooms={() => setRoomsOpen(false)}
            />
            <TransportZone
              zone="right"
              orientation="vertical"
              lyricsOpen={lyricsOpen}
              onToggleLyrics={() => setLyricsOpen((o) => !o)}
              friendsOpen={friendsOpen}
              onToggleFriends={toggleFriends}
              convoyOpen={convoyOpen}
              onToggleConvoy={toggleConvoy}
              queueOpen={queueOpen}
              onToggleQueue={toggleQueue}
            />
          </>
        )}
      </div>
      {profile && (
        <TransportZone
          zone="bottom"
          orientation="horizontal"
          lyricsOpen={lyricsOpen}
          onToggleLyrics={() => setLyricsOpen((o) => !o)}
          friendsOpen={friendsOpen}
          onToggleFriends={toggleFriends}
          convoyOpen={convoyOpen}
          onToggleConvoy={toggleConvoy}
          queueOpen={queueOpen}
          onToggleQueue={toggleQueue}
        />
      )}
      <StatusBar />
      <AddTrackDialog />
      {authOpen && !needsUsername && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {needsUsername && <ClaimUsernameDialog />}
      {profileOpen && profile && <ProfileDialog onClose={() => setProfileOpen(false)} />}
      {convoyDialogOpen && profile && (
        <ConvoyDialog
          onClose={() => {
            setConvoyDialogOpen(false)
            if (useConvoy.getState().session) setConvoyOpen(true)
          }}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {audioOpen && <AudioSettingsPanel onClose={() => setAudioOpen(false)} />}
      {vizOpen && <AudioVisualizerPanel onClose={() => setVizOpen(false)} />}
      {/* Floated panels — PanelShell renders each as a FloatingWindow when
          its stored mode is 'float', so we just always render them here and
          they either fall through as nulls (dock mode) or as floating
          windows. This keeps the state colocated with the panel. */}
      {lyricsOpen && panelModes.lyrics === 'float' && (
        <LyricsPanel onClose={() => setLyricsOpen(false)} />
      )}
      {convoyOpen && panelModes.convoy === 'float' && convoySession && profile && (
        <ConvoyPanel onClose={() => setConvoyOpen(false)} />
      )}
      {friendsOpen && panelModes.friends === 'float' && profile && (
        <FriendsPanel onClose={() => setFriendsOpen(false)} />
      )}
      {queueOpen && panelModes.queue === 'float' && (
        <QueuePanel onClose={() => setQueueOpen(false)} />
      )}
      {roomsOpen && panelModes.rooms === 'float' && profile && (
        <RoomsPanel onClose={() => setRoomsOpen(false)} />
      )}
      {chatOpen && panelModes.chat === 'float' && <ChatPanel />}
      <ToastLayer />
    </div>
  )
}

function AuthSplash(): React.JSX.Element {
  return (
    <div className="grid h-full place-items-center text-[12px] text-[var(--color-text-muted)]">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[var(--color-accent)]" />
        Restoring your session…
      </div>
    </div>
  )
}

function SignedOutPrompt({ onSignIn }: { onSignIn: () => void }): React.JSX.Element {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="max-w-[380px] text-center">
        <div className="mb-2 text-[16px] font-semibold text-[var(--color-text)]">
          Sign in to see your library
        </div>
        <div className="mb-4 text-[12px] text-[var(--color-text-muted)]">
          Playlists, friends, and Convoys are tied to your account. You'll be signed in on
          this machine until you sign out.
        </div>
        <button
          onClick={onSignIn}
          className="border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-4 py-1 text-[12px] font-semibold text-white hover:bg-[var(--grad-primary-hover)]"
        >
          Sign in
        </button>
      </div>
    </div>
  )
}

interface PanelRenderArgs {
  friendsOpen: boolean
  convoyOpen: boolean
  queueOpen: boolean
  lyricsOpen: boolean
  roomsOpen: boolean
  convoySession: unknown
  profile: unknown
  panelSides: Record<PanelKey, 'left' | 'right' | 'hidden'>
  onCloseFriends: () => void
  onCloseConvoy: () => void
  onCloseQueue: () => void
  onCloseLyrics: () => void
  onCloseRooms: () => void
}

// Rendering a panel on the left needs the border on the right; on the right,
// the border sits on the left. FriendsPanel/ConvoyPanel/QueuePanel/LyricsPanel
// already border themselves on the left, which suits "right" placement. For
// "left" placement we wrap and flip the border.
function renderPanels(side: 'left' | 'right', a: PanelRenderArgs): React.ReactNode {
  const wrap = (node: React.ReactNode): React.ReactNode =>
    side === 'left' ? (
      <div className="flex" style={{ order: -1 }}>
        {node}
      </div>
    ) : (
      node
    )

  return (
    <>
      {a.friendsOpen && a.profile && a.panelSides.friends === side && wrap(
        <FriendsPanel onClose={a.onCloseFriends} />
      )}
      {a.queueOpen && a.panelSides.queue === side && wrap(
        <QueuePanel onClose={a.onCloseQueue} />
      )}
      {a.roomsOpen && a.profile && a.panelSides.rooms === side && wrap(
        <RoomsPanel onClose={a.onCloseRooms} />
      )}
    </>
  )
}

interface RightColProps {
  panelModes: Record<import('./stores/panelMode').PanelKey, 'dock' | 'float'>
  columnWidth: number
  onColumnDrag: (dx: number) => void
  friendsOpen: boolean
  convoyOpen: boolean
  queueOpen: boolean
  lyricsOpen: boolean
  roomsOpen: boolean
  chatOpen: boolean
  convoySession: boolean
  onCloseFriends: () => void
  onCloseConvoy: () => void
  onCloseQueue: () => void
  onCloseLyrics: () => void
  onCloseRooms: () => void
}

// Single vertical stacked column on the right that hosts every open, docked
// panel. Each takes an equal share via flex-1, so two open panels split 50/50,
// three split 33/33/33, and so on. A vertical resizer on the left edge lets
// the user widen or shrink the whole column.
function RightPanelColumn(p: RightColProps): React.JSX.Element | null {
  const slots: React.ReactNode[] = []
  if (p.friendsOpen && p.panelModes.friends === 'dock') {
    slots.push(<FriendsPanel key="friends" onClose={p.onCloseFriends} />)
  }
  if (p.convoyOpen && p.convoySession && p.panelModes.convoy === 'dock') {
    slots.push(<ConvoyPanel key="convoy" onClose={p.onCloseConvoy} />)
  }
  if (p.queueOpen && p.panelModes.queue === 'dock') {
    slots.push(<QueuePanel key="queue" onClose={p.onCloseQueue} />)
  }
  if (p.roomsOpen && p.panelModes.rooms === 'dock') {
    slots.push(<RoomsPanel key="rooms" onClose={p.onCloseRooms} />)
  }
  if (p.lyricsOpen && p.panelModes.lyrics === 'dock') {
    slots.push(<LyricsPanel key="lyrics" onClose={p.onCloseLyrics} />)
  }
  if (p.chatOpen && p.panelModes.chat === 'dock') {
    slots.push(<ChatPanel key="chat" />)
  }

  if (slots.length === 0) return null

  function onResizeDown(e: React.MouseEvent): void {
    e.preventDefault()
    let last = e.clientX
    const move = (ev: MouseEvent): void => {
      const dx = ev.clientX - last
      last = ev.clientX
      p.onColumnDrag(dx)
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="flex h-full shrink-0">
      <div
        onMouseDown={onResizeDown}
        className="w-1 shrink-0 cursor-ew-resize bg-[var(--color-border-strong)] hover:bg-[var(--color-accent)]"
      />
      <div
        style={{ width: p.columnWidth }}
        className="flex h-full flex-col overflow-hidden border-l border-[var(--color-border-strong)] bg-[var(--color-shell)]"
      >
        {slots.map((slot, i) => (
          <div key={i} className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-[var(--color-border-strong)] last:border-b-0">
            {slot}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
