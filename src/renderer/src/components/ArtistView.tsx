import { useEffect, useMemo, useState } from 'react'
import { Play, Pause, Loader2, ExternalLink } from 'lucide-react'
import type {
  ArtistDiscography,
  ArtistTrack,
  MbCatalog,
  SpotifyArtistResult,
  Track
} from '../../../preload'
import { usePlayer } from '../stores/player'
import { useLibrary } from '../stores/library'
import { ContentSurface } from './LibraryView'

interface Props {
  name: string
}

export function ArtistView({ name }: Props): React.JSX.Element {
  const [data, setData] = useState<ArtistDiscography | null>(null)
  const [spotifyData, setSpotifyData] = useState<SpotifyArtistResult | null>(null)
  const [catalog, setCatalog] = useState<MbCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyUrl, setBusyUrl] = useState<string | null>(null)
  const [showAllSongs, setShowAllSongs] = useState(false)
  const [showUnofficial, setShowUnofficial] = useState(false)
  const playQueue = usePlayer((s) => s.playQueue)
  const toggle = usePlayer((s) => s.toggle)
  const playing = usePlayer((s) => s.playing)
  const currentUrl = usePlayer((s) => (s.index >= 0 ? s.queue[s.index]?.sourceUrl : null))
  const bump = useLibrary((s) => s.bump)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    setSpotifyData(null)
    setCatalog(null)
    setCatalogLoading(true)
    setShowAllSongs(false)
    setShowUnofficial(false)
    window.api
      .getArtistTracks(name)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    window.api
      .getArtistCatalog(name)
      .then((r) => {
        if (cancelled) return
        if (r.ok) setCatalog(r.data)
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    window.api.spotifyStatus().then((st) => {
      if (cancelled || !st.connected) return
      window.api.getArtistFromSpotify(name).then((r) => {
        if (cancelled) return
        if (r.ok && r.data.found) setSpotifyData(r.data)
      })
    })
    return () => {
      cancelled = true
    }
  }, [name])

  const songs = useMemo(() => data?.tracks.filter((t) => t.kind === 'song') ?? [], [data])
  const albums = useMemo(() => data?.tracks.filter((t) => t.kind === 'album') ?? [], [data])
  const unofficial = useMemo(
    () => data?.tracks.filter((t) => t.kind === 'unofficial') ?? [],
    [data]
  )

  async function playOne(sourceUrl: string): Promise<void> {
    setBusyUrl(sourceUrl)
    try {
      const res = await window.api.addTrackFromUrl(sourceUrl, null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      bump()
      await playQueue([res.track as Track], 0)
    } finally {
      setBusyUrl(null)
    }
  }

  async function playMbTrack(mb: MbCatalog['tracks'][number]): Promise<void> {
    setBusyUrl(`mb:${mb.mbid}`)
    setError(null)
    try {
      const query = `${name} ${mb.title}`
      const results = await window.api.search(query)
      const tol = 4
      const match =
        (mb.durationSec
          ? results
              .filter((r) => r.service === 'youtube' && r.durationSec != null)
              .find((r) => Math.abs((r.durationSec as number) - (mb.durationSec as number)) <= tol)
          : null) ?? results.find((r) => r.service === 'youtube')
      if (!match) {
        setError(`No YouTube match for "${mb.title}".`)
        return
      }
      const added = await window.api.addTrackFromUrl(match.sourceUrl, null)
      if (!added.ok) {
        setError(added.error)
        return
      }
      bump()
      await playQueue([added.track as Track], 0)
    } finally {
      setBusyUrl(null)
    }
  }

  async function playSpotifyTrack(sp: SpotifyArtistResult['tracks'][number]): Promise<void> {
    setBusyUrl(`spotify:${sp.spotifyId}`)
    setError(null)
    try {
      const query = `${sp.artists.join(' ')} ${sp.name}`
      const results = await window.api.search(query)
      const targetSec = sp.durationMs / 1000
      const match =
        results
          .filter((r) => r.service === 'youtube' && r.durationSec != null)
          .find((r) => Math.abs((r.durationSec as number) - targetSec) <= 3) ??
        results.find((r) => r.service === 'youtube')
      if (!match) {
        setError(`No YouTube match for "${sp.name}".`)
        return
      }
      const added = await window.api.addTrackFromUrl(match.sourceUrl, null)
      if (!added.ok) {
        setError(added.error)
        return
      }
      bump()
      await playQueue([added.track as Track], 0)
    } finally {
      setBusyUrl(null)
    }
  }

  async function playAll(): Promise<void> {
    if (!data || songs.length === 0) return
    const someoneCurrent = data.tracks.some((t) => t.sourceUrl === currentUrl)
    if (someoneCurrent) {
      toggle()
      return
    }
    setBusyUrl('all')
    setError(null)
    try {
      const head = songs.slice(0, 15)
      const results = await Promise.all(
        head.map((t) => window.api.addTrackFromUrl(t.sourceUrl, null))
      )
      const tracks = results
        .filter((r): r is { ok: true; track: Track } => r.ok)
        .map((r) => r.track as Track)
      bump()
      if (tracks.length > 0) await playQueue(tracks, 0)
    } finally {
      setBusyUrl(null)
    }
  }

  const someoneFromHerePlaying =
    playing && data?.tracks.some((t) => t.sourceUrl === currentUrl)

  return (
    <ContentSurface>
      {/* ---------------- Compact header ---------------- */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-2">
        <button
          onClick={() => void playAll()}
          disabled={!data || songs.length === 0 || busyUrl === 'all'}
          className="grid h-7 w-7 place-items-center rounded-sm bg-[var(--color-accent)] text-[var(--color-accent-fg)] disabled:opacity-30"
          title={someoneFromHerePlaying ? 'Pause' : 'Play artist'}
        >
          {busyUrl === 'all' ? (
            <Loader2 size={12} className="animate-spin" />
          ) : someoneFromHerePlaying ? (
            <Pause size={12} fill="currentColor" />
          ) : (
            <Play size={12} fill="currentColor" className="translate-x-[1px]" />
          )}
        </button>
        <div className="text-base font-semibold leading-tight">{name}</div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {catalog ? `${catalog.albums.length} releases · ${catalog.tracks.length} canonical` : ''}
          {data && data.tracks.length > 0
            ? `${catalog ? ' · ' : ''}${data.tracks.length} YouTube`
            : ''}
        </div>
        {data?.channelUrl && (
          <button
            onClick={() =>
              window.electron.ipcRenderer.send('open-external', data.channelUrl as string)
            }
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Open YouTube channel"
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {error && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-muted)]">
          <Loader2 size={12} className="animate-spin" />
          Loading YouTube…
        </div>
      )}

      {/* ---------------- Spotify (when connected) ---------------- */}
      {spotifyData && spotifyData.tracks.length > 0 && (
        <SectionHeader
          title="Popular via Spotify"
          extra={
            spotifyData.followers != null
              ? `${spotifyData.followers.toLocaleString()} followers`
              : null
          }
        />
      )}
      {spotifyData?.tracks.slice(0, 5).map((sp, i) => {
        const busyKey = `spotify:${sp.spotifyId}`
        return (
          <DenseRow
            key={sp.spotifyId}
            index={i + 1}
            title={sp.name}
            subtitle={sp.album}
            duration={Math.round(sp.durationMs / 1000)}
            badge={{ label: 'SP', tone: 'spotify' }}
            busy={busyUrl === busyKey}
            isCurrent={false}
            playing={false}
            onPlay={() => void playSpotifyTrack(sp)}
            onOpen={() => window.electron.ipcRenderer.send('open-external', sp.externalUrl)}
          />
        )
      })}

      {/* ---------------- MusicBrainz discography ---------------- */}
      {catalog && (catalog.albums.length > 0 || catalog.tracks.length > 0) && (
        <>
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                {showAllSongs ? 'All songs' : 'Discography'}
              </span>
              <span className="text-[10.5px] text-purple-300">MusicBrainz</span>
              <span className="text-[10.5px] text-[var(--color-text-dim)]">
                {showAllSongs
                  ? `${catalog.tracks.length} canonical tracks`
                  : `${catalog.albums.length} releases`}
              </span>
            </div>
            <button
              onClick={() => setShowAllSongs((v) => !v)}
              className="text-[10.5px] text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
            >
              {showAllSongs ? 'Group by album' : 'Show all songs from artist'}
            </button>
          </div>

          {showAllSongs ? (
            catalog.tracks.map((mb, i) => (
              <DenseRow
                key={mb.mbid}
                index={i + 1}
                title={mb.title}
                subtitle={mb.firstReleaseDate ?? null}
                duration={mb.durationSec}
                badge={{ label: mb.isrc ? 'ISRC' : 'MBID', tone: 'mb' }}
                busy={busyUrl === `mb:${mb.mbid}`}
                isCurrent={false}
                playing={false}
                onPlay={() => void playMbTrack(mb)}
                onOpen={() =>
                  window.electron.ipcRenderer.send(
                    'open-external',
                    `https://musicbrainz.org/recording/${mb.mbid}`
                  )
                }
              />
            ))
          ) : (
            <>
              {catalog.albums.map((album) => {
                const tracks = album.trackMbids
                  .map((id) => catalog.tracks.find((t) => t.mbid === id))
                  .filter((t): t is NonNullable<typeof t> => t != null)
                if (tracks.length === 0) return null
                return (
                  <div key={album.mbid}>
                    <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-1">
                      <img
                        src={`https://coverartarchive.org/release-group/${album.mbid}/front-250`}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-6 w-6 shrink-0 rounded-sm bg-[var(--color-surface-2)] object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = 'hidden'
                        }}
                      />
                      <button
                        onClick={() =>
                          window.electron.ipcRenderer.send(
                            'open-external',
                            `https://musicbrainz.org/release-group/${album.mbid}`
                          )
                        }
                        className="truncate text-xs font-semibold text-[var(--color-text)] hover:underline"
                        title={album.title}
                      >
                        {album.title}
                      </button>
                      <span className="text-[10.5px] text-[var(--color-text-muted)]">
                        {album.type ?? 'Release'}
                        {album.year ? ` · ${album.year}` : ''} · {tracks.length}{' '}
                        {tracks.length === 1 ? 'track' : 'tracks'}
                      </span>
                    </div>
                    {tracks.map((mb, i) => (
                      <DenseRow
                        key={mb.mbid}
                        index={i + 1}
                        title={mb.title}
                        subtitle={null}
                        duration={mb.durationSec}
                        badge={{ label: mb.isrc ? 'ISRC' : 'MBID', tone: 'mb' }}
                        busy={busyUrl === `mb:${mb.mbid}`}
                        isCurrent={false}
                        playing={false}
                        onPlay={() => void playMbTrack(mb)}
                        onOpen={() =>
                          window.electron.ipcRenderer.send(
                            'open-external',
                            `https://musicbrainz.org/recording/${mb.mbid}`
                          )
                        }
                      />
                    ))}
                  </div>
                )
              })}
              {(() => {
                const orphan = catalog.tracks.filter((t) => !t.albumMbid)
                if (orphan.length === 0) return null
                return (
                  <div>
                    <SectionHeader
                      title="Other recordings"
                      extra="not on a release in MusicBrainz"
                    />
                    {orphan.map((mb, i) => (
                      <DenseRow
                        key={mb.mbid}
                        index={i + 1}
                        title={mb.title}
                        subtitle={mb.firstReleaseDate ?? null}
                        duration={mb.durationSec}
                        badge={{ label: mb.isrc ? 'ISRC' : 'MBID', tone: 'mb' }}
                        busy={busyUrl === `mb:${mb.mbid}`}
                        isCurrent={false}
                        playing={false}
                        onPlay={() => void playMbTrack(mb)}
                        onOpen={() =>
                          window.electron.ipcRenderer.send(
                            'open-external',
                            `https://musicbrainz.org/recording/${mb.mbid}`
                          )
                        }
                      />
                    ))}
                  </div>
                )
              })()}
            </>
          )}
        </>
      )}

      {catalogLoading && !catalog && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-muted)]">
          <Loader2 size={12} className="animate-spin" />
          Loading MusicBrainz…
        </div>
      )}

      {/* ---------------- YouTube fallback (when MB has nothing) ------ */}
      {!loading && !catalog?.tracks.length && songs.length > 0 && (
        <>
          <SectionHeader title="YouTube" />
          {songs.map((t, i) => (
            <DenseRow
              key={t.sourceUrl}
              index={i + 1}
              title={cleanTitle(t.title)}
              subtitle={null}
              duration={t.durationSec}
              badge={{ label: 'YT', tone: 'yt' }}
              busy={busyUrl === t.sourceUrl}
              isCurrent={t.sourceUrl === currentUrl}
              playing={playing}
              onPlay={() => void playOne(t.sourceUrl)}
              onOpen={() => window.electron.ipcRenderer.send('open-external', t.sourceUrl)}
            />
          ))}
        </>
      )}

      {!loading && !catalog?.tracks.length && albums.length > 0 && (
        <>
          <SectionHeader title="Albums & EPs (YouTube)" />
          {albums.map((t, i) => (
            <DenseRow
              key={t.sourceUrl}
              index={i + 1}
              title={cleanTitle(t.title)}
              subtitle={null}
              duration={t.durationSec}
              badge={{ label: 'ALB', tone: 'yt' }}
              busy={busyUrl === t.sourceUrl}
              isCurrent={t.sourceUrl === currentUrl}
              playing={playing}
              onPlay={() => void playOne(t.sourceUrl)}
              onOpen={() => window.electron.ipcRenderer.send('open-external', t.sourceUrl)}
            />
          ))}
        </>
      )}

      {!loading && unofficial.length > 0 && (
        <>
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Unofficial &amp; fan content · {unofficial.length}
            </span>
            <button
              onClick={() => setShowUnofficial((v) => !v)}
              className="text-[10.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              {showUnofficial ? 'Hide' : 'Show'}
            </button>
          </div>
          {showUnofficial &&
            unofficial.map((t, i) => (
              <DenseRow
                key={t.sourceUrl}
                index={i + 1}
                title={cleanTitle(t.title)}
                subtitle={null}
                duration={t.durationSec}
                badge={{ label: 'FAN', tone: 'fan' }}
                busy={busyUrl === t.sourceUrl}
                isCurrent={t.sourceUrl === currentUrl}
                playing={playing}
                onPlay={() => void playOne(t.sourceUrl)}
                onOpen={() => window.electron.ipcRenderer.send('open-external', t.sourceUrl)}
              />
            ))}
        </>
      )}

      {!loading && data && data.tracks.length === 0 && !catalog?.tracks.length && (
        <div className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
          Nothing found for <span className="text-[var(--color-text)]">{name}</span>.
        </div>
      )}
    </ContentSurface>
  )
}

