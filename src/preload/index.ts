import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ResolveStreamResult } from '../main/ipc/playback'
import type {
  Track,
  Playlist,
  SearchResult,
  ArtistDiscography,
  ArtistTrack,
  ArtistTrackKind,
  SpotifyArtistResult,
  MbCatalog,
  UploaderUploads
} from '../main/ipc/library'
import type { SpotifyStatus } from '../main/ipc/auth'
import type { LyricsResult } from '../main/ipc/lyrics'

const api = {
  resolveStream: (url: string, priority = false): Promise<ResolveStreamResult> =>
    ipcRenderer.invoke('playback:resolve', url, priority),

  // Library
  listPlaylists: (): Promise<Playlist[]> => ipcRenderer.invoke('library:listPlaylists'),
  createPlaylist: (name: string): Promise<Playlist> =>
    ipcRenderer.invoke('library:createPlaylist', name),
  renamePlaylist: (id: number, name: string): Promise<void> =>
    ipcRenderer.invoke('library:renamePlaylist', id, name),
  deletePlaylist: (id: number): Promise<void> =>
    ipcRenderer.invoke('library:deletePlaylist', id),

  listLibraryTracks: (): Promise<Track[]> => ipcRenderer.invoke('library:listLibraryTracks'),
  listPlaylistTracks: (playlistId: number): Promise<Track[]> =>
    ipcRenderer.invoke('library:listPlaylistTracks', playlistId),

  addTrackFromUrl: (
    url: string,
    playlistId: number | null
  ): Promise<{ ok: true; track: Track } | { ok: false; error: string }> =>
    ipcRenderer.invoke('library:addTrackFromUrl', url, playlistId),

  removeTrackFromPlaylist: (playlistId: number, trackId: number): Promise<void> =>
    ipcRenderer.invoke('library:removeTrackFromPlaylist', playlistId, trackId),

  deleteTrack: (trackId: number): Promise<void> =>
    ipcRenderer.invoke('library:deleteTrack', trackId),

  search: (query: string): Promise<SearchResult[]> =>
    ipcRenderer.invoke('library:search', query),

  songRadio: (sourceUrl: string): Promise<SearchResult[]> =>
    ipcRenderer.invoke('library:songRadio', sourceUrl),

  getArtistTracks: (name: string): Promise<ArtistDiscography> =>
    ipcRenderer.invoke('library:getArtistTracks', name),

  // Spotify
  spotifyStatus: (): Promise<SpotifyStatus> => ipcRenderer.invoke('auth:spotifyStatus'),
  spotifyConnect: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('auth:spotifyConnect'),
  spotifyDisconnect: (): Promise<void> => ipcRenderer.invoke('auth:spotifyDisconnect'),
  getArtistFromSpotify: (
    name: string
  ): Promise<{ ok: true; data: SpotifyArtistResult } | { ok: false; error: string }> =>
    ipcRenderer.invoke('library:getArtistFromSpotify', name),

  getArtistCatalog: (
    name: string
  ): Promise<{ ok: true; data: MbCatalog } | { ok: false; error: string }> =>
    ipcRenderer.invoke('library:getArtistCatalog', name),

  getLyrics: (
    artist: string,
    title: string,
    durationSec: number | null
  ): Promise<{ ok: true; data: LyricsResult } | { ok: false; error: string }> =>
    ipcRenderer.invoke('lyrics:fetch', artist, title, durationSec),

  getUploaderUploads: (
    name: string
  ): Promise<{ ok: true; data: UploaderUploads } | { ok: false; error: string }> =>
    ipcRenderer.invoke('library:getUploaderUploads', name),

  // Discord rich presence — silently no-ops if Discord isn't running.
  setDiscordPresence: (p: {
    title: string
    artist: string | null
    service: string
    durationSec: number | null
    positionSec: number
    isPlaying: boolean
    sourceUrl?: string | null
  }): Promise<void> => ipcRenderer.invoke('discord:set', p),
  clearDiscordPresence: (): Promise<void> => ipcRenderer.invoke('discord:clear')
}

export type Api = typeof api
export type {
  Track,
  Playlist,
  SearchResult,
  ArtistDiscography,
  ArtistTrack,
  ArtistTrackKind,
  SpotifyArtistResult,
  SpotifyStatus,
  MbCatalog,
  LyricsResult,
  UploaderUploads
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
