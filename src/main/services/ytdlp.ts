import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { getDb } from '../db'

// yt-dlp lives in resources/bin/. In dev it's read from the repo, in a packaged
// build electron-builder's `asarUnpack: resources/**` unpacks it next to the
// asar so it can actually be spawned.
function ytdlpPath(): string {
  const relative = join('resources', 'bin', 'yt-dlp.exe')
  if (is.dev) {
    return join(app.getAppPath(), relative)
  }
  return join(process.resourcesPath, 'app.asar.unpacked', relative)
}

export interface ResolvedStream {
  streamUrl: string
  title: string
  uploader: string | null
  durationSec: number | null
  thumbnail: string | null
}

class YtdlpError extends Error {
  constructor(
    message: string,
    public readonly stderr: string
  ) {
    super(message)
    this.name = 'YtdlpError'
  }
}

const TIMEOUT_MS = 30_000
const CACHE_SAFETY_MS = 60_000 // expire entries a minute before the URL itself expires
const FALLBACK_TTL_MS = 30 * 60 * 1000

// Two-layer cache:
//   pending: in-flight resolves so duplicate concurrent calls share one
//            yt-dlp subprocess (cheap dedupe for prefetch + click races).
//   ready  : completed resolves keyed by source URL with an expiry derived
//            from the streamUrl's `expire=` query param.
const pending = new Map<string, Promise<ResolvedStream>>()
const ready = new Map<string, { result: ResolvedStream; expiresAt: number }>()

// Concurrency gate for the yt-dlp subprocess. Each Python spawn eats
// ~80-150 MB of memory and a burst of CPU; running 5 in parallel spikes the
// machine. The renderer prefetches aggressively so we throttle at the wire.
// Priority resolves (the track the user is about to hear) jump the queue;
// prefetches wait.
const MAX_CONCURRENT_YTDLP = 2
let inFlight = 0
type Waiter = { run: () => void; priority: boolean }
const waiters: Waiter[] = []

function acquireSlot(priority: boolean): Promise<void> {
  return new Promise((resolveP) => {
    const run = (): void => {
      inFlight++
      resolveP()
    }
    if (inFlight < MAX_CONCURRENT_YTDLP) {
      run()
      return
    }
    if (priority) waiters.unshift({ run, priority })
    else waiters.push({ run, priority })
  })
}

function releaseSlot(): void {
  inFlight--
  const next = waiters.shift()
  if (next) next.run()
}

function expiryFromStreamUrl(streamUrl: string): number {
  try {
    const exp = new URL(streamUrl).searchParams.get('expire')
    if (exp) {
      const epoch = Number(exp)
      // googlevideo uses epoch seconds; sanity-check
      if (epoch > 1_000_000_000) return epoch * 1000 - CACHE_SAFETY_MS
    }
  } catch {
    /* fall through */
  }
  return Date.now() + FALLBACK_TTL_MS
}

// Restore anything from the on-disk cache into the in-memory map on first
// call. Cheap enough to do lazily instead of at app boot.
let diskCacheLoaded = false
function loadDiskCache(): void {
  if (diskCacheLoaded) return
  diskCacheLoaded = true
  try {
    const rows = getDb()
      .prepare(
        'SELECT source_url, stream_url, title, uploader, duration_sec, thumbnail, expires_at FROM stream_cache WHERE expires_at > ?'
      )
      .all(Date.now()) as Array<{
      source_url: string
      stream_url: string
      title: string
      uploader: string | null
      duration_sec: number | null
      thumbnail: string | null
      expires_at: number
    }>
    for (const r of rows) {
      ready.set(r.source_url, {
        result: {
          streamUrl: r.stream_url,
          title: r.title,
          uploader: r.uploader,
          durationSec: r.duration_sec,
          thumbnail: r.thumbnail
        },
        expiresAt: r.expires_at
      })
    }
    // Housekeeping: drop rows that already expired.
    getDb().prepare('DELETE FROM stream_cache WHERE expires_at <= ?').run(Date.now())
    console.log(`[ytdlp] warmed ${rows.length} cached stream URLs from disk`)
  } catch (e) {
    console.warn('[ytdlp] disk cache load failed', e)
  }
}

