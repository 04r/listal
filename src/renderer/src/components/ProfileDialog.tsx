import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useAuth } from '../stores/auth'

interface Props {
  onClose: () => void
}

// Edit display name, username, and avatar URL. Username changes are gated by
// the same regex + uniqueness check the signUp flow uses.
export function ProfileDialog({ onClose }: Props): React.JSX.Element {
  const me = useAuth((s) => s.profile)
  const updateProfile = useAuth((s) => s.updateProfile)
  const [username, setUsername] = useState(me?.username ?? '')
  const [displayName, setDisplayName] = useState(me?.display_name ?? '')
  const [avatarUrl, setAvatarUrl] = useState(me?.avatar_url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!me) return
    setError(null)
    setSaved(false)
    setBusy(true)
    const res = await updateProfile({
      username: username !== me.username ? username : undefined,
      display_name: displayName.trim() || null,
      avatar_url: avatarUrl.trim() || null
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSaved(true)
  }

  if (!me) return <></>

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[420px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Profile
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={12} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-2 p-3 text-[12px]">
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-12 w-12 rounded-full border border-[var(--color-border-strong)] object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.opacity = '0.3'
                }}
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[14px] font-semibold text-[var(--color-text-muted)]">
                {me.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="text-[11px] text-[var(--color-text-muted)]">
              Preview · changes are live for friends after save
            </div>
          </div>

          <Field
            label="Username"
            value={username}
            onChange={(v) => setUsername(v.toLowerCase())}
            placeholder="lowercase, 2-32 chars"
          />
          <Field
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="(optional)"
          />
          <Field
            label="Avatar URL"
            value={avatarUrl}
            onChange={setAvatarUrl}
            placeholder="https://… (optional)"
          />

          {error && (
            <div className="border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="border border-green-500/40 bg-green-500/10 px-2 py-1 text-[11px] text-green-700">
              Saved.
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="grid h-6 min-w-[100px] place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 text-[12px] hover:bg-[var(--grad-btn-hover)] disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-6 flex-1 border border-[var(--color-border-strong)] bg-white px-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  )
}
