// MusicBrainz integration — canonical catalog for "what songs does this artist
// actually have." No API key, no auth, but a polite User-Agent is required and
// the public service rate-limits to ~1 req/sec.
//
// We deliberately treat MB as a metadata source only: titles, lengths, MBIDs,
// ISRCs. Playable stream URLs come from yt-dlp via a separate resolve step.

const USER_AGENT = 'Listal/1.0 ( kojiaudi@gmail.com )'
const BASE = 'https://musicbrainz.org/ws/2'

export interface MbArtist {
  mbid: string
  name: string
  type: string | null
  country: string | null
  score: number
}

export interface MbRecording {
  mbid: string
  title: string
  durationSec: number | null
  isrc: string | null
  firstReleaseDate: string | null
  // Canonical album the song first appeared on. Songs that never landed on a
  // proper album/EP (B-sides, singles-only, soundtrack appearances) get null.
  albumMbid: string | null
}

export interface MbAlbum {
  mbid: string // release-group MBID
  title: string
  type: string | null // Album | EP | Single | Compilation | …
  year: string | null
  trackMbids: string[]
}

export interface MbCatalog {
  artistName: string
  mbid: string | null
  albums: MbAlbum[]
  tracks: MbRecording[]
}

interface MbArtistResp {
  artists?: Array<{
    id: string
    name: string
    type?: string
    country?: string
    score?: number
  }>
}

interface MbRecordingResp {
  recordings?: Array<{
    id: string
    title: string
    length?: number | null
    isrcs?: string[]
    video?: boolean
    'first-release-date'?: string
    releases?: Array<{
      id: string
      title: string
      date?: string
      'release-group'?: {
        id: string
        title: string
        'primary-type'?: string
        'secondary-types'?: string[]
      }
    }>
  }>
  count?: number
}

