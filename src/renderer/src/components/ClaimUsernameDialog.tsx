import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../stores/auth'

// Shown when the user is authenticated but has no profile row yet — typical
// after a sign-up that succeeded before the SQL schema existed, or a
// confirmation-email signup where the profile insert was skipped.
export function ClaimUsernameDialog(): React.JSX.Element {
  const claim = useAuth((s) => s.claimUsername)
  const signOut = useAuth((s) => s.signOut)
  const user = useAuth((s) => s.user)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await claim(username, displayName)
    setBusy(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-[380px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] shadow-2xl">
        <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Finish setup
          </span>
          {user?.email && (
            <span className="text-[var(--color-text-dim)]">{user.email}</span>
          )}
        </div>

        <form onSubmit={submit} className="space-y-2 p-3 text-[12px]">
          <p className="text-[11px] text-[var(--color-text-muted)]">
            You're signed in, but your profile hasn't been created yet. Pick a username
            to finish setup.
          </p>
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[var(--color-text-muted)]">Username</span>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="lowercase, 2-32 chars"
              className="h-6 flex-1 border border-[var(--color-border-strong)] bg-white px-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[var(--color-text-muted)]">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="(optional)"
              className="h-6 flex-1 border border-[var(--color-border-strong)] bg-white px-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>

          {error && (
            <div className="border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="grid h-6 min-w-[100px] place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 text-[12px] hover:bg-[var(--grad-btn-hover)] disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : 'Claim username'}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"
            >
              Sign out instead
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
