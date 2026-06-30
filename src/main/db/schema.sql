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

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, position);
