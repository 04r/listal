import { useEffect, useRef, useState } from 'react'
import { X, Send, Loader2 } from 'lucide-react'
import { useAuth } from '../stores/auth'
import { useChat } from '../stores/chat'

export function ChatPanel(): React.JSX.Element | null {
  const peer = useChat((s) => s.peer)
  const messages = useChat((s) => s.messages)
  const loading = useChat((s) => s.loading)
  const error = useChat((s) => s.error)
  const close = useChat((s) => s.close)
  const send = useChat((s) => s.send)
  const me = useAuth((s) => s.profile)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll to the newest message on every new arrival.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  if (!peer) return null

  async function onSend(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!me) return
    const text = draft
    setDraft('')
    await send(me.id, text)
  }

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-shell)]">
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[linear-gradient(#f0f0f0,#e6e6e6)] px-2 text-[11px]">
        <span className="truncate font-semibold text-[var(--color-text)]">
          {peer.display_name ?? peer.username}
        </span>
        <span className="truncate text-[var(--color-text-dim)]">@{peer.username}</span>
        <button
          onClick={() => void close()}
          className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X size={12} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[var(--color-surface)] px-2 py-2">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
            <Loader2 size={11} className="animate-spin" />
            Loading…
          </div>
        )}
        {error && (
          <div className="border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
            {error}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-[11px] text-[var(--color-text-dim)]">
            Say hi to @{peer.username}.
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {messages.map((m) => {
            const mine = me && m.from_user === me.id
            return (
              <div
                key={m.id}
                className={`max-w-[220px] px-2 py-1 text-[12px] leading-snug ${
                  mine
                    ? 'self-end bg-[var(--color-row-current)] text-white'
                    : 'self-start bg-white text-[var(--color-text)] border border-[var(--color-border)]'
                }`}
              >
                {m.body}
              </div>
            )
          })}
        </div>
      </div>

      <form onSubmit={onSend} className="flex items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-shell)] px-2 py-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          className="h-6 flex-1 border border-[var(--color-border-strong)] bg-white px-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="grid h-6 w-6 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] hover:bg-[linear-gradient(#ffffff,#cccccc)] disabled:opacity-40"
        >
          <Send size={11} />
        </button>
      </form>
    </aside>
  )
}
