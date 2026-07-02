import { useState } from 'react'
import {
  Loader2,
  UserPlus,
  Check,
  X as XIcon,
  MessageSquare,
  Radio,
  Music,
  RotateCw,
  Users
} from 'lucide-react'
import { useAuth } from '../stores/auth'
import { useFriends } from '../stores/friends'
import type { Profile } from '../lib/supabase'
import { useSocial } from '../stores/social'
import { useListenAlong } from '../stores/listenAlong'
import { useChat } from '../stores/chat'
import { PanelShell } from './PanelShell'
import { AvatarRing, type PresenceStatus } from './AvatarRing'

interface Props {
  onClose: () => void
}

export function FriendsPanel({ onClose }: Props): React.JSX.Element {
  const me = useAuth((s) => s.profile)
  const entries = useFriends((s) => s.entries)
  const loading = useFriends((s) => s.loading)
  const error = useFriends((s) => s.error)
  const sendRequest = useFriends((s) => s.sendRequest)
  const decide = useFriends((s) => s.decide)
  const unfriend = useFriends((s) => s.unfriend)
  const [addQuery, setAddQuery] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const friendStates = useSocial((s) => s.friendStates)
  const followingId = useListenAlong((s) => s.hostId)
  const openChatWith = useChat((s) => s.openWith)

  async function onAdd(): Promise<void> {
    if (!addQuery.trim()) return
    setAddBusy(true)
    setLocalError(null)
    const res = await sendRequest(addQuery)
    setAddBusy(false)
    if (!res.ok) setLocalError(res.error)
    else setAddQuery('')
  }

  async function onUnfriend(other: Profile): Promise<void> {
    if (!confirm(`Remove @${other.username}?`)) return
    await unfriend(other)
  }

  const accepted = entries.filter((e) => e.status === 'accepted')
  const pendingIn = entries.filter((e) => e.status === 'pending_in')
  const pendingOut = entries.filter((e) => e.status === 'pending_out')
  const shownError = localError ?? error

  return (
    <PanelShell
      panelKey="friends"
      onClose={onClose}
      icon={<Users size={11} />}
      label="Friends"
      meta={me && <span className="text-[var(--color-text-dim)]">@{me.username}</span>}
      floatDefault={{ x: 80, y: 100, w: 320, h: 520 }}
    >
      {!me ? (
        <div className="px-3 py-3 text-[11px] text-[var(--color-text-muted)]">
          Sign in to use friends.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
            <UserPlus size={11} className="text-[var(--color-text-muted)]" />
            <input
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onAdd()
              }}
              placeholder="add by @username"
              className="h-5 flex-1 border border-[var(--color-border-strong)] bg-[var(--color-input)] px-1.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              onClick={() => void onAdd()}
              disabled={addBusy || !addQuery.trim()}
              className="grid h-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 text-[11px] hover:bg-[var(--grad-btn-hover)] disabled:opacity-50"
            >
              {addBusy ? <Loader2 size={10} className="animate-spin" /> : 'Add'}
            </button>
          </div>

          {shownError && (
            <div className="border-b border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
              {shownError}
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
              <Loader2 size={11} className="animate-spin" />
              Loading…
            </div>
          )}

          {!loading && pendingIn.length > 0 && (
            <Section title={`Requests · ${pendingIn.length}`}>
              {pendingIn.map((e) => (
                <Row key={e.profile.id} profile={e.profile}>
                  <button
                    onClick={() => void decide(e.profile, true)}
                    title="Accept"
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
                  >
                    <Check size={10} />
                  </button>
                  <button
                    onClick={() => void decide(e.profile, false)}
                    title="Decline"
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
                  >
                    <XIcon size={10} />
                  </button>
                </Row>
              ))}
            </Section>
          )}

          {!loading && pendingOut.length > 0 && (
            <Section title={`Sent · ${pendingOut.length}`}>
              {pendingOut.map((e) => (
                <Row key={e.profile.id} profile={e.profile}>
                  <span className="text-[10.5px] text-[var(--color-text-dim)]">pending</span>
                  <button
                    onClick={() => void onUnfriend(e.profile)}
                    title="Cancel"
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
                  >
                    <XIcon size={10} />
                  </button>
                </Row>
              ))}
            </Section>
          )}

          {!loading && (
            <Section title={`Friends · ${accepted.length}`}>
              {accepted.length === 0 ? (
                <div className="px-3 py-2 text-[10.5px] text-[var(--color-text-dim)]">
                  No friends yet. Add someone by @username above.
                </div>
              ) : (
                accepted.map((e) => {
                  const fs = friendStates[e.profile.id]
                  const playing = fs?.state?.track
                  const following = followingId === e.profile.id
                  const status = presenceFromState(!!fs?.online, fs?.state?.presenceMode)
                  return (
                    <FriendRow
                      key={e.profile.id}
                      profile={e.profile}
                      status={status}
                      nowPlayingTitle={playing?.title ?? null}
                      nowPlayingArtist={playing?.artist ?? null}
                      isPlaying={!!fs?.state?.isPlaying}
                      following={following}
                      onChat={() => openChatWith(e.profile)}
                      onListen={() => {
                        if (following) useListenAlong.getState().stop()
                        else useListenAlong.getState().follow(e.profile.id)
                      }}
                      onResync={() => useListenAlong.getState().resync()}
                      onRemove={() => void onUnfriend(e.profile)}
                    />
                  )
                })
              )}
            </Section>
          )}
        </div>
      )}
    </PanelShell>
  )
}

