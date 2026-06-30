// Downloads the latest yt-dlp.exe release into resources/bin/.
// Runs on `npm install` (postinstall) and is idempotent — skips if the file
// already exists. yt-dlp itself self-updates at runtime via the --update flag
// invoked from the main process on app launch.

import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TARGET_DIR = resolve(__dirname, '..', 'resources', 'bin')
const TARGET_PATH = resolve(TARGET_DIR, 'yt-dlp.exe')
const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

async function main() {
  if (existsSync(TARGET_PATH)) {
    console.log(`[fetch-ytdlp] already present at ${TARGET_PATH}, skipping`)
    return
  }
  mkdirSync(TARGET_DIR, { recursive: true })
  console.log(`[fetch-ytdlp] downloading from ${URL}`)
  const res = await fetch(URL, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`)
  }
  await pipeline(res.body, createWriteStream(TARGET_PATH))
  console.log(`[fetch-ytdlp] wrote ${TARGET_PATH}`)
}

main().catch((err) => {
  console.error('[fetch-ytdlp] failed:', err.message)
  // Don't break the install — the app will surface a clearer error at runtime
  // if the binary is missing.
  process.exit(0)
})
