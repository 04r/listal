// Chat-message attachment format.
//
// We piggyback on the plain-text `body` column of room_messages and
// direct-message rows so no schema changes are needed. An attachment is
// serialised as `[[LISTAL_ATTACH]]<json>` and detected on render. Plain-text
// messages are stored as-is.

const MARKER = '[[LISTAL_ATTACH]]'

export interface SharedSong {
  service: string
  sourceUrl: string
  title: string
  artist: string | null
  thumbnail: string | null
  durationSec: number | null
}

export interface SharedPlaylistTrack {
  title: string
  artist: string | null
  sourceUrl: string
  service: string
  thumbnail: string | null
  durationSec: number | null
}

export interface SharedPlaylist {
  name: string
  trackCount: number
  covers: string[] // up to 4 thumbnails for the mosaic
  tracks: SharedPlaylistTrack[] // first ~3 for the preview list
}

export type Attachment =
  | { kind: 'song'; song: SharedSong }
  | { kind: 'playlist'; playlist: SharedPlaylist }

export function encodeAttachment(a: Attachment): string {
  return MARKER + JSON.stringify(a)
}

export function decodeAttachment(body: string): Attachment | null {
  if (!body.startsWith(MARKER)) return null
  try {
    const parsed = JSON.parse(body.slice(MARKER.length)) as Attachment
    if (parsed.kind === 'song' && parsed.song?.sourceUrl) return parsed
    if (parsed.kind === 'playlist' && parsed.playlist?.name) return parsed
    return null
  } catch {
    return null
  }
}