async function mbFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json'
    }
  })
  if (!res.ok) {
    throw new Error(`MusicBrainz ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

async function searchArtist(name: string): Promise<MbArtist | null> {
  const j = await mbFetch<MbArtistResp>('/artist', {
    query: name,
    fmt: 'json',
    limit: '5'
  })
  const items = j.artists ?? []
  if (items.length === 0) return null
  // Prefer exact name match (case-insensitive). MB's `score` heavily favors
  // popular artists, so a query for a smaller act can be drowned by namesakes.
  const lowered = name.toLowerCase()
  const exact = items.find((a) => a.name.toLowerCase() === lowered)
  const pick = exact ?? items[0]
  return {
    mbid: pick.id,
    name: pick.name,
    type: pick.type ?? null,
    country: pick.country ?? null,
    score: pick.score ?? 0
  }
}

// Album-type priority used when picking the "canonical" release-group for a
// recording. Lower = more canonical. We want the original album over a single,
// a single over a compilation, etc.
const TYPE_PRIORITY: Record<string, number> = {
  Album: 0,
  EP: 1,
  Single: 2,
  Broadcast: 3,
  Other: 4,
  Compilation: 5
}

function pickCanonicalRelease(
  releases: NonNullable<NonNullable<MbRecordingResp['recordings']>[number]['releases']>
): { rgMbid: string; rgTitle: string; type: string | null; date: string | null } | null {
  // Filter out anything whose release-group is missing (rare but defensive).
  const candidates = releases
    .map((r) => {
      const rg = r['release-group']
      if (!rg) return null
      const primary = rg['primary-type'] ?? 'Other'
      const secondary = rg['secondary-types'] ?? []
      // Drop comps/live/soundtracks — original album/EP/single only.
      if (secondary.includes('Compilation') || secondary.includes('Live')) return null
      return {
        rgMbid: rg.id,
        rgTitle: rg.title,
        type: primary,
        date: r.date ?? null
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const tp = (TYPE_PRIORITY[a.type ?? 'Other'] ?? 9) - (TYPE_PRIORITY[b.type ?? 'Other'] ?? 9)
    if (tp !== 0) return tp
    return (a.date ?? '9999').localeCompare(b.date ?? '9999')
  })
  return candidates[0]
}

type RgMeta = {
  rgMbid: string
  rgTitle: string
  type: string | null
  date: string | null
}

async function listRecordings(
  mbid: string,
  limit = 100
): Promise<{ recs: MbRecording[]; rgByRec: Map<string, RgMeta> }> {
  const j = await mbFetch<MbRecordingResp>('/recording', {
    artist: mbid,
    fmt: 'json',
    limit: String(limit),
    inc: 'releases'
  })
  const recs = j.recordings ?? []
  const rgByRec = new Map<string, RgMeta>()
  const out: MbRecording[] = []
  for (const r of recs) {
    if (r.video) continue
    const canon = pickCanonicalRelease(r.releases ?? [])
    if (canon) rgByRec.set(r.id, canon)
    out.push({
      mbid: r.id,
      title: r.title,
      durationSec: r.length != null ? Math.round(r.length / 1000) : null,
      isrc: r.isrcs && r.isrcs.length > 0 ? r.isrcs[0] : null,
      firstReleaseDate: r['first-release-date'] ?? null,
      albumMbid: canon?.rgMbid ?? null
    })
  }
  return { recs: out, rgByRec }
}

// Builds the album sections shown in the UI. We use the same release-group
// metadata captured during recording lookup so this is just a regroup pass.
function buildAlbums(recs: MbRecording[], rawById: Map<string, RgMeta>): MbAlbum[] {
  const byRg = new Map<string, MbAlbum>()
  for (const r of recs) {
    if (!r.albumMbid) continue
    const meta = rawById.get(r.mbid)
    if (!meta) continue
    let album = byRg.get(meta.rgMbid)
    if (!album) {
      album = {
        mbid: meta.rgMbid,
        title: meta.rgTitle,
        type: meta.type,
        year: meta.date ? meta.date.slice(0, 4) : null,
        trackMbids: []
      }
      byRg.set(meta.rgMbid, album)
    }
    album.trackMbids.push(r.mbid)
  }
  const out = Array.from(byRg.values())
  out.sort((a, b) => {
    // Albums first, then EPs, then singles. Within a type bucket, earliest first.
    const tp = (TYPE_PRIORITY[a.type ?? 'Other'] ?? 9) - (TYPE_PRIORITY[b.type ?? 'Other'] ?? 9)
    if (tp !== 0) return tp
    return (a.year ?? '9999').localeCompare(b.year ?? '9999')
  })
  return out
}

// Each "song" in MB can have many recordings — original, live, remastered,
// edit, etc. Collapse to one canonical entry per song.
function dedupeRecordings(recs: MbRecording[]): MbRecording[] {
  const groups = new Map<string, MbRecording[]>()
  for (const r of recs) {
    const key = normalizeTitle(r.title)
    if (!key) continue
    const arr = groups.get(key)
    if (arr) arr.push(r)
    else groups.set(key, [r])
  }
  const out: MbRecording[] = []
  for (const group of groups.values()) {
    // Prefer entries with an ISRC (label-released), then the earliest release,
    // then the one with a known length.
    group.sort((a, b) => {
      const aHas = a.isrc ? 0 : 1
      const bHas = b.isrc ? 0 : 1
      if (aHas !== bHas) return aHas - bHas
      const aDate = a.firstReleaseDate ?? '9999'
      const bDate = b.firstReleaseDate ?? '9999'
      if (aDate !== bDate) return aDate < bDate ? -1 : 1
      if (!!a.durationSec === !!b.durationSec) return 0
      return a.durationSec ? -1 : 1
    })
    out.push(group[0])
  }
  // Earliest-first ordering at the top level → discography-by-time.
  out.sort((a, b) => (a.firstReleaseDate ?? '9999').localeCompare(b.firstReleaseDate ?? '9999'))
  return out
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\(\[].*?[\)\]]/g, ' ')
    .replace(
      /\b(remaster(?:ed)?|live|edit|version|mix|mono|stereo|radio|single|demo|reprise|instrumental|acoustic)\b/g,
      ' '
    )
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function getArtistCatalog(name: string): Promise<MbCatalog> {
  const artist = await searchArtist(name)
  if (!artist) return { artistName: name, mbid: null, albums: [], tracks: [] }
  const { recs, rgByRec } = await listRecordings(artist.mbid)
  const tracks = dedupeRecordings(recs)
  // Dedup pass drops some recordings; rebuild a per-track rg map keyed by the
  // surviving recording IDs so buildAlbums only sees the canonical tracklist.
  const survivingRg = new Map<string, RgMeta>()
  for (const t of tracks) {
    const meta = rgByRec.get(t.mbid)
    if (meta) survivingRg.set(t.mbid, meta)
  }
  const albums = buildAlbums(tracks, survivingRg)
  return {
    artistName: artist.name,
    mbid: artist.mbid,
    albums,
    tracks
  }
}
