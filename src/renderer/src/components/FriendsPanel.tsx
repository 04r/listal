import { useEffect, useState } from 'react'
import {
  X,
  Loader2,
  UserPlus,
  Check,
  X as XIcon,
  MessageSquare,
  Radio,
  Music
} from 'lucide-react'
import { useAuth } from '../stores/auth'
import { supabase, canonicalPair, type Profile, type FriendshipRow } from '../lib/supabase'
import { useSocial } from '../stores/social'
import { useListenAlong } from '../stores/listenAlong'
import { useChat } from '../stores/chat'

interface Props {
  onClose: () => void
}

interface FriendEntry {
  profile: Profile
  status: 'accepted' | 'pending_in' | 'pending_out'
}

export function FriendsPanel({ onClose }: Props): React.JSX.Element {
  const me = useAuth((s) => s.profile)
  const [entries, setEntries] = useState<FriendEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addQuery, setAddQuery] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const friendStates = useSocial((s) => s.friendStates)
  const followingId = useListenAlong((s) => s.hostId)
  const openChatWith = useChat((s) => s.openWith)

  async function refresh(): Promise<void> {
    if (!me) return
    setLoading(true)
    setError(null)
    const { data: rows, error: fErr } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_a.eq.${me.id},user_b.eq.${me.id}`)
    if (fErr) {
      setError(fErr.message)
      setLoading(false)
      return
    }
    const others = (rows ?? []).map((r: FriendshipRow) => {
      const otherId = r.user_a === me.id ? r.user_b : r.user_a
      let status: FriendEntry['status']
      if (r.status === 'accepted') status = 'accepted'
      else if (r.requested_by === me.id) status = 'pending_out'
      else status = 'pending_in'
      return { otherId, status, raw: r }
    })
    const otherIds = others.map((o) => o.otherId)
    if (otherIds.length === 0) {
      setEntries([])
      setLoading(false)
      useSocial.getState().setFriendIds([])
      return
    }
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .in('id', otherIds)
    if (pErr) {
      setError(pErr.message)
      setLoading(false)
      return
    }
    const byId = new Map<string, Profile>()
    for (const p of profiles ?? []) byId.set(p.id, p)
    const result = others
      .map((o) => {
        const p = byId.get(o.otherId)
        return p ? { profile: p, status: o.status } : null
      })
      .filter((x): x is FriendEntry => x != null)
    setEntries(result)
    setLoading(false)
    // Only subscribe to accepted friends' presence channels.
    useSocial
      .getState()
      .setFriendIds(result.filter((e) => e.status === 'accepted').map((e) => e.profile.id))
  }

  useEffect(() => {
    void refresh()
  }, [me?.id])

  async function sendRequest(): Promise<void> {
    if (!me) return
    const target = addQuery.trim().toLowerCase().replace(/^@/, '')
    if (!target) return
    setAddBusy(true)
    setError(null)
    try {
      const { data: profile, error: lookupErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', target)
        .maybeSingle()
      if (lookupErr) throw lookupErr
      if (!profile) {
        setError(`No user @${target} found.`)
        return
      }
      if (profile.id === me.id) {
        setError("You can't friend yourself.")
        return
      }
      const pair = canonicalPair(me.id, profile.id)
      const { error: insertErr } = await supabase.from('friendships').insert({
        ...pair,
        status: 'pending',
        requested_by: me.id
      })
      if (insertErr) {
        setError(insertErr.message)
        return
      }
      setAddQuery('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAddBusy(false)
    }
  }

  async function decide(other: Profile, accept: boolean): Promise<void> {
    if (!me) return
    const pair = canonicalPair(me.id, other.id)
    const { error: updErr } = await supabase
      .from('friendships')
      .update({
        status: accept ? 'accepted' : 'declined',
        decided_at: new Date().toISOString()
      })
      .eq('user_a', pair.user_a)
      .eq('user_b', pair.user_b)
    if (updErr) setError(updErr.message)
    await refresh()
  }

  async function unfriend(other: Profile): Promise<void> {
    if (!me) return
    if (!confirm(`Remove @${other.username}?`)) return
    const pair = canonicalPair(me.id, other.id)
    const { error: delErr } = await supabase
      .from('friendships')
      .delete()
      .eq('user_a', pair.user_a)
      .eq('user_b', pair.user_b)
    if (delErr) setError(delErr.message)
    await refresh()
  }

  const accepted = entries.filter((e) => e.status === 'accepted')
  const pendingIn = entries.filter((e) => e.status === 'pending_in')
  const pendingOut = entries.filter((e) => e.status === 'pending_out')

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-shell)]">
      <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[linear-gradient(#f0f0f0,#e6e6e6)] px-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Friends
        </span>
        {me && <span className="text-[var(--color-text-dim)]">@{me.username}</span>}
        <button
          onClick={onClose}
          className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X size={12} />
        </button>
      </div>

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
                if (e.key === 'Enter') void sendRequest()
              }}
              placeholder="add by @username"
              className="h-5 flex-1 border border-[var(--color-border-strong)] bg-white px-1.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              onClick={() => void sendRequest()}
              disabled={addBusy || !addQuery.trim()}
              className="grid h-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] px-2 text-[11px] hover:bg-[linear-gradient(#ffffff,#cccccc)] disabled:opacity-50"
            >
              {addBusy ? <Loader2 size={10} className="animate-spin" /> : 'Add'}
            </button>
          </div>

          {error && (
            <div className="border-b border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
              {error}
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
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] hover:bg-[linear-gradient(#ffffff,#cccccc)]"
                  >
                    <Check size={10} />
                  </button>
                  <button
                    onClick={() => void decide(e.profile, false)}
                    title="Decline"
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] hover:bg-[linear-gradient(#ffffff,#cccccc)]"
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
                    onClick={() => void unfriend(e.profile)}
                    title="Cancel"
                    className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] hover:bg-[linear-gradient(#ffffff,#cccccc)]"
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
                  return (
                    <FriendRow
                      key={e.profile.id}
                      profile={e.profile}
                      online={!!fs?.online}
                      nowPlayingTitle={playing?.title ?? null}
                      nowPlayingArtist={playing?.artist ?? null}
                      isPlaying={!!fs?.state?.isPlaying}
                      following={following}
                      onChat={() => openChatWith(e.profile)}
                      onListen={() => {
                        if (following) useListenAlong.getState().stop()
                        else useListenAlong.getState().follow(e.profile.id)
                      }}
                      onRemove={() => void unfriend(e.profile)}
                    />
                  )
                })
              )}
            </Section>
          )}
        </div>
      )}
    </aside>
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
      <div className="border-b border-[var(--color-border)] bg-[linear-gradient(#f0f0f0,#e6e6e6)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
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
  online,
  nowPlayingTitle,
  nowPlayingArtist,
  isPlaying,
  following,
  onChat,
  onListen,
  onRemove
}: {
  profile: Profile
  online: boolean
  nowPlayingTitle: string | null
  nowPlayingArtist: string | null
  isPlaying: boolean
  following: boolean
  onChat: () => void
  onListen: () => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col border-b border-[var(--color-border)]/40 px-2 py-1 hover:bg-[var(--color-surface-3)]">
      <div className="flex h-5 items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: online ? '#39b54a' : '#bdbdbd' }}
          title={online ? 'online' : 'offline'}
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
            className="grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[linear-gradient(#ffffff,#dcdcdc)] hover:bg-[linear-gradient(#ffffff,#cccccc)]"
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
                : 'bg-[linear-gradient(#ffffff,#dcdcdc)] hover:bg-[linear-gradient(#ffffff,#cccccc)]'
            } disabled:opacity-40`}
          >
            <Radio size={10} />
          </button>
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
