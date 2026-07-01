import { X, ListMusic, Play, Trash2, Music, Eraser } from 'lucide-react'
import { usePlayer } from '../stores/player'

interface Props {
  onClose: () => void
}

export function QueuePanel({ onClose }: Props): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playing = usePlayer((s) => s.playing)
  const playAt = usePlayer((s) => s.playAt)
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)
  const clearQueue = usePlayer((s) => s.clearQueue)

  const upcoming = queue.slice(index + 1)
  const current = index >= 0 ? queue[index] : null

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-shell)]">
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border-strong)] bg-[var(--grad-header)] px-2 text-[11px]">
        <ListMusic size={11} />
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Queue · {queue.length}
        </span>
        <button
          onClick={clearQueue}
          disabled={upcoming.length === 0}
          title="Clear up-next"
          className="ml-auto grid h-5 w-5 place-items-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] disabled:opacity-30"
        >
          <Eraser size={11} />
        </button>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X size={12} />
        </button>
      </div>

      {current && (
        <div>
          <div className="border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Now playing
          </div>
          <Row
            track={current}
            active
            playing={playing}
            onPlay={() => {}}
            onRemove={null}
          />
        </div>
      )}

      <div>
        <div className="border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          Up next · {upcoming.length}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {upcoming.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-[var(--color-text-dim)]">
              Queue is empty. Right-click a track for Song Radio, or add tracks to a playlist and hit play.
            </div>
          ) : (
            upcoming.map((t, i) => {
              const absoluteIndex = index + 1 + i
              return (
                <Row
                  key={`${t.id}-${absoluteIndex}`}
                  track={t}
                  active={false}
                  playing={false}
                  onPlay={() => void playAt(absoluteIndex)}
                  onRemove={() => removeFromQueue(absoluteIndex)}
                />
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}

function Row({
  track,
  active,
  playing,
  onPlay,
  onRemove
}: {
  track: { title: string; artist: string | null; thumbnailUrl: string | null }
  active: boolean
  playing: boolean
  onPlay: () => void
  onRemove: (() => void) | null
}): React.JSX.Element {
  return (
    <div
      onDoubleClick={onPlay}
      className={`group flex items-center gap-2 border-b border-[var(--color-border)]/40 px-2 py-1 text-[11px] ${
        active ? 'bg-[var(--color-row-current)] text-[var(--color-row-current-fg)]' : 'hover:bg-[var(--color-surface-3)]'
      }`}
    >
      {track.thumbnailUrl ? (
        <img
          src={track.thumbnailUrl}
          alt=""
          className="h-7 w-7 shrink-0 border border-[var(--color-border)] object-cover"
        />
      ) : (
        <div className="grid h-7 w-7 shrink-0 place-items-center border border-[var(--color-border)] bg-[var(--color-surface)]">
          <Music size={10} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {active && playing ? '▶ ' : ''}
          {track.title}
        </div>
        <div className={`truncate text-[10px] ${active ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`}>
          {track.artist ?? '—'}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
        {!active && (
          <button
            onClick={onPlay}
            title="Play now"
            className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
          >
            <Play size={9} fill="currentColor" />
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove from queue"
            className={`text-[var(--color-text-muted)] hover:text-[var(--color-danger)] ${
              active ? 'text-white' : ''
            }`}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  )
}