function SectionHeader({
  title,
  extra
}: {
  title: string
  extra?: string | null
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-shell)] px-3 py-1.5">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </span>
      {extra && (
        <span className="text-[10.5px] text-[var(--color-text-dim)]">{extra}</span>
      )}
    </div>
  )
}

const TONE: Record<string, string> = {
  yt: 'bg-red-500/15 text-red-300',
  fan: 'bg-amber-500/15 text-amber-300',
  spotify: 'bg-green-500/15 text-green-300',
  mb: 'bg-purple-500/15 text-purple-300'
}

function DenseRow({
  index,
  title,
  subtitle,
  duration,
  badge,
  busy,
  isCurrent,
  playing,
  onPlay,
  onOpen
}: {
  index: number
  title: string
  subtitle: string | null
  duration: number | null
  badge: { label: string; tone: keyof typeof TONE }
  busy: boolean
  isCurrent: boolean
  playing: boolean
  onPlay: () => void
  onOpen: () => void
}): React.JSX.Element {
  return (
    <div
      onDoubleClick={onPlay}
      className={`group grid h-6 grid-cols-[32px_1fr_44px_56px_24px] items-center gap-2 border-b border-[var(--color-border)]/40 px-3 text-[12px] ${
        isCurrent ? 'bg-[var(--color-row-current)]' : 'hover:bg-[var(--color-surface)]'
      }`}
    >
      <div className="grid place-items-center">
        {busy ? (
          <Loader2 size={10} className="animate-spin text-[var(--color-text-muted)]" />
        ) : (
          <>
            <span
              className={`tabular-nums group-hover:hidden ${
                isCurrent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
              }`}
            >
              {isCurrent && playing ? '▶' : index}
            </span>
            <button
              onClick={onPlay}
              className="hidden text-[var(--color-text)] group-hover:block"
              aria-label={`Play ${title}`}
            >
              <Play size={10} fill="currentColor" />
            </button>
          </>
        )}
      </div>
      <div className="min-w-0">
        <span className={`truncate ${isCurrent ? 'text-[var(--color-accent)]' : ''}`}>
          {title}
        </span>
        {subtitle && (
          <span className="ml-2 text-[var(--color-text-dim)]">· {subtitle}</span>
        )}
      </div>
      <span
        className={`shrink-0 rounded-sm px-1.5 py-px text-center text-[9px] font-bold tracking-wider ${TONE[badge.tone]}`}
      >
        {badge.label}
      </span>
      <div className="text-right tabular-nums text-[var(--color-text-muted)]">{fmt(duration)}</div>
      <div className="opacity-0 group-hover:opacity-100">
        <button
          onClick={onOpen}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Open source"
        >
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  )
}

function cleanTitle(t: string): string {
  return t
    .replace(/\s*[\(\[][^)\]]*official[^)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s*[\(\[][^)\]]*(visualiser|visualizer|lyric video|lyrics)[^)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fmt(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Keep imports happy in case other files reference the old shape.
export type _ArtistTrack = ArtistTrack