function persistToDisk(url: string, result: ResolvedStream, expiresAt: number): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO stream_cache (source_url, stream_url, title, uploader, duration_sec, thumbnail, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_url) DO UPDATE SET
           stream_url = excluded.stream_url,
           title = excluded.title,
           uploader = excluded.uploader,
           duration_sec = excluded.duration_sec,
           thumbnail = excluded.thumbnail,
           expires_at = excluded.expires_at`
      )
      .run(
        url,
        result.streamUrl,
        result.title,
        result.uploader,
        result.durationSec,
        result.thumbnail,
        expiresAt
      )
  } catch (e) {
    console.warn('[ytdlp] persist to disk failed', e)
  }
}

// Runs yt-dlp and prints exactly five lines: url, title, uploader, duration,
// thumbnail. Using `--print` instead of `-j` is critical — `-j` ignores the
// format selector and dumps the full info-dict (hundreds of KB for YouTube),
// which can deadlock the stdout pipe.
export function resolveStream(url: string, priority = false): Promise<ResolvedStream> {
  loadDiskCache()
  const cached = ready.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.result)
  }
  const inflight = pending.get(url)
  if (inflight) return inflight

  const p = (async (): Promise<ResolvedStream> => {
    await acquireSlot(priority)
    try {
      return await doResolve(url)
    } finally {
      releaseSlot()
    }
  })().finally(() => pending.delete(url))
  pending.set(url, p)
  return p
}

function doResolve(url: string): Promise<ResolvedStream> {
  const bin = ytdlpPath()
  console.log(`[ytdlp] resolve ${url}`)
  if (!existsSync(bin)) {
    return Promise.reject(
      new YtdlpError(
        `yt-dlp binary not found at ${bin}. Run \`npm run fetch-ytdlp\`.`,
        ''
      )
    )
  }

  return new Promise((resolveP, rejectP) => {
    const args = [
      // Selector tiers, most preferred first:
      //   1. Non-DRM progressive audio (best for Howler / plain <audio>).
      //   2. Non-DRM HLS (most SoundCloud tracks — hls.js in the renderer).
      //   3. Non-DRM anything, even DASH — better than failing.
      //   4. Absolute last resort: bestaudio with no filter. yt-dlp sometimes
      //      mis-flags perfectly playable formats; this saves them.
      '-f',
      'bestaudio*[has_drm!=true][protocol!*=m3u8][protocol!*=dash]/bestaudio[has_drm!=true][protocol!*=dash]/bestaudio[has_drm!=true]/bestaudio',
      '-S',
      'proto:https,abr,asr,acodec:opus,ext:webm:m4a',
      '--no-warnings',
      '--no-playlist',
      '--no-check-formats',
      '--socket-timeout',
      '8',
      '--retries',
      '1',
      '--print',
      'url',
      '--print',
      'title',
      '--print',
      'uploader',
      '--print',
      'duration',
      '--print',
      'thumbnail',
      url
    ]
    const proc = spawn(bin, args, { windowsHide: true })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    const killTimer = setTimeout(() => {
      console.warn(`[ytdlp] timeout after ${TIMEOUT_MS}ms, killing`)
      proc.kill('SIGKILL')
    }, TIMEOUT_MS)

    proc.on('error', (err) => {
      clearTimeout(killTimer)
      rejectP(new YtdlpError(err.message, stderr))
    })

    proc.on('close', (code) => {
      clearTimeout(killTimer)
      if (code !== 0) {
        console.error(`[ytdlp] exit ${code} stderr=${stderr.slice(0, 500)}`)
        // Only flag as DRM when stderr actually names DRM/Widevine/encryption.
        // "Requested format is not available" alone means our selector was too
        // strict, not that the track is DRM-protected — the fallback tier
        // usually catches those, but if even it fails we should say so
        // clearly rather than blaming DRM.
        if (/widevine|has_drm=True|drm.protected|encrypted stream/i.test(stderr)) {
          rejectP(
            new YtdlpError(
              "This track is DRM-protected (SoundCloud Go+ / licensed release). yt-dlp can't decrypt those — try a different upload of the same song.",
              stderr
            )
          )
          return
        }
        if (/Requested format is not available/i.test(stderr)) {
          rejectP(
            new YtdlpError(
              'No playable audio format found. The source may have changed formats — try `yt-dlp -U` or paste a different upload.',
              stderr
            )
          )
          return
        }
        rejectP(new YtdlpError(`yt-dlp exited with code ${code}: ${stderr.slice(0, 300)}`, stderr))
        return
      }
      const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0)
      const [streamUrl, title, uploader, durationStr, thumbnail] = lines
      if (!streamUrl) {
        rejectP(new YtdlpError(`yt-dlp returned no stream URL. stdout=${stdout.slice(0, 200)}`, stderr))
        return
      }
      const durationSec = durationStr && durationStr !== 'NA' ? Number(durationStr) : null
      const result: ResolvedStream = {
        streamUrl,
        title: title ?? 'Unknown',
        uploader: uploader && uploader !== 'NA' ? uploader : null,
        durationSec: Number.isFinite(durationSec) ? durationSec : null,
        thumbnail: thumbnail && thumbnail !== 'NA' ? thumbnail : null
      }
      const expiresAt = expiryFromStreamUrl(streamUrl)
      ready.set(url, { result, expiresAt })
      persistToDisk(url, result, expiresAt)
      console.log(
        `[ytdlp] resolved "${title}" (${durationSec}s, cached until ${new Date(expiresAt).toLocaleTimeString()})`
      )
      resolveP(result)
    })
  })
}

