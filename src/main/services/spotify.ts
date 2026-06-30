// Prototype Spotify integration: PKCE OAuth + a tiny Web API client.
//
// Personal-use only. To connect:
//   1. Create an app at https://developer.spotify.com/dashboard
//   2. Add redirect URI: http://127.0.0.1:8898/callback
//   3. Set SPOTIFY_CLIENT_ID in your shell before `npm run dev` (or hardcode below).
//
// Tokens land in the `tokens` table. They're stored *unencrypted* for now —
// fine for personal use but switch to Electron `safeStorage` before sharing.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { shell } from 'electron'
import { getDb } from '../db'

// Personal-use Spotify app. Override with SPOTIFY_CLIENT_ID env var if needed.
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '77b7019ba8da4789a5c628facf1f75a7'
const REDIRECT_URI = 'http://127.0.0.1:8898/callback'
const SCOPES = ['user-read-private', 'user-read-email'].join(' ')
const SERVICE_KEY = 'spotify'

export interface SpotifyTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

export class SpotifyNotConnectedError extends Error {
  constructor() {
    super('Spotify is not connected')
    this.name = 'SpotifyNotConnectedError'
  }
}

export class SpotifyNotConfiguredError extends Error {
  constructor() {
    super(
      'SPOTIFY_CLIENT_ID is not set. Create a Spotify app at developer.spotify.com, ' +
        'add http://127.0.0.1:8898/callback as a redirect URI, then set the env var before launch.'
    )
    this.name = 'SpotifyNotConfiguredError'
  }
}

export function isConfigured(): boolean {
  return CLIENT_ID.length > 0
}

export function isConnected(): boolean {
  return loadTokens() != null
}

function loadTokens(): SpotifyTokens | null {
  const row = getDb()
    .prepare('SELECT access_token, refresh_token, expires_at FROM tokens WHERE service = ?')
    .get(SERVICE_KEY) as
    | { access_token: Buffer | string; refresh_token: Buffer | string | null; expires_at: number | null }
    | undefined
  if (!row) return null
  return {
    accessToken: row.access_token.toString(),
    refreshToken: row.refresh_token ? row.refresh_token.toString() : null,
    expiresAt: row.expires_at ?? 0
  }
}

function saveTokens(t: SpotifyTokens): void {
  getDb()
    .prepare(
      `INSERT INTO tokens (service, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(service) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at`
    )
    .run(SERVICE_KEY, Buffer.from(t.accessToken), t.refreshToken ? Buffer.from(t.refreshToken) : null, t.expiresAt)
}

export function disconnect(): void {
  getDb().prepare('DELETE FROM tokens WHERE service = ?').run(SERVICE_KEY)
}

function genVerifier(): string {
  return base64Url(randomBytes(48))
}
function genChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest())
}
function base64Url(b: Buffer): string {
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// Single in-flight auth session — multiple Connect clicks would conflict.
let inflight: Promise<void> | null = null

export function connect(): Promise<void> {
  if (!isConfigured()) return Promise.reject(new SpotifyNotConfiguredError())
  if (inflight) return inflight

  inflight = new Promise<void>((resolveP, rejectP) => {
    const verifier = genVerifier()
    const challenge = genChallenge(verifier)
    const state = base64Url(randomBytes(12))

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) return
      const u = new URL(req.url, REDIRECT_URI)
      if (u.pathname !== '/callback') {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      const code = u.searchParams.get('code')
      const err = u.searchParams.get('error')
      const gotState = u.searchParams.get('state')

      const finish = (ok: boolean, msg: string): void => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(
          `<!doctype html><meta charset="utf-8"><title>${ok ? 'Connected' : 'Error'}</title>
           <body style="font-family:system-ui;background:#000;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
           <div style="text-align:center">
             <div style="font-size:48px;margin-bottom:16px">${ok ? '✓' : '✗'}</div>
             <h1>${msg}</h1>
             <p style="color:#888">You can close this tab and return to Listal.</p>
           </div>`
        )
        setTimeout(() => server.close(), 500)
      }

      if (err || gotState !== state) {
        finish(false, err ? `Spotify error: ${err}` : 'State mismatch')
        rejectP(new Error(err ?? 'OAuth state mismatch'))
        return
      }
      if (!code) {
        finish(false, 'No code returned')
        rejectP(new Error('No code returned'))
        return
      }

      exchangeCode(code, verifier)
        .then((tokens) => {
          saveTokens(tokens)
          finish(true, 'Listal connected to Spotify')
          resolveP()
        })
        .catch((e) => {
          finish(false, `Token exchange failed: ${(e as Error).message}`)
          rejectP(e)
        })
    })

    server.on('error', rejectP)
    server.listen(8898, '127.0.0.1', () => {
      const authUrl = new URL('https://accounts.spotify.com/authorize')
      authUrl.searchParams.set('client_id', CLIENT_ID)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('state', state)
      void shell.openExternal(authUrl.toString())
    })

    // Watchdog — if the user closes the browser without responding, free the
    // port after 5 minutes so they can try again.
    setTimeout(() => {
      server.close()
      rejectP(new Error('Spotify auth timed out (5 min). Try Connect again.'))
    }, 5 * 60 * 1000).unref()
  }).finally(() => {
    inflight = null
  })

  return inflight
}

