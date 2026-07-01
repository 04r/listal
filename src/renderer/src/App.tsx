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
import { SettingsDialog } from './components/SettingsDialog'
import { TransportZone } from './components/TransportZone'
import { ChatPanel } from './components/ChatPanel'
import { AddTrackDialog } from './components/AddTrackDialog'
import { useLibrary } from './stores/library'
import { useAuth } from './stores/auth'
import { useSocial } from './stores/social'
import { useFriends } from './stores/friends'
import { useConvoy } from './stores/convoy'
import { startConvoyPlayerSync, stopConvoyPlayerSync } from './stores/convoyPlayerSync'
import { usePlayer } from './stores/player'
import { useLyrics } from './stores/lyrics'
import { useSettings, applySettingsToDom, type PanelKey } from './stores/settings'

function App(): React.JSX.Element {
  const view = useLibrary((s) => s.view)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [convoyOpen, setConvoyOpen] = useState(false)
  const [convoyDialogOpen, setConvoyDialogOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const panelSides = useSettings((s) => s.panelSides)

  // Push theme + accent onto <html> whenever they change.
  useEffect(() => {
    applySettingsToDom({ theme, accent })
  }, [theme, accent])
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
      startConvoyPlayerSync()
    } else {
      void useSocial.getState().stop()
      void useFriends.getState().stop()
      void useConvoy.getState().leave()
      useConvoy.getState().setMeId(null)
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
    }
  }

  // Menubar dispatches custom events; listen here so panels toggle without
  // having to thread setters through every level.
  useEffect(() => {
    const lyr = (): void => setLyricsOpen((v) => !v)
    const fr = (): void => toggleFriends()
    const cvy = (): void => toggleConvoy()
    const q = (): void => toggleQueue()
    const st = (): void => setSettingsOpen(true)
    const prof = (): void => {
      if (profile) setProfileOpen(true)
      else setAuthOpen(true)
    }
    window.addEventListener('listal:toggle-lyrics', lyr)
    window.addEventListener('listal:toggle-friends', fr)
    window.addEventListener('listal:toggle-convoy', cvy)
    window.addEventListener('listal:toggle-queue', q)
    window.addEventListener('listal:open-settings', st)
    window.addEventListener('listal:open-profile', prof)
    return () => {
      window.removeEventListener('listal:toggle-lyrics', lyr)
      window.removeEventListener('listal:toggle-friends', fr)
      window.removeEventListener('listal:toggle-convoy', cvy)
      window.removeEventListener('listal:toggle-queue', q)
      window.removeEventListener('listal:open-settings', st)
      window.removeEventListener('listal:open-profile', prof)
    }
  }, [profile, convoySession, friendsOpen, convoyOpen, queueOpen])

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
              convoySession,
              profile,
              panelSides,
              onCloseFriends: () => setFriendsOpen(false),
              onCloseConvoy: () => setConvoyOpen(false),
              onCloseQueue: () => setQueueOpen(false),
              onCloseLyrics: () => setLyricsOpen(false)
            })}
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-hidden bg-[var(--color-surface)]">
              {view.kind === 'library' && <LibraryView />}
              {view.kind === 'search' && <SearchView />}
              {view.kind === 'playlist' && <PlaylistView playlistId={view.id} />}
              {view.kind === 'artist' && <ArtistView key={view.name} name={view.name} />}
              {view.kind === 'uploader' && <UploaderView key={view.name} name={view.name} />}
              {view.kind === 'radio' && (
                <RadioView key={view.seedUrl} seedUrl={view.seedUrl} seedTitle={view.seedTitle} />
              )}
            </main>
            {renderPanels('right', {
              friendsOpen,
              convoyOpen,
              queueOpen,
              lyricsOpen,
              convoySession,
              profile,
              panelSides,
              onCloseFriends: () => setFriendsOpen(false),
              onCloseConvoy: () => setConvoyOpen(false),
              onCloseQueue: () => setQueueOpen(false),
              onCloseLyrics: () => setLyricsOpen(false)
            })}
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
            <ChatPanel />
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
  convoySession: unknown
  profile: unknown
  panelSides: Record<PanelKey, 'left' | 'right' | 'hidden'>
  onCloseFriends: () => void
  onCloseConvoy: () => void
  onCloseQueue: () => void
  onCloseLyrics: () => void
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
      {a.convoyOpen && a.profile && a.convoySession && a.panelSides.convoy === side && wrap(
        <ConvoyPanel onClose={a.onCloseConvoy} />
      )}
      {a.queueOpen && a.panelSides.queue === side && wrap(
        <QueuePanel onClose={a.onCloseQueue} />
      )}
      {a.lyricsOpen && a.panelSides.lyrics === side && wrap(
        <LyricsPanel onClose={a.onCloseLyrics} />
      )}
    </>
  )
}

export default App