export interface SearchResult {
  service: 'youtube' | 'soundcloud' | 'bandcamp'
  sourceUrl: string
  title: string
  uploader: string | null
  durationSec: number | null
  thumbnail: string | null
}

interface SearchEntry {
  webpage_url?: string
  title?: string
  uploader?: string
  duration?: number
  thumbnails?: Array<{ url: string; width?: number; height?: number }>
}

// Uses yt-dlp's built-in ytsearch:/scsearch: extractors plus Bandcamp's
// undocumented autocomplete API. Returns flat metadata only — no stream URLs
// (those are resolved later, on play).
import { searchBandcamp } from './bandcamp'
export function search(query: string, perService = 5): Promise<SearchResult[]> {
  const bin = ytdlpPath()
  if (!query.trim() || !existsSync(bin)) return Promise.resolve([])

  const ytPromise = runSearch(bin, `ytsearch${perService}:${query}`, 'youtube')
  const scPromise = runSearch(bin, `scsearch${perService}:${query}`, 'soundcloud')
  const bcPromise = searchBandcamp(query, perService)
  return Promise.all([ytPromise, scPromise, bcPromise]).then(([yt, sc, bc]) => [
    ...yt,
    ...sc,
    ...bc
  ])
}

function runSearch(
  bin: string,
  spec: string,
  service: 'youtube' | 'soundcloud'
): Promise<SearchResult[]> {
  return new Promise((resolveP) => {
    const proc = spawn(
      bin,
      [
        '--flat-playlist',
        '--no-warnings',
        '--print',
        '%(.{id,webpage_url,title,uploader,duration,thumbnails})j',
        spec
      ],
      { windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    proc.stderr.on('data', (c) => {
      stderr += c.toString()
    })
    const kill = setTimeout(() => proc.kill('SIGKILL'), TIMEOUT_MS)
    proc.on('error', () => {
      clearTimeout(kill)
      resolveP([])
    })
    proc.on('close', () => {
      clearTimeout(kill)
      if (stderr && !stdout) console.warn(`[ytdlp] ${spec} stderr=${stderr.slice(0, 200)}`)
      const results: SearchResult[] = []
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as SearchEntry
          if (!e.webpage_url) continue
          results.push({
            service,
            sourceUrl: e.webpage_url,
            title: e.title ?? 'Unknown',
            uploader: e.uploader ?? null,
            durationSec: typeof e.duration === 'number' ? e.duration : null,
            thumbnail: pickThumb(e.thumbnails)
          })
        } catch {
          /* skip malformed line */
        }
      }
      resolveP(results)
    })
  })
}

// ---------------------------------------------------------------------------
// Playlist / album URL import
// ---------------------------------------------------------------------------

// Walks a playlist URL and returns flat metadata for each item — no stream
// URLs are resolved yet. Works for YouTube playlists, SoundCloud sets, and
// Bandcamp albums since yt-dlp exposes the same --flat-playlist interface for
// all three.
export interface PlaylistItem {
  service: string
  sourceUrl: string
  title: string
  uploader: string | null
  durationSec: number | null
  thumbnail: string | null
}

