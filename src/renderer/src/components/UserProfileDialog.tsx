import { useEffect, useState } from 'react'
import { X, UserPlus, UserCheck, Music, Loader2 } from 'lucide-react'
import { supabase, type Profile } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { useFollow } from '../stores/follow'
import { useSocial } from '../stores/social'
import { AvatarRing, type PresenceStatus } from './AvatarRing'

interface Props {
  userId: string
  onClose: () => void
}

// Read-only view of another user: avatar, bio-ish header, now-playing, follow
// button, follower / following counts. Anything more (private playlists,
// listen history) needs schema work.
export function UserProfileDialog({ userId, onClose }: Props): React.JSX.Element {
  const me = useAuth((s) => s.profile)
  const following = useFollow((s) => s.followingIds.has(userId))
  const follow = useFollow((s) => s.follow)
  const unfollow = useFollow((s) => s.unfollow)
  const counts = useFollow((s) => s.counts[userId])
  const loadCounts = useFollow((s) => s.loadCounts)
  const friendStates = useSocial((s) => s.friendStates)
  const fs = friendStates[userId]
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled) return
      setProfile((data as Profile | null) ?? null)
      setLoading(false)
    })()
    void loadCounts(userId)
    return () => {
      cancelled = true
    }
  }, [userId, loadCounts])

  async function toggleFollow(): Promise<void> {
    setBusy(true)
    if (following) await unfollow(userId)
    else await follow(userId)
    setBusy(false)
  }

  const online = !!fs?.online
  const mode = fs?.state?.presenceMode
  const status: PresenceStatus = !online
    ? 'offline'
    : mode === 'idle' || mode === 'busy' || mode === 'invisible'
      ? mode
      : 'online'

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[380px] border border-[var(--color-border-strong)] bg-[var(--color-shell)] shadow-2xl"
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
        {loading && (
          <div className="flex items-center gap-2 p-4 text-[12px] text-[var(--color-text-muted)]">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        )}
        {!loading && !profile && (
          <div className="p-4 text-[12px] text-[var(--color-text-muted)]">
            No such user.
          </div>
        )}
        {!loading && profile && (
          <div className="p-3">
            <div className="flex items-start gap-3">
              <AvatarRing
                src={profile.avatar_url}
                size={56}
                status={status}
                fallbackChar={profile.username}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-[var(--color-text)]">
                  {profile.display_name ?? profile.username}
                </div>
                <div className="truncate text-[11.5px] text-[var(--color-text-muted)]">
                  @{profile.username}
                </div>
                <div className="mt-1 flex gap-3 text-[11px] text-[var(--color-text-muted)]">
                  <span>
                    <span className="font-semibold text-[var(--color-text)]">
                      {counts?.followers ?? '…'}
                    </span>{' '}
                    followers
                  </span>
                  <span>
                    <span className="font-semibold text-[var(--color-text)]">
                      {counts?.following ?? '…'}
                    </span>{' '}
                    following
                  </span>
                </div>
              </div>
            </div>
            {fs?.state?.track && (
              <div className="mt-3 flex items-center gap-2 border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11.5px]">
                {fs.state.track.thumbnailUrl ? (
                  <img
                    src={fs.state.track.thumbnailUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 border border-[var(--color-border)] object-cover"
                  />
                ) : (
                  <div className="grid h-9 w-9 place-items-center border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <Music size={13} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {fs.state.isPlaying ? '▶ ' : '⏸ '}
                    {fs.state.track.title}
                  </div>
                  <div className="truncate text-[10.5px] text-[var(--color-text-muted)]">
                    {fs.state.track.artist ?? fs.state.track.service}
                  </div>
                </div>
              </div>
            )}
            {me && me.id !== userId && (
              <button
                onClick={() => void toggleFollow()}
                disabled={busy}
                className={`mt-3 flex w-full items-center justify-center gap-2 border border-[var(--color-border-strong)] px-3 py-1.5 text-[12px] font-semibold ${
                  following
                    ? 'bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
                    : 'bg-[var(--grad-primary)] text-white hover:bg-[var(--grad-primary-hover)]'
                }`}
              >
                {busy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : following ? (
                  <UserCheck size={12} />
                ) : (
                  <UserPlus size={12} />
                )}
                {following ? 'Following' : 'Follow'}
              </button>
            )}
            <div className="mt-2 text-[10.5px] text-[var(--color-text-dim)]">
              Public profile. Playlists are stored locally on each user's
              device, so sharing them is opt-in via Share… menu on any
              playlist.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
