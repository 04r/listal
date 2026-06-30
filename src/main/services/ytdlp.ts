import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

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

// Runs yt-dlp and prints exactly five lines: url, title, uploader, duration,
// thumbnail. Using `--print` instead of `-j` is critical — `-j` ignores the
// format selector and dumps the full info-dict (hundreds of KB for YouTube),
// which can deadlock the stdout pipe.
export function resolveStream(url: string): Promise<ResolvedStream> {
  const cached = ready.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.result)
  }
  const inflight = pending.get(url)
  if (inflight) return inflight

  const p = doResolve(url).finally(() => pending.delete(url))
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
      '-f',
      'bestaudio[protocol=http][has_drm!=true]/bestaudio[protocol=https][has_drm!=true]/bestaudio[protocol!*=m3u8][protocol!=dash][has_drm!=true]/bestaudio[has_drm!=true]',
      '--no-warnings',
      '--no-playlist',
      // Skip the HEAD probe yt-dlp normally does to verify each format URL —
      // saves ~300-700ms per resolve. Format selector still works.
      '--no-check-formats',
      // Fail fast on flaky network instead of waiting through 10 retries.
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
        // SoundCloud Go / paid uploads return DRM-only formats. Surface that
        // explicitly so the UI can show "this track is DRM-only" rather than
        // a raw yt-dlp stderr dump.
        if (/has_drm|DRM|Requested format is not available/i.test(stderr)) {
          rejectP(
            new YtdlpError(
              "This track only offers DRM-protected streams (SoundCloud Go / paid release). yt-dlp can't decrypt those — try a different upload of the same song.",
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

function pickThumb(arr: SearchEntry['thumbnails']): string | null {
  if (!arr || arr.length === 0) return null
  // Smallest of the "decent quality" thumbnails — search rows only need 40px,
  // and the giant 1280x720 ones flood the network in long result lists.
  const sized = arr.filter((t) => typeof t.width === 'number')
  const target = sized.find((t) => (t.width ?? 0) >= 200) ?? sized[sized.length - 1] ?? arr[0]
  return target?.url ?? null
}
