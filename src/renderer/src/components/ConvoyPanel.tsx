import { useState } from 'react'
import { X, Radio, Copy, LogOut, Music, UserPlus, Check } from 'lucide-react'
import { useConvoy } from '../stores/convoy'
import { useFriends } from '../stores/friends'
import { useAuth } from '../stores/auth'

interface Props {
  onClose: () => void
}

export function ConvoyPanel({ onClose }: Props): React.JSX.Element {
  const session = useConvoy((s) => s.session)
  const participants = useConvoy((s) => s.participants)
  const queue = useConvoy((s) => s.queue)
  const me = useAuth((s) => s.profile)
  const friendEntries = useFriends((s) => s.entries)
  const [copied, setCopied] = useState(false)
  const [inviteBusy, setInviteBusy] = useState<string | null>(null)

  if (!session || !me) {
    return (
      <aside className="flex w-[280px] shrink-0 flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-shell)]">
        <PanelHead onClose={onClose} />
        <div className="p-3 text-[11px] text-[var(--color-text-muted)]">Not in a Convoy.</div>
      </aside>
    )
  }

  const participantIds = new Set(participants.map((p) => p.user_id))
  const friends = friendEntries
    .filter((e) => e.status === 'accepted' && !participantIds.has(e.profile.id))

  function copyCode(): void {
    if (!session) return
    void navigator.clipboard.writeText(session.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  async function invite(userId: string): Promise<void> {
    setInviteBusy(userId)
    await useConvoy.getState().invite(userId)
    setInviteBusy(null)
  }

  async function leaveConvoy(): Promise<void> {
    const s = useConvoy.getState().session
    const meProfile = useAuth.getState().profile
    if (!s || !meProfile) return
    const isHost = s.host_id === meProfile.id
    const msg = isHost ? 'End the Convoy for everyone?' : 'Leave this Convoy?'
    if (!confirm(msg)) return
    await useConvoy.getState().leave()
    onClose()
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-shell)]">
      <PanelHead onClose={onClose} />

      {/* Code + leave */}
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          Code
        </div>
        <div className="flex items-center gap-1">
          <div className="flex-1 select-all border border-[var(--color-border)] bg-white px-2 py-1 text-center font-mono text-[13px] font-semibold tracking-widest">
            {session.code}
          </div>
          <button
            onClick={copyCode}
            title="Copy code"
            className="grid h-6 w-6 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
          >
            {copied ? <Check size={11} /> : <Copy size={10} />}
          </button>
          <button
            onClick={() => void leaveConvoy()}
            title={session.host_id === me.id ? 'End Convoy' : 'Leave Convoy'}
            className="grid h-6 w-6 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-danger)] hover:bg-[var(--grad-btn-hover)]"
          >
            <LogOut size={10} />
          </button>
        </div>
        {session.name && (
          <div className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">
            {session.name}
          </div>
        )}
      </div>

      {/* Participants */}
      <Section title={`Listeners · ${participants.length}`}>
        {participants.map((p) => {
          const isHost = session.host_id === p.user_id
          const isMe = me.id === p.user_id
          const profile = p.profile
          if (!profile) return null
          return (
            <div
              key={p.user_id}
              className="flex items-center gap-2 border-b border-[var(--color-border)]/40 px-2 py-1 text-[11px]"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-4 w-4 rounded-full border border-[var(--color-border)] object-cover"
                />
              ) : (
                <span className="grid h-4 w-4 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[8px] font-semibold text-[var(--color-text-muted)]">
                  {profile.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate font-medium">
                {profile.display_name ?? profile.username}
              </span>
              <span className="truncate text-[10px] text-[var(--color-text-dim)]">
                @{profile.username}
              </span>
              <span className="ml-auto flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {isMe && <span>you</span>}
                {isHost && (
                  <span className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-1">
                    Host
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </Section>

      {/* Invite friends */}
      {friends.length > 0 && (
        <Section title="Invite a friend">
          {friends.slice(0, 8).map((e) => (
            <button
              key={e.profile.id}
              onClick={() => void invite(e.profile.id)}
              disabled={inviteBusy === e.profile.id}
              className="flex w-full items-center gap-2 border-b border-[var(--color-border)]/40 px-2 py-1 text-left text-[11px] hover:bg-[var(--color-surface-3)] disabled:opacity-50"
            >
              {e.profile.avatar_url ? (
                <img
                  src={e.profile.avatar_url}
                  alt=""
                  className="h-4 w-4 rounded-full border border-[var(--color-border)] object-cover"
                />
              ) : (
                <span className="grid h-4 w-4 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[8px] font-semibold text-[var(--color-text-muted)]">
                  {e.profile.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">@{e.profile.username}</span>
              <UserPlus size={10} className="ml-auto text-[var(--color-text-muted)]" />
            </button>
          ))}
        </Section>
      )}

      {/* Now playing */}
      <Section title="Now playing">
        {session.current_track_title ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
            {session.current_track_thumbnail ? (
              <img
                src={session.current_track_thumbnail}
                alt=""
                className="h-8 w-8 border border-[var(--color-border)] object-cover"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center border border-[var(--color-border)] bg-[var(--color-surface)]">
                <Music size={12} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{session.current_track_title}</div>
              <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                {session.current_track_artist ?? session.current_track_service}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-2 py-1.5 text-[10.5px] text-[var(--color-text-dim)]">
            Nothing playing. Anyone can start.
          </div>
        )}
      </Section>

      {/* Shared queue */}
      <Section title={`Up next · ${queue.length}`}>
        <div className="max-h-[240px] overflow-y-auto">
          {queue.length === 0 ? (
            <div className="px-2 py-1.5 text-[10.5px] text-[var(--color-text-dim)]">
              Empty. Play a track and anything after the current will land here.
            </div>
          ) : (
            queue.map((q, i) => (
              <div
                key={q.id}
                className="group flex items-center gap-2 border-b border-[var(--color-border)]/40 px-2 py-1 text-[11px] hover:bg-[var(--color-surface-3)]"
              >
                <span className="w-4 text-right text-[10px] tabular-nums text-[var(--color-text-dim)]">
                  {i + 1}
                </span>
                {q.thumbnail_url ? (
                  <img
                    src={q.thumbnail_url}
                    alt=""
                    className="h-6 w-6 border border-[var(--color-border)] object-cover"
                  />
                ) : (
                  <div className="grid h-6 w-6 place-items-center border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <Music size={10} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate">{q.title}</div>
                  <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                    {q.artist ?? q.service}
                  </div>
                </div>
                <button
                  onClick={() => void useConvoy.getState().removeFromQueue(q.id)}
                  title="Remove"
                  className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                >
                  <X size={10} />
                </button>
              </div>
            ))
          )}
        </div>
      </Section>
    </aside>
  )
}

function PanelHead({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border-strong)] bg-[var(--grad-header)] px-2 text-[11px]">
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
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </div>
      {children}
    </div>
  )
}
