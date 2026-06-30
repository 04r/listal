// Maps a source URL to a (service, serviceId) tuple. Service IDs aren't
// strictly canonical across services — we just need something stable per
// service for the UNIQUE constraint.

export type Service = 'youtube' | 'soundcloud' | 'bandcamp' | 'spotify' | 'unknown'

export function classify(url: string): { service: Service; serviceId: string } {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { service: 'unknown', serviceId: url }
  }
  const host = u.hostname.replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v')
    return { service: 'youtube', serviceId: v ?? url }
  }
  if (host === 'youtu.be') {
    return { service: 'youtube', serviceId: u.pathname.replace(/^\//, '') }
  }
  if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) {
    return { service: 'soundcloud', serviceId: u.pathname }
  }
  if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) {
    return { service: 'bandcamp', serviceId: `${host}${u.pathname}` }
  }
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) {
    return { service: 'spotify', serviceId: u.pathname }
  }
  return { service: 'unknown', serviceId: url }
}
