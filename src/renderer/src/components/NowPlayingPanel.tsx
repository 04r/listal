import { X } from 'lucide-react'
import { usePlayer } from '../stores/player'

interface Props {
  onClose: () => void
}

export function NowPlayingPanel({ onClose }: Props): React.JSX.Element {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const track = index >= 0 ? queue[index] : null

  return (
    <aside className="hidden w-[360px] shrink-0 flex-col gap-2 bg-black px-2 pb-2 lg:flex">
      <div className="flex flex-1 flex-col overflow-y-auto rounded-lg bg-[var(--color-shell)]">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="text-sm font-semibold">
            {track ? track.title : 'Now playing'}
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {track?.thumbnailUrl ? (
            <img
              src={track.thumbnailUrl}
              alt=""
              className="aspect-square w-full rounded-md object-cover shadow-2xl"
            />
          ) : (
            <div className="aspect-square w-full rounded-md bg-[var(--color-surface-2)]" />
          )}
          {track && (
            <div className="mt-4">
              <div className="truncate text-xl font-bold">{track.title}</div>
              <div className="truncate text-sm text-[var(--color-text-muted)]">
                {track.artist ?? '—'}
              </div>
            </div>
          )}
        </div>

        {queue.length > 1 && (
          <div className="px-4 pb-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Up next
            </div>
            <ul className="flex flex-col gap-2">
              {queue.slice(index + 1, index + 6).map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-md p-1 hover:bg-[var(--color-surface)]">
                  {t.thumbnailUrl ? (
                    <img src={t.thumbnailUrl} alt="" className="h-9 w-9 rounded object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded bg-[var(--color-surface-2)]" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{t.title}</div>
                    <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {t.artist ?? '—'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  )
}
