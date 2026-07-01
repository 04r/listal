import { useEffect, useRef, useState } from 'react'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  name: string
  defaultRect: Rect
  minW?: number
  minH?: number
  title: React.ReactNode
  onClose?: () => void
  children: React.ReactNode
}

// Persistent per-window z-order counter. Whichever window was most recently
// interacted with sits on top.
let zTop = 1000
const zMap = new Map<string, number>()

function loadRect(name: string, fallback: Rect): Rect {
  try {
    const raw = localStorage.getItem(`float:${name}`)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (
      typeof parsed?.x === 'number' &&
      typeof parsed?.y === 'number' &&
      typeof parsed?.w === 'number' &&
      typeof parsed?.h === 'number'
    ) {
      return parsed
    }
  } catch {
    /* ignore */
  }
  return fallback
}

function saveRect(name: string, rect: Rect): void {
  try {
    localStorage.setItem(`float:${name}`, JSON.stringify(rect))
  } catch {
    /* ignore */
  }
}

// A frameless floating window: header + body. Draggable by the header, and
// resizable from every edge and corner. Position + size persist per `name`
// key so a reload restores the layout.
export function FloatingWindow({
  name,
  defaultRect,
  minW = 220,
  minH = 160,
  title,
  onClose,
  children
}: Props): React.JSX.Element {
  const [rect, setRect] = useState<Rect>(() => loadRect(name, defaultRect))
  const [z, setZ] = useState<number>(() => {
    const existing = zMap.get(name)
    if (existing) return existing
    zTop += 1
    zMap.set(name, zTop)
    return zTop
  })

  // Persist rect changes (debounced-ish via effect batching).
  useEffect(() => {
    saveRect(name, rect)
  }, [name, rect])

  function bringToFront(): void {
    zTop += 1
    zMap.set(name, zTop)
    setZ(zTop)
  }

  // ---- Drag ----
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  function onHeaderMouseDown(e: React.MouseEvent): void {
    // Ignore clicks on the close button etc.
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return
    e.preventDefault()
    bringToFront()
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: rect.x, oy: rect.y }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragUp)
  }
  function onDragMove(e: MouseEvent): void {
    const d = dragRef.current
    if (!d) return
    const nx = clamp(d.ox + (e.clientX - d.startX), 0, window.innerWidth - 80)
    const ny = clamp(d.oy + (e.clientY - d.startY), 0, window.innerHeight - 30)
    setRect((r) => ({ ...r, x: nx, y: ny }))
  }
  function onDragUp(): void {
    dragRef.current = null
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragUp)
  }

  // ---- Resize ----
  type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  const resizeRef = useRef<{ edge: Edge; startX: number; startY: number; r0: Rect } | null>(null)
  function startResize(edge: Edge) {
    return (e: React.MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      bringToFront()
      resizeRef.current = { edge, startX: e.clientX, startY: e.clientY, r0: rect }
      window.addEventListener('mousemove', onResizeMove)
      window.addEventListener('mouseup', onResizeUp)
    }
  }
  function onResizeMove(e: MouseEvent): void {
    const r = resizeRef.current
    if (!r) return
    const dx = e.clientX - r.startX
    const dy = e.clientY - r.startY
    let { x, y, w, h } = r.r0
    if (r.edge.includes('e')) w = Math.max(minW, r.r0.w + dx)
    if (r.edge.includes('s')) h = Math.max(minH, r.r0.h + dy)
    if (r.edge.includes('w')) {
      const nw = Math.max(minW, r.r0.w - dx)
      x = r.r0.x + (r.r0.w - nw)
      w = nw
    }
    if (r.edge.includes('n')) {
      const nh = Math.max(minH, r.r0.h - dy)
      y = r.r0.y + (r.r0.h - nh)
      h = nh
    }
    setRect({ x, y, w, h })
  }
  function onResizeUp(): void {
    resizeRef.current = null
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeUp)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragUp)
      window.removeEventListener('mousemove', onResizeMove)
      window.removeEventListener('mouseup', onResizeUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="pointer-events-auto fixed border border-[var(--color-border-strong)] bg-[var(--color-shell)] shadow-2xl"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: z
      }}
      onMouseDown={bringToFront}
    >
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex h-7 cursor-move select-none items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
        {onClose && (
          <button
            data-nodrag
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        )}
      </div>
      <div className="h-[calc(100%-1.75rem)] overflow-hidden">{children}</div>

      {/* Resize handles */}
      <div onMouseDown={startResize('n')} className="absolute inset-x-2 top-0 h-1 cursor-ns-resize" />
      <div onMouseDown={startResize('s')} className="absolute inset-x-2 bottom-0 h-1 cursor-ns-resize" />
      <div onMouseDown={startResize('e')} className="absolute inset-y-2 right-0 w-1 cursor-ew-resize" />
      <div onMouseDown={startResize('w')} className="absolute inset-y-2 left-0 w-1 cursor-ew-resize" />
      <div onMouseDown={startResize('ne')} className="absolute right-0 top-0 h-2 w-2 cursor-nesw-resize" />
      <div onMouseDown={startResize('nw')} className="absolute left-0 top-0 h-2 w-2 cursor-nwse-resize" />
      <div onMouseDown={startResize('se')} className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize" />
      <div onMouseDown={startResize('sw')} className="absolute bottom-0 left-0 h-2 w-2 cursor-nesw-resize" />
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
