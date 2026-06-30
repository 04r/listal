// Lyrics cascade:
//   1. LRCLIB  — best free synced source, narrow indie coverage
//   2. NetEase — wide synced coverage for global pop incl. some indie/emo
//   3. Genius  — plain text only, but unmatched coverage for rare/indie songs
//
// All three are free and key-less.

const BASE = 'https://lrclib.net/api'
const USER_AGENT = 'Listal/1.0 ( https://github.com/anonymous; kojiaudi@gmail.com )'

export interface SyncedLine {
  tMs: number
  text: string
}

export type LyricsSource =
  | 'lrclib'
  | 'netease'
  | 'qq'
  | 'kugou'
  | 'genius'
  | 'lyrics.ovh'

export interface LyricsResult {
  found: boolean
  synced: SyncedLine[] | null
  plain: string | null
  source: LyricsSource | null
  trackName: string | null
  artistName: string | null
  durationSec: number | null
  // Whether the API explicitly flagged the recording as instrumental — used
  // to show "[Instrumental]" instead of "No lyrics found".
  instrumental: boolean
}

interface LrclibRecord {
  id?: number
  name?: string
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

function emptyResult(): LyricsResult {
  return {
    found: false,
    synced: null,
    plain: null,
    source: null,
    trackName: null,
    artistName: null,
    durationSec: null,
    instrumental: false
  }
}

async function lrclibFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

export async function fetchLyrics(
  artist: string,
  title: string,
  durationSec?: number | null
): Promise<LyricsResult> {
  const attempts = buildAttempts(artist, title)
  let bestPlain: LyricsResult | null = null

  // Phase A — fire every synced source for an attempt in parallel and resolve
  // the moment any source returns synced. Massive latency win because we used
  // to wait for LRCLIB get + LRCLIB search + NetEase + QQ + Kugou serially
  // (5-10s) before deciding nothing was synced.
  for (const att of attempts) {
    const r = await raceSynced(att.artist, att.title, durationSec ?? null)
    if (r?.synced) return r
    if (r && !bestPlain) bestPlain = r
  }

  // Phase B — plain-only sources, only if no synced anywhere. Also raced.
  for (const att of attempts) {
    const r = await raceAny(PLAIN_SOURCES.map((s) => () => s.fn(att.artist, att.title)))
    if (r && !bestPlain) bestPlain = r
    if (r) break
  }

  return bestPlain ?? emptyResult()
}

// Fires every synced source in parallel for one (artist, title) attempt and
// resolves as soon as ANY source returns synced lyrics. Falls back to the
// first plain result if no synced ones land before all sources finish.
function raceSynced(
  artist: string,
  title: string,
  durationSec: number | null
): Promise<LyricsResult | null> {
  return new Promise((resolve) => {
    let pending = SYNCED_SOURCES.length
    let bestPlain: LyricsResult | null = null
    let done = false
    const finish = (r: LyricsResult | null): void => {
      if (done) return
      done = true
      resolve(r)
    }
    for (const src of SYNCED_SOURCES) {
      Promise.resolve()
        .then(() => src.fn(artist, title, durationSec))
        .catch(() => null)
        .then((r) => {
          if (done) return
          if (r && r.found) {
            if (r.synced) {
              finish(r)
              return
            }
            if (!bestPlain) bestPlain = r
          }
          pending--
          if (pending === 0) finish(bestPlain)
        })
    }
  })
}

function raceAny(
  fetchers: Array<() => Promise<LyricsResult | null>>
): Promise<LyricsResult | null> {
  return new Promise((resolve) => {
    let pending = fetchers.length
    let done = false
    const finish = (r: LyricsResult | null): void => {
      if (done) return
      done = true
      resolve(r)
    }
    for (const fn of fetchers) {
      Promise.resolve()
        .then(fn)
        .catch(() => null)
        .then((r) => {
          if (done) return
          if (r && r.found) {
            finish(r)
            return
          }
          pending--
          if (pending === 0) finish(null)
        })
    }
  })
}

interface LyricsAttempt {
  artist: string
  title: string
}

function buildAttempts(rawArtist: string, rawTitle: string): LyricsAttempt[] {
  const cleanedTitle = stripNoise(rawTitle)
  const cleanedArtist = rawArtist.replace(/\s*[-–—]\s*topic\s*$/i, '').trim()

  const out: LyricsAttempt[] = []
  // Title-parsed split — strongest signal for YouTube-style "Artist - Title".
  const split = splitArtistTitle(cleanedTitle)
  if (split) out.push(split)
  // Uploader as artist + raw title — works for SoundCloud / Bandcamp where the
  // uploader actually IS the artist and the title is just the song name.
  out.push({ artist: cleanedArtist, title: cleanedTitle })

  const seen = new Set<string>()
  return out.filter((a) => {
    const key = `${a.artist.toLowerCase()}|${a.title.toLowerCase()}`
    if (!a.artist || !a.title || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stripNoise(title: string): string {
  return title
    .replace(/\s*[\(\[][^)\]]*(official|video|audio|lyric[s]?|visualiser|visualizer|hd|4k|remaster(?:ed)?|mv)[^)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitArtistTitle(title: string): LyricsAttempt | null {
  const m = title.match(/^([^-–—]+?)\s*[-–—]\s*(.+)$/)
  if (!m) return null
  const left = m[1].trim()
  const right = m[2].trim()
  if (left.length < 2 || right.length < 2) return null
  return { artist: left, title: right }
}

// Source priority: synced first. We retry all synced sources across every
// artist-attempt before giving up and trying plain-text sources. A synced
// match on a fuzzier attempt beats a plain match on the exact attempt because
// users overwhelmingly want the karaoke-style view.
type SyncedFetcher = (
  artist: string,
  title: string,
  durationSec: number | null
) => Promise<LyricsResult | null>
type PlainFetcher = (artist: string, title: string) => Promise<LyricsResult | null>

const SYNCED_SOURCES: Array<{ name: LyricsSource; fn: SyncedFetcher }> = [
  { name: 'lrclib', fn: (a, t, d) => lrclibExact(a, t, d) },
  { name: 'lrclib', fn: (a, t) => lrclibSearch(a, t) },
  { name: 'netease', fn: (a, t, d) => fetchFromNetEase(a, t, d) },
  { name: 'qq', fn: (a, t) => fetchFromQQ(a, t) },
  { name: 'kugou', fn: (a, t, d) => fetchFromKugou(a, t, d) }
]

const PLAIN_SOURCES: Array<{ name: LyricsSource; fn: PlainFetcher }> = [
  { name: 'genius', fn: fetchFromGenius },
  { name: 'lyrics.ovh', fn: fetchFromLyricsOvh }
]

async function lrclibExact(
  artist: string,
  title: string,
  durationSec: number | null
): Promise<LyricsResult | null> {
  const params: Record<string, string> = { artist_name: artist, track_name: title }
  if (durationSec != null) params.duration = String(Math.round(durationSec))
  const r = await lrclibFetch<LrclibRecord>('/get', params)
  return r ? mapRecord(r) : null
}

async function lrclibSearch(artist: string, title: string): Promise<LyricsResult | null> {
  const arr = await lrclibFetch<LrclibRecord[]>('/search', {
    artist_name: artist,
    track_name: title
  })
  if (!arr || arr.length === 0) return null
  return mapRecord(arr[0])
}

function mapRecord(r: LrclibRecord): LyricsResult {
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null
  return {
    found: !!(synced && synced.length) || !!r.plainLyrics || !!r.instrumental,
    synced: synced && synced.length > 0 ? synced : null,
    plain: r.plainLyrics ?? null,
    source: 'lrclib',
    trackName: r.trackName ?? r.name ?? null,
    artistName: r.artistName ?? null,
    durationSec: r.duration ?? null,
    instrumental: !!r.instrumental
  }
}

// ---------------------------------------------------------------------------
// NetEase Cloud Music (free, no auth, wide global catalogue)
// ---------------------------------------------------------------------------

const NETEASE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36',
  Referer: 'https://music.163.com',
  Cookie: 'appver=2.0.2'
}

interface NeSearchResp {
  result?: {
    songs?: Array<{
      id: number
      name: string
      artists?: Array<{ name: string }>
      duration?: number
    }>
  }
}

interface NeLyricResp {
  lrc?: { lyric?: string }
  // tlyric = translation; we only use lrc to preserve original timing.
}

async function fetchFromNetEase(
  artist: string,
  title: string,
  durationSec: number | null
): Promise<LyricsResult | null> {
  const q = `${artist} ${title}`.trim()
  if (!q) return null
  const searchUrl = new URL('https://music.163.com/api/search/get/web')
  searchUrl.searchParams.set('s', q)
  searchUrl.searchParams.set('type', '1')
  searchUrl.searchParams.set('limit', '5')
  const searchRes = await fetch(searchUrl, { headers: NETEASE_HEADERS })
  if (!searchRes.ok) return null
  const j = (await searchRes.json()) as NeSearchResp
  const songs = j.result?.songs ?? []
  if (songs.length === 0) return null

  // Prefer a duration match (±4s) if we have one; else top hit.
  const want = durationSec != null ? durationSec : null
  const pick =
    (want != null
      ? songs.find(
          (s) =>
            s.duration != null && Math.abs(Math.round(s.duration / 1000) - want) <= 4
        )
      : null) ?? songs[0]

  const lyricUrl = new URL('https://music.163.com/api/song/lyric')
  lyricUrl.searchParams.set('id', String(pick.id))
  lyricUrl.searchParams.set('lv', '1')
  lyricUrl.searchParams.set('tv', '-1')
  lyricUrl.searchParams.set('kv', '-1')
  const lyricRes = await fetch(lyricUrl, { headers: NETEASE_HEADERS })
  if (!lyricRes.ok) return null
  const lr = (await lyricRes.json()) as NeLyricResp
  const raw = lr.lrc?.lyric ?? ''
  if (!raw.trim()) return null
  const synced = parseLrc(raw)
  // Some NetEase entries only have a single "[00:00.000] song info" header
  // with no real timed lines — treat that as no lyrics.
  const realSynced = synced.length > 1 ? synced : null
  const plain = !realSynced ? raw.replace(/^\[\d+:\d+(?:[.:]\d+)?\]\s*/gm, '').trim() : null
  return {
    found: !!(realSynced || plain),
    synced: realSynced,
    plain,
    source: 'netease',
    trackName: pick.name ?? null,
    artistName: pick.artists?.[0]?.name ?? null,
    durationSec: pick.duration != null ? Math.round(pick.duration / 1000) : null,
    instrumental: false
  }
}

// ---------------------------------------------------------------------------
// QQ Music (Tencent) — synced for a lot of global pop including some indie
// ---------------------------------------------------------------------------

const QQ_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://y.qq.com/'
}

interface QqSearchResp {
  data?: {
    song?: {
      list?: Array<{ songmid?: string; songname?: string; singer?: Array<{ name?: string }> }>
    }
  }
}

interface QqLyricResp {
  lyric?: string
  trans?: string
}

async function fetchFromQQ(artist: string, title: string): Promise<LyricsResult | null> {
  const q = `${artist} ${title}`.trim()
  if (!q) return null
  const searchUrl = new URL('https://c.y.qq.com/soso/fcgi-bin/client_search_cp')
  searchUrl.searchParams.set('w', q)
  searchUrl.searchParams.set('format', 'json')
  searchUrl.searchParams.set('n', '5')
  const sRes = await fetch(searchUrl, { headers: QQ_HEADERS })
  if (!sRes.ok) return null
  const sJson = (await sRes.json()) as QqSearchResp
  const pick = sJson.data?.song?.list?.[0]
  if (!pick?.songmid) return null

  const lyricUrl = new URL('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg')
  lyricUrl.searchParams.set('songmid', pick.songmid)
  lyricUrl.searchParams.set('format', 'json')
  lyricUrl.searchParams.set('nobase64', '1')
  const lRes = await fetch(lyricUrl, { headers: QQ_HEADERS })
  if (!lRes.ok) return null
  const lText = await lRes.text()
  // Tencent sometimes wraps responses in JSONP-ish trailer; extract { … }
  const jsonStart = lText.indexOf('{')
  const jsonEnd = lText.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) return null
  let lJson: QqLyricResp
  try {
    lJson = JSON.parse(lText.slice(jsonStart, jsonEnd + 1)) as QqLyricResp
  } catch {
    return null
  }
  const raw = lJson.lyric ?? ''
  if (!raw.trim()) return null
  const synced = parseLrc(raw)
  const real = synced.length > 1 ? synced : null
  const plain = !real ? raw.replace(/^\[\d+:\d+(?:[.:]\d+)?\]\s*/gm, '').trim() : null
  return {
    found: !!(real || plain),
    synced: real,
    plain,
    source: 'qq',
    trackName: pick.songname ?? null,
    artistName: pick.singer?.[0]?.name ?? null,
    durationSec: null,
    instrumental: false
  }
}

// ---------------------------------------------------------------------------
// Kugou — Chinese platform, deep synced catalogue for many global tracks
// ---------------------------------------------------------------------------

interface KugouSearchResp {
  candidates?: Array<{ id: string | number; accesskey: string }>
}
interface KugouDownloadResp {
  content?: string // base64-encoded LRC
}

async function fetchFromKugou(
  artist: string,
  title: string,
  durationSec: number | null
): Promise<LyricsResult | null> {
  const q = `${artist} ${title}`.trim()
  if (!q) return null
  const searchUrl = new URL('https://krcs.kugou.com/search')
  searchUrl.searchParams.set('ver', '1')
  searchUrl.searchParams.set('man', 'yes')
  searchUrl.searchParams.set('client', 'mobi')
  searchUrl.searchParams.set('keyword', q)
  if (durationSec != null) searchUrl.searchParams.set('duration', String(durationSec * 1000))
  searchUrl.searchParams.set('hash', '')
  const sRes = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } })
  if (!sRes.ok) return null
  const sJson = (await sRes.json()) as KugouSearchResp
  const pick = sJson.candidates?.[0]
  if (!pick) return null

  const dlUrl = new URL('https://lyrics.kugou.com/download')
  dlUrl.searchParams.set('ver', '1')
  dlUrl.searchParams.set('client', 'pc')
  dlUrl.searchParams.set('id', String(pick.id))
  dlUrl.searchParams.set('accesskey', pick.accesskey)
  dlUrl.searchParams.set('fmt', 'lrc')
  dlUrl.searchParams.set('charset', 'utf8')
  const dRes = await fetch(dlUrl, { headers: { 'User-Agent': USER_AGENT } })
  if (!dRes.ok) return null
  const dJson = (await dRes.json()) as KugouDownloadResp
  if (!dJson.content) return null
  // content is base64-encoded LRC text.
  const raw = Buffer.from(dJson.content, 'base64').toString('utf8')
  if (!raw.trim()) return null
  const synced = parseLrc(raw)
  const real = synced.length > 1 ? synced : null
  const plain = !real ? raw.replace(/^\[\d+:\d+(?:[.:]\d+)?\]\s*/gm, '').trim() : null
  return {
    found: !!(real || plain),
    synced: real,
    plain,
    source: 'kugou',
    trackName: null,
    artistName: null,
    durationSec: null,
    instrumental: false
  }
}

// ---------------------------------------------------------------------------
// Genius (plain-text fallback — best coverage for rare indie/midwest emo)
// ---------------------------------------------------------------------------

interface GeniusSearchHit {
  type: string
  result?: { url?: string; full_title?: string; primary_artist?: { name?: string } }
}

interface GeniusSearchResp {
  response?: {
    sections?: Array<{
      type: string
      hits?: GeniusSearchHit[]
    }>
  }
}

const GENIUS_HEADERS: Record<string, string> = {
  // Genius fronts everything with Cloudflare; the script-default UA gets a
  // 403 challenge. A normal-looking Chrome UA + Accept-Language works.
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity', // skip gzip — Electron's fetch doesn't auto-decode for us
  Referer: 'https://genius.com/'
}

async function fetchFromGenius(artist: string, title: string): Promise<LyricsResult | null> {
  const q = `${artist} ${title}`.trim()
  if (!q) return null
  const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`
  const sRes = await fetch(searchUrl, { headers: GENIUS_HEADERS })
  if (!sRes.ok) {
    console.warn(`[lyrics] genius search ${sRes.status} for ${q}`)
    return null
  }
  const sJson = (await sRes.json()) as GeniusSearchResp
  let pageUrl: string | null = null
  let resolvedTitle: string | null = null
  let resolvedArtist: string | null = null
  for (const section of sJson.response?.sections ?? []) {
    for (const hit of section.hits ?? []) {
      if (hit.type === 'song' && hit.result?.url) {
        pageUrl = hit.result.url
        resolvedTitle = hit.result.full_title ?? null
        resolvedArtist = hit.result.primary_artist?.name ?? null
        break
      }
    }
    if (pageUrl) break
  }
  if (!pageUrl) {
    console.warn(`[lyrics] genius: no song hit for ${q}`)
    return null
  }

  const pageRes = await fetch(pageUrl, { headers: GENIUS_HEADERS })
  if (!pageRes.ok) {
    console.warn(`[lyrics] genius page ${pageRes.status} for ${pageUrl}`)
    return null
  }
  const html = await pageRes.text()
  const plain = extractGeniusLyrics(html)
  if (!plain) {
    console.warn(`[lyrics] genius: HTML had no lyrics-container divs for ${pageUrl}`)
    return null
  }
  return {
    found: true,
    synced: null,
    plain,
    source: 'genius',
    trackName: resolvedTitle,
    artistName: resolvedArtist,
    durationSec: null,
    instrumental: false
  }
}

// ---------------------------------------------------------------------------
// lyrics.ovh — tiny free public API, plain text only, very permissive
// ---------------------------------------------------------------------------

interface LyricsOvhResp {
  lyrics?: string
  error?: string
}

async function fetchFromLyricsOvh(artist: string, title: string): Promise<LyricsResult | null> {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) return null
  const j = (await res.json()) as LyricsOvhResp
  const plain = (j.lyrics ?? '').trim()
  if (!plain) return null
  return {
    found: true,
    synced: null,
    plain,
    source: 'lyrics.ovh',
    trackName: title,
    artistName: artist,
    durationSec: null,
    instrumental: false
  }
}

// Genius wraps lyrics in `<div data-lyrics-container="true">…</div>`. Multiple
// containers per page (verses split across React components). Each contains
// `<br/>` line breaks and arbitrary inline annotation spans.
function extractGeniusLyrics(html: string): string | null {
  const re = /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g
  const parts: string[] = []
  for (const m of html.matchAll(re)) {
    const inner = m[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
    parts.push(inner)
  }
  if (parts.length === 0) return null
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() || null
}

// Parses LRC. Supports multiple stamps per line ("[00:10][00:20] chorus") and
// optional centisecond/millisecond precision. Drops pure metadata lines
// ([ar:Artist], [ti:Title], etc.) and instrumental-marker blank lines.
function parseLrc(text: string): SyncedLine[] {
  const out: SyncedLine[] = []
  const stampRe = /^\[(\d+):(\d+)(?:[.:](\d+))?\]/
  for (const raw of text.split(/\r?\n/)) {
    let rest = raw
    const stamps: number[] = []
    while (true) {
      const m = rest.match(stampRe)
      if (!m) break
      const min = Number(m[1])
      const sec = Number(m[2])
      // m[3] could be 2-digit centiseconds or 3-digit milliseconds. Pad to 3.
      const fracStr = m[3] ?? ''
      const ms = fracStr ? Number(fracStr.padEnd(3, '0').slice(0, 3)) : 0
      stamps.push(min * 60_000 + sec * 1000 + ms)
      rest = rest.slice(m[0].length)
    }
    const line = rest.trim()
    if (stamps.length === 0) continue
    // Skip pure metadata lines like "[ar:Coldplay]" — those don't match the
    // numeric stampRe above, so anything that reaches here is a real timed
    // line. Still drop entirely-empty lines so we don't litter the UI.
    if (!line) continue
    for (const t of stamps) out.push({ tMs: t, text: line })
  }
  out.sort((a, b) => a.tMs - b.tMs)
  return out
}
