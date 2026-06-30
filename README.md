# Listal

One player for every service. Listal is a Windows desktop app that streams music from YouTube, SoundCloud, Bandcamp, and Spotify into one library — with synced lyrics, friends, DMs, and listen-along.

![Listal](docs/listal.png)

## What it does

- **Unified library** — paste a YouTube, SoundCloud, or Bandcamp URL and the track lands in your library. Cross-service playlists just work.
- **Search everywhere at once** — one search bar fans out across services and de-dupes results by song via MusicBrainz.
- **Artist & uploader pages** — browse a canonical MusicBrainz discography grouped by album, or click any uploader to see all their videos.
- **Synced lyrics** — six-source cascade (LRCLIB, NetEase, QQ Music, Kugou, Genius, lyrics.ovh). Click any line to seek.
- **Foobar2000-style UI** — light, dense, keyboard-friendly. Menubar, transport row, status bar.
- **Discord Rich Presence** — "Listening to X by Y" with album art and a timeline.
- **Friends** — add by `@username`, see who's online, see what they're playing.
- **DMs** — 1:1 chat with Realtime delivery.
- **Listen along** — click the radio icon next to a friend and your player syncs to theirs in real time: same track, same position, mirrored play/pause/seek.
- **Spotify integration** — connect your account, browse popular tracks per artist (playback routes through YouTube).

## Tech

Electron 39 · React 19 · TypeScript · Tailwind v4 · Zustand · Howler.js · better-sqlite3 · yt-dlp · Supabase (auth + Realtime + Postgres) · MusicBrainz · LRCLIB · discord-rpc

## Install (use the prebuilt installer)

1. Grab the latest `listal-x.y.z-setup.exe` from [Releases](../../releases).
2. Run it. Listal installs into your user profile (no admin prompt).
3. Launch Listal. yt-dlp is bundled, so you can paste a URL and hit play immediately.

That's it. The app plays music fine without an account — sign in only if you want friends and listen-along.

## Build from source

Requires Node 20+, Git, and a Windows machine for `.exe` output.

```bash
git clone https://github.com/04r/listal.git
cd listal
npm install        # also fetches yt-dlp.exe into resources/bin/
npm run dev        # hot-reload dev mode
npm run build:win  # produces dist/listal-x.y.z-setup.exe
```

## Optional setup (only needed for friends + Discord features)

These are all opt-in. Listal plays music fine without any of them.

### Supabase (friends, DMs, listen-along)

The repo ships with hardcoded pointers at `src/renderer/src/lib/supabase.ts` to my project — replace `SUPABASE_URL` and `SUPABASE_KEY` with your own if you want a fresh instance.

1. Create a Supabase project.
2. Open the SQL Editor, paste `db/supabase-schema.sql`, and run it. This creates the `profiles`, `friendships`, and `messages` tables with RLS, and enables Realtime on `messages`.
3. In **Authentication → Providers → Email**, turn off "Confirm email" so sign-up doesn't require an inbox round-trip. (Optional, but recommended for personal use.)

### Discord Rich Presence

The repo points at the `Listal` Discord app (`client_id` = `1521613873847992410`) at `src/main/services/discord.ts`. Replace with your own client ID if you fork.

For art to render in your "Listening to" status:

1. Go to `https://discord.com/developers/applications/<your-app-id>/rich-presence/assets`
2. Upload a large image keyed `listal` (any logo, 1024×1024 works).
3. Optional: upload small-image keys `youtube`, `soundcloud`, `bandcamp`, `spotify` for per-service icons.

If Discord isn't running, RPC silently no-ops — it retries every 30 seconds.

### Spotify

In `src/main/services/spotify.ts` the default `clientId` is baked in. PKCE OAuth handles the rest from the Settings menu in-app.

## How playback actually works

Listal never downloads. For every track, the main process spawns `yt-dlp -f bestaudio -g <url>` to print a direct stream URL, then pipes that URL into an HTML5 `<audio>` (wrapped by Howler). Stream URLs expire after a few hours, so they're resolved on play, not on import.

For SoundCloud and YouTube, format selection filters out DRM-protected streams. For Spotify tracks, metadata is fetched from the Spotify Web API and matched to YouTube for playback (best-effort top-result resolution).

## Project layout

```
src/
  main/            Electron main process — yt-dlp, SQLite, IPC, Discord RPC
    services/      yt-dlp, MusicBrainz, lyrics cascade, Spotify, Discord
    ipc/           Typed IPC handlers
    db/            better-sqlite3 wrapper + schema
  preload/         contextBridge surface (window.api)
  renderer/        React app
    components/    UI
    stores/        Zustand stores (player, social, listenAlong, chat, auth)
    lib/           Supabase client
db/                Supabase SQL schema
docs/              Screenshots
resources/bin/     Bundled yt-dlp.exe (downloaded via postinstall)
```

## Licence

Personal-use project. No licence file — fork it, hack it, don't redistribute it as-is.
