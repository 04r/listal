import Database from 'better-sqlite3'
import { join } from 'node:path'
import { app } from 'electron'

// Schema is defined inline (not loaded from disk) so it survives the
// Vite/electron-builder bundle without extra asset wiring. Keep this in sync
// with the human-readable copy at src/main/db/schema.sql.
const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  service TEXT NOT NULL,
  service_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  duration_ms INTEGER,
  thumbnail_url TEXT,
  added_at INTEGER NOT NULL,
  UNIQUE(service, service_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS tokens (
  service TEXT PRIMARY KEY,
  access_token BLOB NOT NULL,
  refresh_token BLOB,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist
  ON playlist_tracks(playlist_id, position);

CREATE TABLE IF NOT EXISTS stream_cache (
  source_url TEXT PRIMARY KEY,
  stream_url TEXT NOT NULL,
  title TEXT NOT NULL,
  uploader TEXT,
  duration_sec REAL,
  thumbnail TEXT,
  expires_at INTEGER NOT NULL
);
`

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'listal.db')
  db = new Database(dbPath)
  db.exec(SCHEMA)
  return db
}

export interface TrackRow {
  id: number
  service: string
  service_id: string
  source_url: string
  title: string
  artist: string | null
  album: string | null
  duration_ms: number | null
  thumbnail_url: string | null
  added_at: number
}

export interface PlaylistRow {
  id: number
  name: string
  created_at: number
}
