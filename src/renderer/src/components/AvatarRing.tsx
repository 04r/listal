export type PresenceStatus = 'online' | 'idle' | 'busy' | 'invisible' | 'offline'

// Colour for the ring around a user's avatar. Mirrors the palette Discord
// uses so the semantics read quickly.
export function presenceColor(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return '#3ba55d'
    case 'idle':
      return '#faa61a'
    case 'busy':
      return '#ed4245'
    case 'invisible':
    case 'offline':
      return '#747f8d'
  }
}

interface Props {
  src: string | null | undefined
  alt?: string
  size: number
  status: PresenceStatus
  fallbackChar?: string
  title?: string
}

// Small round avatar wrapped in a coloured ring representing the user's
// presence status. When no image URL is provided, we render the initial as
// a tinted fallback disc.
export function AvatarRing({
  src,
  alt = '',
  size,
  status,
  fallbackChar,
  title
}: Props): React.JSX.Element {
  const ring = presenceColor(status)
  const outer = size + 4
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: outer, height: outer }}
      title={title}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          border: `2px solid ${ring}`
        }}
      />
      {src ? (
        <img
          src={src}
          alt={alt}
          className="absolute rounded-full object-cover"
          style={{
            width: size,
            height: size,
            top: 2,
            left: 2
          }}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className="absolute grid rounded-full bg-[var(--color-surface-2)] font-semibold text-[var(--color-text-muted)]"
          style={{
            width: size,
            height: size,
            top: 2,
            left: 2,
            fontSize: Math.max(9, Math.floor(size * 0.48)),
            placeItems: 'center'
          }}
        >
          {(fallbackChar ?? '?').slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  )
}