export function resolvePlaylistUrl(url: string): Promise<PlaylistItem[]> {
  const bin = ytdlpPath()
  if (!existsSync(bin) || !/^https?:\/\//.test(url)) return Promise.resolve([])
  return new Promise((resolveP) => {
    const proc = spawn(
      bin,
      [
        '--flat-playlist',
        '--no-warnings',
        '--print',
        '%(.{id,webpage_url,url,title,uploader,duration,thumbnails,extractor_key,ie_key})j',
        url
      ],
      { windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c) => (stdout += c.toString()))
    proc.stderr.on('data', (c) => (stderr += c.toString()))
    const kill = setTimeout(() => proc.kill('SIGKILL'), 60_000)
    proc.on('error', () => {
      clearTimeout(kill)
      resolveP([])
    })
    proc.on('close', () => {
      clearTimeout(kill)
      if (stderr && !stdout) console.warn(`[ytdlp playlist] stderr=${stderr.slice(0, 300)}`)
      const items: PlaylistItem[] = []
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as SearchEntry & {
            url?: string
            extractor_key?: string
            ie_key?: string
          }
          const source =
            e.webpage_url ??
            (e.url && /^https?:\/\//.test(e.url) ? e.url : null)
          if (!source) continue
          items.push({
            service: mapExtractorToService(
              e.extractor_key ?? e.ie_key ?? '',
              source
            ),
            sourceUrl: source,
            title: e.title ?? 'Unknown',
            uploader: e.uploader ?? null,
            durationSec: typeof e.duration === 'number' ? e.duration : null,
            thumbnail: pickThumb(e.thumbnails)
          })
        } catch {
          /* skip malformed line */
        }
      }
      resolveP(items)
    })
  })
}

function mapExtractorToService(ie: string, url: string): string {
  const s = (ie || '').toLowerCase()
  if (s.includes('youtube')) return 'youtube'
  if (s.includes('soundcloud')) return 'soundcloud'
  if (s.includes('bandcamp')) return 'bandcamp'
  // Fallback from the URL host.
  try {
    const h = new URL(url).hostname
    if (h.includes('youtube') || h.includes('youtu.be')) return 'youtube'
    if (h.includes('soundcloud')) return 'soundcloud'
    if (h.includes('bandcamp')) return 'bandcamp'
  } catch {
    /* ignore */
  }
  return 'youtube'
}

// ---------------------------------------------------------------------------
// Artist discography (via YouTube "<Artist> - Topic" channel)
// ---------------------------------------------------------------------------

export type ArtistTrackKind = 'song' | 'album' | 'unofficial'

export interface ArtistTrack {
  sourceUrl: string
  title: string
  durationSec: number | null
  thumbnail: string | null
  kind: ArtistTrackKind
}

export interface ArtistDiscography {
  name: string
  channelUrl: string | null
  source: 'topic' | 'search' | 'none'
  tracks: ArtistTrack[]
}

interface ChannelEntry {
  webpage_url?: string
  url?: string
  title?: string
  duration?: number
  thumbnails?: Array<{ url: string; width?: number; height?: number }>
  channel_url?: string
  uploader_url?: string
  channel?: string
  uploader?: string
}

const CHANNEL_TIMEOUT_MS = 45_000

const ALBUM_PHRASE_RE =
  /\b(full\s+(album|ep|lp)|discography|compilation|mixtape|side\s+[ab]|complete\s+works|all\s+songs|live\s+(set|concert|show)|greatest\s+hits|the\s+\w+\s+years)\b/i
const UNOFFICIAL_RE =
  /\b(cover(?:ed)?|remix(?:ed)?|sped[\s-]?up|slowed(?:\s*\+\s*reverb)?|reverb|nightcore|8d(?:\s+audio)?|karaoke|instrumental|fan\s+edit|fan\s+made|mashup|ai\s+(cover|version)|reaction|tutorial|loop|extended\s+(version|mix)|1\s*h(ou)?r|10\s+hours|tiktok\s+version|\bedit\b|guitar\s+(cover|tab)|piano\s+(cover|tutorial)|type\s+beat|tribute|bootleg|unofficial|leaked?|leak|hardstyle|phonk|bass\s+boosted|chipmunk|drum\s+kit|sample\s+pack|stems?\s+only|acapella|midi|backing\s+track)\b/i
