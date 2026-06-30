import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useLibrary } from '../stores/library'

export function AddTrackDialog(): React.JSX.Element | null {
  const { addDialogOpen, closeAdd, view, bump } = useLibrary()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!addDialogOpen) return null

  const targetLabel =
    view.kind === 'playlist' ? 'this playlist' : 'your library'
  const targetPlaylistId = view.kind === 'playlist' ? view.id : null

  async function submit(): Promise<void> {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    const res = await window.api.addTrackFromUrl(trimmed, targetPlaylistId)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setUrl('')
    bump()
    closeAdd()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={closeAdd}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add a track</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Paste a link from YouTube, SoundCloud, Bandcamp, or Spotify.
              Goes into {targetLabel}.
            </p>
          </div>
          <button
            onClick={closeAdd}
            className="grid h-8 w-8 place-items-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            <X size={16} />
          </button>
        </div>

        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) void submit()
          }}
          placeholder="https://..."
          disabled={loading}
          className="mt-5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)] disabled:opacity-50"
        />

        {error && (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={closeAdd}
            disabled={loading}
            className="rounded-md px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={loading || !url.trim()}
            className="flex min-w-[88px] items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
