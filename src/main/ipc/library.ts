import { ipcMain } from 'electron'
import { getDb, type TrackRow, type PlaylistRow } from '../db'
import {
  resolveStream,
  search,
  getArtistDiscography,
  getUploaderUploads,
  type SearchResult,
  type ArtistDiscography,
  type ArtistTrack,
  type ArtistTrackKind
} from '../services/ytdlp'

export interface UploaderUploads {
  uploaderName: string
  channelUrl: string | null
  tracks: ArtistTrack[]
}
import { classify } from '../services/source'
import { getArtistFromSpotify, type SpotifyArtistResult } from '../services/spotify'
import { getArtistCatalog, type MbCatalog } from '../services/musicbrainz'

export interface Track {
  id: number
  service: string
  serviceId: string
  sourceUrl: string
  title: string
  artist: string | null
  durationMs: number | null
  thumbnailUrl: string | null
  addedAt: number
}

export interface Playlist {
  id: number
  name: string
  createdAt: number
  trackCount?: number
}

function rowToTrack(r: TrackRow): Track {
  return {
    id: r.id,
    service: r.service,
    serviceId: r.service_id,
    sourceUrl: r.source_url,
    title: r.title,
    artist: r.artist,
    durationMs: r.duration_ms,
    thumbnailUrl: r.thumbnail_url,
    addedAt: r.added_at
  }
}

export function registerLibraryIpc(): void {
  // ---- playlists ----
  ipcMain.handle('library:listPlaylists', (): Playlist[] => {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
         FROM playlists p ORDER BY p.created_at DESC`
      )
      .all() as Array<PlaylistRow & { track_count: number }>
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      trackCount: r.track_count
    }))
  })

  ipcMain.handle('library:createPlaylist', (_e, name: string): Playlist => {
    const db = getDb()
    const now = Date.now()
    const info = db.prepare('INSERT INTO playlists (name, created_at) VALUES (?, ?)').run(name, now)
    return { id: Number(info.lastInsertRowid), name, createdAt: now, trackCount: 0 }
  })

  ipcMain.handle('library:renamePlaylist', (_e, id: number, name: string): void => {
    getDb().prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id)
  })

  ipcMain.handle('library:deletePlaylist', (_e, id: number): void => {
    getDb().prepare('DELETE FROM playlists WHERE id = ?').run(id)
  })

  // ---- tracks ----
  ipcMain.handle('library:listLibraryTracks', (): Track[] => {
    const rows = getDb().prepare('SELECT * FROM tracks ORDER BY added_at DESC').all() as TrackRow[]
    return rows.map(rowToTrack)
  })

  ipcMain.handle('library:listPlaylistTracks', (_e, playlistId: number): Track[] => {
    const rows = getDb()
      .prepare(
        `SELECT t.* FROM tracks t
         JOIN playlist_tracks pt ON pt.track_id = t.id
         WHERE pt.playlist_id = ?
         ORDER BY pt.position`
      )
      .all(playlistId) as TrackRow[]
    return rows.map(rowToTrack)
  })

  ipcMain.handle(
    'library:addTrackFromUrl',
    async (
      _e,
      url: string,
      playlistId: number | null
    ): Promise<{ ok: true; track: Track } | { ok: false; error: string }> => {
      const { service, serviceId } = classify(url)
      if (service === 'spotify') {
        return {
          ok: false,
          error:
            "Spotify tracks are DRM-protected and can't stream directly. Spotify→YouTube resolution is coming in Phase 3. For now, search for the track or paste a YouTube/SoundCloud/Bandcamp link."
        }
      }
      try {
        const resolved = await resolveStream(url)
        const db = getDb()
        const now = Date.now()

        const insertTrack = db.prepare(
          `INSERT INTO tracks (service, service_id, source_url, title, artist, duration_ms, thumbnail_url, added_at)
           VALUES (@service, @service_id, @source_url, @title, @artist, @duration_ms, @thumbnail_url, @added_at)
           ON CONFLICT(service, service_id) DO UPDATE SET
             title = excluded.title,
             artist = excluded.artist,
             duration_ms = excluded.duration_ms,
             thumbnail_url = excluded.thumbnail_url
           RETURNING *`
        )
        const row = insertTrack.get({
          service,
          service_id: serviceId,
          source_url: url,
          title: resolved.title,
          artist: resolved.uploader,
          duration_ms: resolved.durationSec ? Math.round(resolved.durationSec * 1000) : null,
          thumbnail_url: resolved.thumbnail,
          added_at: now
        }) as TrackRow

        if (playlistId != null) {
          const maxPos = (
            db
              .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM playlist_tracks WHERE playlist_id = ?')
              .get(playlistId) as { m: number }
          ).m
          db.prepare(
            'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)'
          ).run(playlistId, row.id, maxPos + 1)
        }

        return { ok: true, track: rowToTrack(row) }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle(
    'library:removeTrackFromPlaylist',
    (_e, playlistId: number, trackId: number): void => {
      getDb()
        .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
        .run(playlistId, trackId)
    }
  )

  ipcMain.handle('library:deleteTrack', (_e, trackId: number): void => {
    getDb().prepare('DELETE FROM tracks WHERE id = ?').run(trackId)
  })

  // ---- search ----
  ipcMain.handle('library:search', async (_e, query: string): Promise<SearchResult[]> => {
    return await search(query, 6)
  })

  ipcMain.handle(
    'library:getArtistTracks',
    async (_e, name: string): Promise<ArtistDiscography> => {
      return await getArtistDiscography(name)
    }
  )

  ipcMain.handle(
    'library:getArtistFromSpotify',
    async (
      _e,
      name: string
    ): Promise<{ ok: true; data: SpotifyArtistResult } | { ok: false; error: string }> => {
      try {
        const data = await getArtistFromSpotify(name)
        return { ok: true, data }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle(
    'library:getArtistCatalog',
    async (
      _e,
      name: string
    ): Promise<{ ok: true; data: MbCatalog } | { ok: false; error: string }> => {
      try {
        const data = await getArtistCatalog(name)
        return { ok: true, data }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle(
    'library:getUploaderUploads',
    async (
      _e,
      name: string
    ): Promise<{ ok: true; data: UploaderUploads } | { ok: false; error: string }> => {
      try {
        const data = await getUploaderUploads(name)
        return { ok: true, data }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )
}

export type {
  SearchResult,
  ArtistDiscography,
  ArtistTrack,
  ArtistTrackKind,
  SpotifyArtistResult,
  MbCatalog
}
// UploaderUploads is exported above as an interface.