async function exchangeCode(code: string, verifier: string): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier
  })
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`)
  const j = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: Date.now() + (j.expires_in - 60) * 1000
  }
}

async function refreshIfNeeded(t: SpotifyTokens): Promise<SpotifyTokens> {
  if (t.expiresAt > Date.now()) return t
  if (!t.refreshToken) throw new SpotifyNotConnectedError()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: t.refreshToken,
    client_id: CLIENT_ID
  })
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) disconnect()
    throw new Error(`refresh ${res.status}: ${await res.text()}`)
  }
  const j = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  const next: SpotifyTokens = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? t.refreshToken,
    expiresAt: Date.now() + (j.expires_in - 60) * 1000
  }
  saveTokens(next)
  return next
}

async function spotifyFetch<T>(path: string, query?: Record<string, string>): Promise<T> {
  let tokens = loadTokens()
  if (!tokens) throw new SpotifyNotConnectedError()
  tokens = await refreshIfNeeded(tokens)
  const url = new URL(`https://api.spotify.com/v1${path}`)
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` }
  })
  if (!res.ok) throw new Error(`Spotify ${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()) as T
}

// -----------------------------------------------------------------------------
// Artist canonical track list
// -----------------------------------------------------------------------------

export interface SpotifyArtistTrack {
  spotifyId: string
  isrc: string | null
  name: string
  durationMs: number
  album: string
  artists: string[]
  imageUrl: string | null
  popularity: number
  externalUrl: string
}

export interface SpotifyArtistResult {
  found: boolean
  artistName: string
  artistImage: string | null
  followers: number | null
  tracks: SpotifyArtistTrack[]
}

interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

interface SpotifyArtist {
  id: string
  name: string
  images: SpotifyImage[]
  followers?: { total: number }
}

interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  popularity: number
  external_ids?: { isrc?: string }
  external_urls?: { spotify?: string }
  album: { name: string; images: SpotifyImage[] }
  artists: Array<{ name: string }>
}

function pickImage(arr: SpotifyImage[]): string | null {
  if (!arr || arr.length === 0) return null
  return arr[0]?.url ?? null
}

export async function getArtistFromSpotify(name: string): Promise<SpotifyArtistResult> {
  // 1) artist search
  const searchRes = await spotifyFetch<{ artists: { items: SpotifyArtist[] } }>('/search', {
    q: name,
    type: 'artist',
    limit: '5'
  })
  const artist = searchRes.artists.items.find(
    (a) => a.name.toLowerCase() === name.toLowerCase()
  ) ?? searchRes.artists.items[0]

  if (!artist) {
    return { found: false, artistName: name, artistImage: null, followers: null, tracks: [] }
  }

  // 2) top tracks
  const top = await spotifyFetch<{ tracks: SpotifyTrack[] }>(`/artists/${artist.id}/top-tracks`, {
    market: 'US'
  })

  return {
    found: true,
    artistName: artist.name,
    artistImage: pickImage(artist.images),
    followers: artist.followers?.total ?? null,
    tracks: top.tracks.map((t) => ({
      spotifyId: t.id,
      isrc: t.external_ids?.isrc ?? null,
      name: t.name,
      durationMs: t.duration_ms,
      album: t.album.name,
      artists: t.artists.map((a) => a.name),
      imageUrl: pickImage(t.album.images),
      popularity: t.popularity,
      externalUrl: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`
    }))
  }
}
