import { useState } from 'react'
import { X, Send, Loader2, Hash, User } from 'lucide-react'
import { useRooms } from '../stores/rooms'
import { useFriends } from '../stores/friends'
import { useChat } from '../stores/chat'
import { useAuth } from '../stores/auth'
import { encodeAttachment, type Attachment } from '../lib/attachments'

interface Props {
  attachment: Attachment
  onClose: () => void
}

// Modal to pick a destination for a shared song / playlist. Lists joined
// rooms and accepted friends. Sends the encoded attachment as a message.
export function ShareDialog({ attachment, onClose }: Props): React.JSX.Element {
  const joinedRooms = useRooms((s) => s.joined)
  const friendEntries = useFriends((s) => s.entries)
  const me = useAuth((s) => s.profile)
  const [tab, setTab] = useState<'rooms' | 'friends'>(
    joinedRooms.length > 0 ? 'rooms' : 'friends'
  )
  const [sending, setSending] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const encoded = encodeAttachment(attachment)

  async function sendToRoom(roomId: string): Promise<void> {
    setSending(`room:${roomId}`)
    setError(null)
    const res = await useRooms.getState().sendMessage(roomId, encoded)
    setSending(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSentTo(`room:${roomId}`)
  }

  async function sendToFriend(friendId: string): Promise<void> {
    if (!me) return
    setSending(`friend:${friendId}`)
    setError(null)
    // useChat.send takes the sender id and appends to the DM thread with
    // whichever peer is currently open — but that only works if we're
    // already in a chat with them. Send via Supabase directly so we don't
    // have to open the chat first.
    const { supabase } = await import('../lib/supabase')
    const { error: err } = await supabase.from('messages').insert({
      from_user: me.id,
      to_user: friendId,
      body: encoded
    })
    setSending(null)
    if (err) {
      setError(err.message)
      return
    }
    setSentTo(`friend:${friendId}`)
    // Suppress unused import warning
    void useChat
  }

  const friends = friendEntries.filter((e) => e.status === 'accepted')
  const summary =
    attachment.kind === 'song'
      ? `Song · ${attachment.song.title}`
      : `Playlist · ${attachment.playlist.name}`

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={onClose}>
      <div
        className="w-[380px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]">
          <Send size={11} />
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Share
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={12} />
          </button>
        </div>

        <div className="border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-2 text-[11.5px] text-[var(--color-text-muted)]">
          {summary}
        </div>

        <div className="flex border-b border-[var(--color-border)] bg-[var(--grad-transport)] text-[11px]">
          <TabBtn active={tab === 'rooms'} onClick={() => setTab('rooms')}>
            Rooms · {joinedRooms.length}
          </TabBtn>
          <TabBtn active={tab === 'friends'} onClick={() => setTab('friends')}>
            Friends · {friends.length}
          </TabBtn>
        </div>

        {error && (
          <div className="border-b border-[var(--color-border)] bg-red-500/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        <div className="max-h-[300px] overflow-y-auto">
          {tab === 'rooms' && (
            <>
              {joinedRooms.length === 0 && (
                <div className="px-3 py-3 text-[11px] text-[var(--color-text-dim)]">
                  Not in any rooms yet.
                </div>
              )}
              {joinedRooms.map((r) => {
                const key = `room:${r.id}`
                const isBusy = sending === key
                const isSent = sentTo === key
                return (
                  <TargetRow
                    key={r.id}
                    icon={<Hash size={11} />}
                    primary={r.name}
                    secondary={r.description ?? undefined}
                    busy={isBusy}
                    sent={isSent}
                    onClick={() => void sendToRoom(r.id)}
                  />
                )
              })}
            </>
          )}
          {tab === 'friends' && (
            <>
              {friends.length === 0 && (
                <div className="px-3 py-3 text-[11px] text-[var(--color-text-dim)]">
                  No friends yet. Add someone from the Friends panel.
                </div>
              )}
              {friends.map((e) => {
                const key = `friend:${e.profile.id}`
                const isBusy = sending === key
                const isSent = sentTo === key
                return (
                  <TargetRow
                    key={e.profile.id}
                    icon={
                      e.profile.avatar_url ? (
                        <img
                          src={e.profile.avatar_url}
                          alt=""
                          className="h-4 w-4 rounded-full border border-[var(--color-border)] object-cover"
                        />
                      ) : (
                        <User size={11} />
                      )
                    }
                    primary={e.profile.display_name ?? e.profile.username}
                    secondary={`@${e.profile.username}`}
                    busy={isBusy}
                    sent={isSent}
                    onClick={() => void sendToFriend(e.profile.id)}
                  />
                )
              })}
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-[var(--color-border)] bg-[var(--grad-header)] px-3 py-2">
          <button
            onClick={onClose}
            className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 py-1 text-[11.5px] hover:bg-[var(--grad-btn-hover)]"
          >
            Done
          </button>
        </div>
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
      className={`flex-1 border-r border-[var(--color-border)] px-3 py-1.5 text-left ${
        active
          ? 'bg-[var(--color-shell)] font-semibold text-[var(--color-text)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)]'
      }`}
    >
      {children}
    </button>
  )
}

function TargetRow({
  icon,
  primary,
  secondary,
  busy,
  sent,
  onClick
}: {
  icon: React.ReactNode
  primary: string
  secondary?: string
  busy: boolean
  sent: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={busy || sent}
      className="group flex w-full items-center gap-2 border-b border-[var(--color-border)]/40 px-3 py-1.5 text-left text-[11.5px] hover:bg-[var(--color-surface-3)] disabled:cursor-default disabled:opacity-70"
    >
      <span className="shrink-0 text-[var(--color-text-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{primary}</div>
        {secondary && (
          <div className="truncate text-[10px] text-[var(--color-text-dim)]">{secondary}</div>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-wider">
        {sent ? (
          <span className="text-[var(--color-accent)]">Sent</span>
        ) : busy ? (
          <Loader2 size={11} className="animate-spin text-[var(--color-text-muted)]" />
        ) : (
          <span className="opacity-0 text-[var(--color-accent)] group-hover:opacity-100">
            Send
          </span>
        )}
      </span>
    </button>
  )
}