function presenceFromState(
  online: boolean,
  mode: 'online' | 'idle' | 'busy' | 'invisible' | undefined
): PresenceStatus {
  if (!online) return 'offline'
  if (mode === 'idle' || mode === 'busy' || mode === 'invisible') return mode
  return 'online'
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

function Row({
  profile,
  children
}: {
  profile: Profile
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)]/40 px-2 hover:bg-[var(--color-surface-3)]">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--color-text)]">
          {profile.display_name ?? profile.username}
        </div>
        <div className="truncate text-[10px] text-[var(--color-text-dim)]">@{profile.username}</div>
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

function FriendRow({
  profile,
  status,
  nowPlayingTitle,
  nowPlayingArtist,
  isPlaying,
  following,
  onChat,
  onListen,
  onResync,
  onRemove
}: {
  profile: Profile
  status: PresenceStatus
  nowPlayingTitle: string | null
  nowPlayingArtist: string | null
  isPlaying: boolean
  following: boolean
  onChat: () => void
  onListen: () => void
  onResync: () => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col border-b border-[var(--color-border)]/40 px-2 py-1 hover:bg-[var(--color-surface-3)]">
      <div className="flex items-center gap-2">
        <AvatarRing
          src={profile.avatar_url}
          size={18}
          status={status}
          fallbackChar={profile.username}
          title={status}
        />
        <span className="truncate text-[12px] font-medium text-[var(--color-text)]">
          {profile.display_name ?? profile.username}
        </span>
        <span className="truncate text-[10px] text-[var(--color-text-dim)]">
          @{profile.username}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onChat}
            title="Message"
            className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
          >
            <MessageSquare size={10} />
          </button>
          <button
            onClick={onListen}
            disabled={!nowPlayingTitle}
            title={
              !nowPlayingTitle
                ? 'Nothing playing'
                : following
                  ? 'Stop listening along'
                  : 'Listen along'
            }
            className={`grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] ${
              following
                ? 'bg-[var(--color-row-current)] text-white'
                : 'bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]'
            } disabled:opacity-40`}
          >
            <Radio size={10} />
          </button>
          {following && (
            <button
              onClick={onResync}
              title="Resync to host"
              className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)]"
            >
              <RotateCw size={10} />
            </button>
          )}
          <button
            onClick={onRemove}
            title="Remove"
            className="text-[10.5px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          >
            ×
          </button>
        </div>
      </div>
      {nowPlayingTitle && (
        <div className="flex items-center gap-1 pl-4 text-[10.5px] text-[var(--color-text-muted)]">
          <Music size={9} className={isPlaying ? 'text-[var(--color-link)]' : ''} />
          <span className="truncate">
            {nowPlayingTitle}
            {nowPlayingArtist ? ` — ${nowPlayingArtist}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
