import { useEffect, useState } from 'react'
import type { Track } from '../../../preload'
import { useLibrary } from '../stores/library'
import { usePlayer } from '../stores/player'
import { TrackList } from './TrackList'

export function LibraryView(): React.JSX.Element {
  const { version, bump } = useLibrary()
  const [tracks, setTracks] = useState<Track[]>([])
  const playQueue = usePlayer((s) => s.playQueue)

  useEffect(() => {
    window.api.listLibraryTracks().then(setTracks)
  }, [version])

  return (
    <ContentSurface>
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Library
        </span>
        <span className="text-[var(--color-text-dim)]">
          {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
        </span>
      </div>

      {tracks.length === 0 ? (
        <div className="px-3 py-6 text-[11px] text-[var(--color-text-muted)]">
          Empty. Use the Search box up top to find and add tracks.
        </div>
      ) : (
        <TrackList
          tracks={tracks}
          onPlay={(i) => void playQueue(tracks, i)}
          onRemove={async (t) => {
            await window.api.deleteTrack(t.id)
            bump()
          }}
        />
      )}
    </ContentSurface>
  )
}

export function ContentSurface({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface)]">{children}</div>
  )
}