const ALBUM_DURATION_SEC = 12 * 60

function classifyArtistTrack(
  title: string,
  durationSec: number | null
): ArtistTrackKind {
  if (ALBUM_PHRASE_RE.test(title)) return 'album'
  if (durationSec != null && durationSec >= ALBUM_DURATION_SEC) return 'album'
  if (UNOFFICIAL_RE.test(title)) return 'unofficial'
  return 'song'
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a stable dedup key from a track title by stripping the "<artist> -"
// prefix, parenthetical noise, and common video annotations. Different YouTube
// uploads of the same song collapse to the same key.
function dedupKey(title: string, artist: string): string {
  let s = title.replace(new RegExp(`^\\s*${escapeRegex(artist)}\\s*[-–—]\\s*`, 'i'), '')
  s = s
    .toLowerCase()
    .replace(/[\(\[].*?[\)\]]/g, ' ')
    .replace(
      /\b(official|audio|video|music|lyric[s]?|hd|4k|remaster(?:ed)?|original|hq|mv|explicit|free\s+download|new)\b/gi,
      ' '
    )
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

// Find the artist's "- Topic" YouTube channel. Topic channels are auto-generated
// by YouTube Music from official label uploads and are the closest thing to a
// clean "official discography" without an API key.
function findTopicChannel(artistName: string): Promise<string | null> {
  const bin = ytdlpPath()
  if (!existsSync(bin)) return Promise.resolve(null)
  return new Promise((resolveP) => {
    const proc = spawn(
      bin,
      [
        '--flat-playlist',
        '--no-warnings',
        '--print',
        '%(.{channel,channel_url,uploader,uploader_url,title})j',
        `ytsearch5:${artistName} - Topic`
      ],
      { windowsHide: true }
    )
    let stdout = ''
    proc.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    const kill = setTimeout(() => proc.kill('SIGKILL'), TIMEOUT_MS)
    proc.on('error', () => {
      clearTimeout(kill)
      resolveP(null)
    })
    proc.on('close', () => {
      clearTimeout(kill)
      const wanted = artistName.toLowerCase().trim()
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as ChannelEntry
          const ch = (e.channel ?? e.uploader ?? '').toLowerCase()
          const chUrl = e.channel_url ?? e.uploader_url
          if (!chUrl) continue
          // Only accept genuine "<artist> - Topic" channels. Without this guard
          // a search for an artist that has no Topic channel happily returns
          // the first random hit's channel, which is wildly wrong.
          if (ch.includes(wanted) && ch.includes('topic')) {
            resolveP(chUrl)
            return
          }
        } catch {
          /* skip */
        }
      }
      resolveP(null)
    })
  })
}

function listChannelTracks(channelUrl: string, limit = 80): Promise<ArtistTrack[]> {
  const bin = ytdlpPath()
  if (!existsSync(bin)) return Promise.resolve([])
  const url = channelUrl.replace(/\/+$/, '') + '/videos'
  return new Promise((resolveP) => {
    const proc = spawn(
      bin,
      [
        '--flat-playlist',
        '--no-warnings',
        '--playlist-end',
        String(limit),
        '--print',
        '%(.{id,url,webpage_url,title,duration,thumbnails})j',
        url
      ],
      { windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    proc.stderr.on('data', (c) => {
      stderr += c.toString()
    })
    const kill = setTimeout(() => proc.kill('SIGKILL'), CHANNEL_TIMEOUT_MS)
    proc.on('error', () => {
      clearTimeout(kill)
      resolveP([])
    })
    proc.on('close', () => {
      clearTimeout(kill)
      if (stderr && !stdout) {
        console.warn(`[ytdlp] channel ${url} stderr=${stderr.slice(0, 200)}`)
      }
      const out: ArtistTrack[] = []
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as ChannelEntry
          const src = e.webpage_url ?? e.url
          if (!src) continue
          const dur = typeof e.duration === 'number' ? e.duration : null
          const title = e.title ?? 'Unknown'
          out.push({
            sourceUrl: src.startsWith('http') ? src : `https://www.youtube.com/watch?v=${src}`,
            title,
            durationSec: dur,
            thumbnail: pickThumb(e.thumbnails),
            kind: classifyArtistTrack(title, dur)
          })
        } catch {
          /* skip */
        }
      }
      resolveP(out)
    })
  })
}

