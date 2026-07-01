import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, LogOut, Users, Loader2 } from 'lucide-react'
import { useRooms, type RoomMessage } from '../stores/rooms'

// Stable reference for the empty-messages case. Returning a fresh `[]` from a
// zustand selector every render was causing "The result of getSnapshot
// should be cached" and an infinite update loop — React unmounts the tree
// after `Maximum update depth exceeded`, which is what left the room area
// blank.
const NO_MESSAGES: RoomMessage[] = []
import { useAuth } from '../stores/auth'
import { useLibrary } from '../stores/library'
import { decodeAttachment } from '../lib/attachments'
import { SharedSongCard, SharedPlaylistCard } from './SharedCards'

interface Props {
  roomId: string
}

export function RoomView({ roomId }: Props): React.JSX.Element {
  const room = useRooms((s) => s.joined.find((r) => r.id === roomId))
  const messages = useRooms((s) => s.messages[roomId] ?? NO_MESSAGES)
  const me = useAuth((s) => s.profile)
  const setView = useLibrary((s) => s.setView)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void useRooms.getState().loadMessages(roomId)
  }, [roomId])

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  async function send(): Promise<void> {
    if (!body.trim() || sending) return
    setSending(true)
    setError(null)
    const res = await useRooms.getState().sendMessage(roomId, body)
    setSending(false)
    if (!res.ok) setError(res.error)
    else setBody('')
  }

  async function leave(): Promise<void> {
    if (!confirm(`Leave #${room?.name ?? 'room'}?`)) return
    await useRooms.getState().leaveRoom(roomId)
    setView({ kind: 'library' })
  }

  if (!room) {
    // Explicitly render something so the main area is never blank while the
    // joined list catches up after a fresh join.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[var(--color-surface)] text-[11px] text-[var(--color-text-muted)]">
        <Loader2 size={14} className="animate-spin" />
        Loading room…
        <span className="text-[10px] text-[var(--color-text-dim)]">
          If this hangs, open the Rooms panel and join the room from Browse.
        </span>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-surface)]">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-2 text-[11px]">
        <MessageSquare size={11} />
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Room
        </span>
        <span className="font-semibold text-[var(--color-text)]">#{room.name}</span>
        {room.description && (
          <span className="truncate text-[var(--color-text-dim)]">· {room.description}</span>
        )}
        <button
          onClick={() => void leave()}
          title="Leave room"
          className="ml-auto flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 text-[var(--color-danger)] hover:bg-[var(--grad-btn-hover)]"
        >
          <LogOut size={10} />
          Leave
        </button>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface)] px-3 py-2 text-[12px]"
      >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-[11px] text-[var(--color-text-dim)]">
            <div className="flex items-center gap-2">
              <Users size={12} />
              No messages yet. Say something.
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const isMe = m.from_user === me?.id
          const prev = messages[i - 1]
          // Group consecutive messages from the same author within 5 min.
          const grouped =
            prev &&
            prev.from_user === m.from_user &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
          return (
            <div key={m.id} className={`flex gap-2 ${grouped ? 'mt-0.5' : 'mt-2'}`}>
              <div className="w-6 shrink-0">
                {!grouped &&
                  (m.profile?.avatar_url ? (
                    <img
                      src={m.profile.avatar_url}
                      alt=""
                      className="h-5 w-5 rounded-full border border-[var(--color-border)] object-cover"
                    />
                  ) : (
                    <span className="grid h-5 w-5 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[9px] font-semibold text-[var(--color-text-muted)]">
                      {(m.profile?.username ?? '?').slice(0, 1).toUpperCase()}
                    </span>
                  ))}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-[11.5px] font-semibold ${
                        isMe ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'
                      }`}
                    >
                      {m.profile?.display_name ?? m.profile?.username ?? 'unknown'}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-dim)]">
                      {fmtTime(m.created_at)}
                    </span>
                  </div>
                )}
                <MessageBody body={m.body} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-shell)] px-2 py-1.5">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={`Message #${room.name}`}
          maxLength={2000}
          className="h-6 flex-1 border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !body.trim()}
          className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-2 py-0.5 text-[11.5px] font-semibold text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-40"
        >
          <Send size={10} />
          Send
        </button>
      </div>
      {error && (
        <div className="border-t border-[var(--color-border)] bg-red-500/10 px-3 py-1 text-[11px] text-[var(--color-danger)]">
          {error}
        </div>
      )}
    </div>
  )
}

function MessageBody({ body }: { body: string }): React.JSX.Element {
  const attach = decodeAttachment(body)
  if (attach?.kind === 'song') return <SharedSongCard song={attach.song} />
  if (attach?.kind === 'playlist') return <SharedPlaylistCard playlist={attach.playlist} />
  return (
    <div className="whitespace-pre-wrap break-words text-[12px] text-[var(--color-text)]">
      {body}
    </div>
  )
}


function fmtTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
