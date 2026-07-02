import { Play, Plus, Music, MoreHorizontal, Loader2, Radio } from 'lucide-react'
import { useState } from 'react'
import type { SharedSong, SharedPlaylist, ConvoyInvite } from '../lib/attachments'
import type { Track } from '../../../preload'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'
import { useConvoy } from '../stores/convoy'

// A shared song card. Cover + title + artist, Play and Add-to-library buttons.
// Sits inside a chat message bubble.
export function SharedSongCard({ song }: { song: SharedSong }): React.JSX.Element {
  const [busy, setBusy] = useState<'play' | 'add' | null>(null)
  const [added, setAdded] = useState(false)
  const playQueue = usePlayer((s) => s.playQueue)
  const bump = useLibrary((s) => s.bump)

  async function playIt(): Promise<void> {
    setBusy('play')
    try {
      const t: Track = songToTrack(song)
      await playQueue([t], 0)
    } finally {
      setBusy(null)
    }
  }

  async function addToLibrary(): Promise<void> {
    setBusy('add')
    try {
      const res = await window.api.addTrackFromUrl(song.sourceUrl, null)
      if (res.ok) {
        setAdded(true)
        bump()
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2 border border-[var(--color-border-strong)] bg-[var(--color-shell)] px-2 py-1.5">
      <Thumb src={song.thumbnail} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-[var(--color-text)]">
          {song.title}
        </div>
        <div className="truncate text-[10.5px] text-[var(--color-text-muted)]">
          {song.artist ?? song.service}
        </div>
        <span className="mt-0.5 inline-block border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
          Preview
        </span>
      </div>
      <button
        onClick={() => void addToLibrary()}
        disabled={busy === 'add' || added}
        title={added ? 'In library' : 'Add to library'}
        className="grid h-7 w-7 shrink-0 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] hover:bg-[var(--grad-btn-hover)] disabled:opacity-40"
      >
        {busy === 'add' ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Plus size={11} />
        )}
      </button>
      <button
        onClick={() => void playIt()}
        disabled={busy === 'play'}
        title="Play now"
        className="grid h-7 w-7 shrink-0 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-primary)] text-white hover:bg-[var(--grad-primary-hover)]"
      >
        {busy === 'play' ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Play size={11} fill="currentColor" />
        )}
      </button>
    </div>
  )
}