// Fallback for indie/underground artists with no Topic channel: just search
// YouTube for "<artist>" and treat the top videos as the artist's "tracks".
// Less curated than a Topic channel, but better than showing nothing.
function searchAsArtist(artistName: string, limit = 30): Promise<ArtistTrack[]> {
  const bin = ytdlpPath()
  if (!existsSync(bin)) return Promise.resolve([])
  return new Promise((resolveP) => {
    const proc = spawn(
      bin,
      [
        '--flat-playlist',
        '--no-warnings',
        '--print',
        '%(.{id,webpage_url,title,duration,thumbnails,channel,uploader})j',
        `ytsearch${limit}:${artistName}`
      ],
      { windowsHide: true }
    )
    let stdout = ''
    proc.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    const kill = setTimeout(() => proc.kill('SIGKILL'), CHANNEL_TIMEOUT_MS)
    proc.on('error', () => {
      clearTimeout(kill)
      resolveP([])
    })
    proc.on('close', () => {
      clearTimeout(kill)
      const wanted = artistName.toLowerCase().trim()
      const out: ArtistTrack[] = []
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as ChannelEntry & { id?: string }
          const src = e.webpage_url
          if (!src) continue
          // Keep results whose channel or title mentions the artist — drops
          // the worst false-positives without being so strict it returns nothing.
          const hay = `${e.channel ?? ''} ${e.uploader ?? ''} ${e.title ?? ''}`.toLowerCase()
          if (!hay.includes(wanted)) continue
          const dur = typeof e.duration === 'number' ? e.duration : null
          const title = e.title ?? 'Unknown'
          out.push({
            sourceUrl: src,
            title,
            durationSec: dur,
            thumbnail: pickThumb(e.thumbnails),
            kind: classifyArtistTrack(title, dur)
          })
        } catch {
          /* skip */
        }
      }
      resolveP(out)
    })
  })
}

// Within a single kind, collapse multiple uploads of the same song to one row.
// Keep the first occurrence — YouTube/search returns these in popularity order
// so the most-played version wins. Albums and unofficial entries dedupe within
// their own buckets, so a song and its slowed cover both survive.
function dedupeWithinKinds(tracks: ArtistTrack[], artist: string): ArtistTrack[] {
  const seen: Record<ArtistTrackKind, Set<string>> = {
    song: new Set(),
    album: new Set(),
    unofficial: new Set()
  }
  const out: ArtistTrack[] = []
  for (const t of tracks) {
    const key = dedupKey(t.title, artist)
    if (!key) {
      out.push(t)
      continue
    }
    const bucket = seen[t.kind]
    if (bucket.has(key)) continue
    bucket.add(key)
    out.push(t)
  }
  return out
}

// Resolves a YouTube uploader handle (e.g. "jommeez") into its channel and
// returns the channel's recent videos. Unlike getArtistDiscography this skips
// the Topic-channel filter — we want THIS uploader's uploads, even if they're
// a fan channel or single-track aggregator.
export async function getUploaderUploads(name: string): Promise<{
  uploaderName: string
  channelUrl: string | null
  tracks: ArtistTrack[]
}> {
  const channelUrl = await firstResultChannelUrl(name)
  if (!channelUrl) return { uploaderName: name, channelUrl: null, tracks: [] }
  const tracks = await listChannelTracks(channelUrl, 100)
  return { uploaderName: name, channelUrl, tracks }
}

function firstResultChannelUrl(uploaderName: string): Promise<string | null> {
  const bin = ytdlpPath()
  if (!existsSync(bin)) return Promise.resolve(null)
  return new Promise((resolveP) => {
    const proc = spawn(
      bin,
      [
        '--flat-playlist',
        '--no-warnings',
        '--print',
        '%(.{channel_url,uploader_url,channel,uploader})j',
        `ytsearch3:${uploaderName}`
      ],
      { windowsHide: true }
    )
    let stdout = ''
    proc.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    const kill = setTimeout(() => proc.kill('SIGKILL'), TIMEOUT_MS)
    proc.on('error', () => {
      clearTimeout(kill)
      resolveP(null)
    })
    proc.on('close', () => {
      clearTimeout(kill)
      const wanted = uploaderName.toLowerCase().trim()
      // Prefer a result whose channel name actually matches the uploader; fall
      // back to the first result that has any channel URL.
      let fallback: string | null = null
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as ChannelEntry
          const url = e.channel_url ?? e.uploader_url
          if (!url) continue
          if (!fallback) fallback = url
          const ch = (e.channel ?? e.uploader ?? '').toLowerCase()
          if (ch.includes(wanted) || wanted.includes(ch)) {
            resolveP(url)
            return
          }
        } catch {
          /* skip */
        }
      }
      resolveP(fallback)
    })
  })
}

