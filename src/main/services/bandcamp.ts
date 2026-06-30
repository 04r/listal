import type { SearchResult } from './ytdlp'

// Bandcamp has no public search API and the HTML search page is gated by a
// JS bot challenge. The autocomplete endpoint their own site uses is open
// though — undocumented but stable for years.
const ENDPOINT = 'https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic'

interface BandcampTrackResult {
  type: 't' | 'a' | 'b'
  name: string
  band_name?: string
  album_name?: string
  item_url_path?: string
  img?: string
}

interface BandcampApiResponse {
  auto?: { results?: BandcampTrackResult[] }
}

export async function searchBandcamp(query: string, limit: number): Promise<SearchResult[]> {
  if (!query.trim()) return []
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        search_text: query,
        search_filter: 't', // tracks only
        fan_id: null,
        full_page: true
      })
    })
    if (!res.ok) return []
    const data = (await res.json()) as BandcampApiResponse
    const results = data.auto?.results ?? []
    return results
      .filter((r) => r.type === 't' && r.item_url_path)
      .slice(0, limit)
      .map((r) => ({
        service: 'bandcamp' as const,
        sourceUrl: r.item_url_path!,
        title: r.name,
        uploader: r.band_name ?? null,
        durationSec: null, // bandcamp's autocomplete doesn't expose duration
        thumbnail: upscaleArt(r.img)
      }))
  } catch (e) {
    console.warn('[bandcamp] search failed:', (e as Error).message)
    return []
  }
}

// Bandcamp art URLs end with _<size>.jpg where size 3 = 100x100, 7 = 150x150,
// 16 = 700x700. We want something between the thumbnail icon (3) and the
// hero-banner sizes — _7 (150px) is a good fit for our 40px list rows at 2x DPI.
function upscaleArt(url: string | undefined): string | null {
  if (!url) return null
  return url.replace(/_\d+\.jpg$/, '_7.jpg')
}
