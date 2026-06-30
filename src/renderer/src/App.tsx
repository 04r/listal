import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { LibraryView } from './components/LibraryView'
import { PlaylistView } from './components/PlaylistView'
import { SearchView } from './components/SearchView'
import { ArtistView } from './components/ArtistView'
import { UploaderView } from './components/UploaderView'
import { LyricsPanel } from './components/LyricsPanel'
import { AuthDialog } from './components/AuthDialog'
import { ClaimUsernameDialog } from './components/ClaimUsernameDialog'
import { FriendsPanel } from './components/FriendsPanel'
import { ChatPanel } from './components/ChatPanel'
import { AddTrackDialog } from './components/AddTrackDialog'
import { useLibrary } from './stores/library'
import { useAuth } from './stores/auth'
import { useSocial } from './stores/social'

function App(): React.JSX.Element {
  const view = useLibrary((s) => s.view)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const profile = useAuth((s) => s.profile)
  const needsUsername = useAuth((s) => s.needsUsername)

  // Spin up presence channels once we know who we are. Cleaning these up on
  // sign-out releases the Supabase realtime sockets.
  useEffect(() => {
    if (profile?.id) useSocial.getState().start(profile.id)
    else void useSocial.getState().stop()
  }, [profile?.id])

  // Friends panel only makes sense when signed in.
  function toggleFriends(): void {
    if (!profile) {
      setAuthOpen(true)
      return
    }
    setFriendsOpen((v) => !v)
  }

  // Menubar dispatches custom events; listen here so panels toggle without
  // having to thread setters through every level.
  useEffect(() => {
    const lyr = (): void => setLyricsOpen((v) => !v)
    const fr = (): void => toggleFriends()
    window.addEventListener('listal:toggle-lyrics', lyr)
    window.addEventListener('listal:toggle-friends', fr)
    return () => {
      window.removeEventListener('listal:toggle-lyrics', lyr)
      window.removeEventListener('listal:toggle-friends', fr)
    }
  }, [profile])

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <Toolbar
        lyricsOpen={lyricsOpen}
        onToggleLyrics={() => setLyricsOpen((o) => !o)}
        friendsOpen={friendsOpen}
        onToggleFriends={toggleFriends}
        onOpenAuth={() => setAuthOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden bg-[var(--color-surface)]">
          {view.kind === 'library' && <LibraryView />}
          {view.kind === 'search' && <SearchView />}
          {view.kind === 'playlist' && <PlaylistView playlistId={view.id} />}
          {view.kind === 'artist' && <ArtistView key={view.name} name={view.name} />}
          {view.kind === 'uploader' && <UploaderView key={view.name} name={view.name} />}
        </main>
        {friendsOpen && profile && <FriendsPanel onClose={() => setFriendsOpen(false)} />}
        <ChatPanel />
        {lyricsOpen && <LyricsPanel onClose={() => setLyricsOpen(false)} />}
      </div>
      <StatusBar />
      <AddTrackDialog />
      {authOpen && !needsUsername && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {needsUsername && <ClaimUsernameDialog />}
    </div>
  )
}

export default App