export async function getArtistDiscography(name: string): Promise<ArtistDiscography> {
  const channelUrl = await findTopicChannel(name)
  if (channelUrl) {
    const raw = await listChannelTracks(channelUrl)
    const tracks = dedupeWithinKinds(raw, name)
    if (tracks.length > 0) {
      return { name, channelUrl, source: 'topic', tracks }
    }
  }
  // No Topic channel — try a search fallback so the page isn't empty for
  // smaller/independent artists who don't have a label-managed channel.
  const raw = await searchAsArtist(name)
  const tracks = dedupeWithinKinds(raw, name)
  return {
    name,
    channelUrl: null,
    source: tracks.length > 0 ? 'search' : 'none',
    tracks
  }
}

// ---------------------------------------------------------------------------
// Song Radio (YouTube "Mix" playlists)
// ---------------------------------------------------------------------------

// YouTube auto-generates a "Mix" playlist for every video at
// ?v=<id>&list=RD<id>. It's the same recommendation feed you see in YouTube
// Music's "Start radio". We resolve that playlist with --flat-playlist so we
// don't need to hit the video pages, then hand back plain SearchResults —
// the player resolves stream URLs lazily as usual.

const YT_ID_RE = /(?:v=|youtu\.be\/|music\.youtube\.com\/watch\?v=|shorts\/)([a-zA-Z0-9_-]{11})/

function extractYoutubeId(url: string): string | null {
  const m = url.match(YT_ID_RE)
  return m ? m[1] : null
}

export function songRadio(sourceUrl: string, limit = 25): Promise<SearchResult[]> {
  const id = extractYoutubeId(sourceUrl)
  if (!id) return Promise.resolve([])
  const bin = ytdlpPath()
  if (!existsSync(bin)) return Promise.resolve([])
  const mixUrl = `https://www.youtube.com/watch?v=${id}&list=RD${id}`
  return new Promise((resolveP) => {
    const proc = spawn(
      bin,
      [
        '--flat-playlist',
        '--no-warnings',
        '--playlist-end',
        String(limit),
        '--print',
        '%(.{id,webpage_url,title,uploader,duration,thumbnails})j',
        mixUrl
      ],
      { windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    proc.stderr.on('data', (c) => {
      stderr += c.toString()
    })
    const kill = setTimeout(() => proc.kill('SIGKILL'), TIMEOUT_MS)
    proc.on('error', () => {
      clearTimeout(kill)
      resolveP([])
    })
    proc.on('close', () => {
      clearTimeout(kill)
      if (stderr && !stdout) {
        console.warn(`[ytdlp] radio ${id} stderr=${stderr.slice(0, 200)}`)
      }
      const out: SearchResult[] = []
      const seen = new Set<string>([id])
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as SearchEntry & { id?: string }
          const src = e.webpage_url
          if (!src) continue
          const entryId = e.id ?? extractYoutubeId(src)
          if (entryId) {
            if (seen.has(entryId)) continue
            seen.add(entryId)
          }
          out.push({
            service: 'youtube',
            sourceUrl: src,
            title: e.title ?? 'Unknown',
            uploader: e.uploader ?? null,
            durationSec: typeof e.duration === 'number' ? e.duration : null,
            thumbnail: pickThumb(e.thumbnails)
          })
        } catch {
          /* skip */
        }
      }
      resolveP(out)
    })
  })
}

function pickThumb(arr: SearchEntry['thumbnails']): string | null {
  if (!arr || arr.length === 0) return null
  // Smallest of the "decent quality" thumbnails — search rows only need 40px,
  // and the giant 1280x720 ones flood the network in long result lists.
  const sized = arr.filter((t) => typeof t.width === 'number')
  const target = sized.find((t) => (t.width ?? 0) >= 200) ?? sized[sized.length - 1] ?? arr[0]
  return target?.url ?? null
}
