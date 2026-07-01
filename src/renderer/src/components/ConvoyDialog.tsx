import { useEffect, useState } from 'react'
import { X, Loader2, Radio } from 'lucide-react'
import { useConvoy } from '../stores/convoy'

interface Props {
  onClose: () => void
}

// Two-tab dialog: start a new Convoy or join an existing one by code.
export function ConvoyDialog({ onClose }: Props): React.JSX.Element {
  const session = useConvoy((s) => s.session)
  const loading = useConvoy((s) => s.loading)
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('')
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // If a Convoy already exists (they opened the dialog after starting one),
  // jump straight to the share-code view.
  useEffect(() => {
    if (session) setCreatedCode(session.code)
  }, [session])

  async function onCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    const res = await useConvoy.getState().createConvoy(name.trim() || undefined)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setCreatedCode(res.code)
  }

  async function onJoin(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    const res = await useConvoy.getState().joinByCode(joinCode)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onClose()
  }

  function copyCode(): void {
    if (!createdCode) return
    void navigator.clipboard.writeText(createdCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

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
          <Radio size={11} />
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Convoy
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={12} />
          </button>
        </div>

        {createdCode ? (
          <div className="space-y-3 p-4 text-[12px]">
            <p className="text-[var(--color-text-muted)]">
              Convoy is live. Share the code with anyone you want to bring in.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 select-all border border-[var(--color-border-strong)] bg-white px-3 py-2 text-center font-mono text-[16px] font-semibold tracking-widest text-[var(--color-text)]">
                {createdCode}
              </div>
              <button
                onClick={copyCode}
                className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 py-2 hover:bg-[var(--grad-btn-hover)]"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[10.5px] text-[var(--color-text-dim)]">
              They open Listal → Convoy → Join by code.
            </p>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
              <button
                onClick={onClose}
                className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 py-1 hover:bg-[var(--grad-btn-hover)]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex border-b border-[var(--color-border)] bg-[var(--grad-transport)] text-[11px]">
              <TabBtn active={tab === 'create'} onClick={() => setTab('create')}>
                Start a Convoy
              </TabBtn>
              <TabBtn active={tab === 'join'} onClick={() => setTab('join')}>
                Join by code
              </TabBtn>
            </div>

            {tab === 'create' ? (
              <form onSubmit={onCreate} className="space-y-2 p-3 text-[12px]">
                <label className="block">
                  <span className="mb-1 block text-[10.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Name (optional)
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="Friday night queue"
                    className="h-6 w-full border border-[var(--color-border-strong)] bg-white px-2 text-[12px] outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
                {error && (
                  <div className="text-[11px] text-[var(--color-danger)]">{error}</div>
                )}
                <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 py-1 hover:bg-[var(--grad-btn-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-3 py-1 font-semibold text-white hover:bg-[var(--grad-primary-hover)]"
                  >
                    {loading && <Loader2 size={11} className="animate-spin" />}
                    Start
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={onJoin} className="space-y-2 p-3 text-[12px]">
                <label className="block">
                  <span className="mb-1 block text-[10.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Convoy code
                  </span>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    autoFocus
                    placeholder="CVY-ABC-123"
                    className="h-8 w-full border border-[var(--color-border-strong)] bg-white px-2 text-center font-mono text-[14px] tracking-widest outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
                {error && (
                  <div className="text-[11px] text-[var(--color-danger)]">{error}</div>
                )}
                <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 py-1 hover:bg-[var(--grad-btn-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !joinCode.trim()}
                    className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-3 py-1 font-semibold text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-50"
                  >
                    {loading && <Loader2 size={11} className="animate-spin" />}
                    Join
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-r border-[var(--color-border)] px-3 py-1.5 ${
        active
          ? 'bg-[var(--color-shell)] font-semibold text-[var(--color-text)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)]'
      }`}
    >
      {children}
    </button>
  )
}
