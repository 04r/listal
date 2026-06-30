import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useAuth } from '../stores/auth'

interface Props {
  onClose: () => void
}

type Mode = 'signin' | 'signup'

export function AuthDialog({ onClose }: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signIn = useAuth((s) => s.signIn)
  const signUp = useAuth((s) => s.signUp)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res =
        mode === 'signin'
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password, username, displayName)
      if (!res.ok) {
        setError(res.error)
        // If sign-up failed because the email already exists, flip the dialog
        // straight into sign-in mode so the user can keep the same credentials.
        if (mode === 'signup' && /already registered|sign in instead/i.test(res.error)) {
          setMode('signin')
        }
        return
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[360px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[linear-gradient(#f0f0f0,#e6e6e6)] px-2 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={12} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-2 p-3 text-[12px]">
          {mode === 'signup' && (
            <>
              <Field
                label="Username"
                value={username}
                onChange={setUsername}
                placeholder="lowercase, 2-32 chars"
                autoFocus
              />
              <Field
                label="Display name"
                value={displayName}
                onChange={setDisplayName}
                placeholder="(optional)"
              />
            </>
          )}
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="Password" value={password} onChange={setPassword} type="password" />

          {error && (
            <div className="border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="grid h-6 min-w-[80px] place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] px-3 text-[12px] hover:bg-[linear-gradient(#ffffff,#cccccc)] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Sign up'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
              }}
              className="text-[11px] text-[var(--color-link)] hover:underline"
            >
              {mode === 'signin' ? 'Create account instead' : 'Sign in instead'}
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
  type = 'text',
  placeholder,
  autoFocus
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoFocus?: boolean
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-6 flex-1 border border-[var(--color-border-strong)] bg-white px-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  )
}