// A shared playlist card. 2x2 cover mosaic + name + track count. Small
// preview list of the first three tracks and a Play-all button. Clicking any
// preview track plays it.
export function SharedPlaylistCard({
  playlist
}: {
  playlist: SharedPlaylist
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const playQueue = usePlayer((s) => s.playQueue)
  const setView = useLibrary((s) => s.setView)

  async function playAll(): Promise<void> {
    setBusy(true)
    try {
      const tracks: Track[] = playlist.tracks.map(
        (t, i): Track => ({
          id: -1 - i,
          service: t.service,
          serviceId: t.sourceUrl,
          sourceUrl: t.sourceUrl,
          title: t.title,
          artist: t.artist,
          durationMs: t.durationSec ? Math.round(t.durationSec * 1000) : null,
          thumbnailUrl: t.thumbnail,
          addedAt: Date.now()
        })
      )
      if (tracks.length > 0) await playQueue(tracks, 0)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-[280px] border border-[var(--color-border-strong)] bg-[var(--color-shell)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-2">
        <Mosaic covers={playlist.covers} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-[var(--color-text)]">
            {playlist.name}
          </div>
          <div className="truncate text-[10.5px] text-[var(--color-text-muted)]">
            {playlist.trackCount} track{playlist.trackCount === 1 ? '' : 's'}
          </div>
          <span className="mt-0.5 inline-block border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-1 text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Preview
          </span>
        </div>
        <button
          onClick={() => void playAll()}
          disabled={busy || playlist.tracks.length === 0}
          title="Play all"
          className="grid h-7 w-7 shrink-0 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-primary)] text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Play size={11} fill="currentColor" />
          )}
        </button>
      </div>

      {/* Track preview list */}
      <div>
        {playlist.tracks.map((t, i) => (
          <button
            key={`${t.sourceUrl}-${i}`}
            onClick={() => void playSingle(t, playQueue)}
            className="group flex w-full items-center gap-2 border-b border-[var(--color-border)]/40 px-2 py-1 text-left text-[11.5px] hover:bg-[var(--color-surface-3)]"
          >
            <span className="w-4 text-right text-[10px] tabular-nums text-[var(--color-text-dim)]">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-[var(--color-text)]">{t.title}</div>
              <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                {t.artist ?? t.service}
              </div>
            </div>
            <span className="tabular-nums text-[10px] text-[var(--color-text-muted)]">
              {fmtDur(t.durationSec)}
            </span>
          </button>
        ))}
        {playlist.trackCount > playlist.tracks.length && (
          <button
            onClick={() =>
              setView({ kind: 'search' }) // no direct "view someone else's playlist" — nudge to Search for now
            }
            className="flex w-full items-center gap-1 px-2 py-1 text-[10.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <MoreHorizontal size={11} />
            and {playlist.trackCount - playlist.tracks.length} more
          </button>
        )}
      </div>
    </div>
  )
}

async function playSingle(
  t: SharedPlaylistCardTrack,
  playQueue: (tracks: Track[], startIndex?: number) => Promise<void>
): Promise<void> {
  const track: Track = {
    id: -1,
    service: t.service,
    serviceId: t.sourceUrl,
    sourceUrl: t.sourceUrl,
    title: t.title,
    artist: t.artist,
    durationMs: t.durationSec ? Math.round(t.durationSec * 1000) : null,
    thumbnailUrl: t.thumbnail,
    addedAt: Date.now()
  }
  await playQueue([track], 0)
}

type SharedPlaylistCardTrack = SharedPlaylist['tracks'][number]

function Thumb({
  src,
  size
}: {
  src: string | null
  size: number
}): React.JSX.Element {
  if (!src) {
    return (
      <div
        className="grid shrink-0 place-items-center border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
        style={{ width: size, height: size }}
      >
        <Music size={Math.floor(size / 2)} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className="shrink-0 border border-[var(--color-border)] object-cover"
      style={{ width: size, height: size }}
      onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
    />
  )
}

// 2x2 mosaic of up to four covers. Falls back to a single big cover, then
// to the Music placeholder.
function Mosaic({ covers }: { covers: string[] }): React.JSX.Element {
  const usable = covers.filter(Boolean).slice(0, 4)
  if (usable.length === 0) return <Thumb src={null} size={56} />
  if (usable.length === 1) return <Thumb src={usable[0]} size={56} />
  return (
    <div className="grid h-14 w-14 shrink-0 grid-cols-2 grid-rows-2 gap-[1px] border border-[var(--color-border)] bg-[var(--color-border)]">
      {usable.map((c, i) => (
        <img
          key={`${c}-${i}`}
          src={c}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
        />
      ))}
    </div>
  )
}

// Invite card for a Convoy. Shows the code, host, and a Join button
// bottom-right. Clicking Join runs the same joinByCode path as pasting.
export function SharedConvoyInviteCard({
  invite
}: {
  invite: ConvoyInvite
}): React.JSX.Element {
  const [joining, setJoining] = useState(false)
  const [status, setStatus] = useState<'idle' | 'joined' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)
  async function join(): Promise<void> {
    setJoining(true)
    setErr(null)
    const res = await useConvoy.getState().joinByCode(invite.code)
    setJoining(false)
    if (res.ok) setStatus('joined')
    else {
      setStatus('error')
      setErr(res.error)
    }
  }
  return (
    <div className="w-[260px] border border-[var(--color-border-strong)] bg-[var(--color-shell)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        <Radio size={11} />
        Convoy invite
      </div>
      <div className="p-2 text-[12px]">
        <div className="mb-1 truncate font-semibold text-[var(--color-text)]">
          {invite.name ?? `Convoy by @${invite.hostUsername}`}
        </div>
        <div className="text-[10.5px] text-[var(--color-text-muted)]">
          From @{invite.hostUsername}
        </div>
        <div className="mt-1 select-all border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1 text-center font-mono text-[12px] tracking-widest">
          {invite.code}
        </div>
        {err && (
          <div className="mt-1 text-[10.5px] text-[var(--color-danger)]">{err}</div>
        )}
      </div>
      <div className="flex justify-end border-t border-[var(--color-border)] px-2 py-1">
        <button
          onClick={() => void join()}
          disabled={joining || status === 'joined'}
          className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-3 py-0.5 text-[11.5px] font-semibold text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-60"
        >
          {joining ? (
            <Loader2 size={11} className="animate-spin" />
          ) : status === 'joined' ? (
            'Joined'
          ) : (
            'Join'
          )}
        </button>
      </div>
    </div>
  )
}

function songToTrack(s: SharedSong): Track {
  return {
    id: -1,
    service: s.service,
    serviceId: s.sourceUrl,
    sourceUrl: s.sourceUrl,
    title: s.title,
    artist: s.artist,
    durationMs: s.durationSec ? Math.round(s.durationSec * 1000) : null,
    thumbnailUrl: s.thumbnail,
    addedAt: Date.now()
  }
}

function fmtDur(sec: number | null): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
