import { useEffect, useState } from 'react'

interface ToastEvent {
  message: string
  ttlMs?: number
  kind?: 'info' | 'error'
}

interface ActiveToast extends ToastEvent {
  id: number
}

let nextId = 1

// Global toast layer. Anything can pop up a temporary status/error message by
// dispatching a CustomEvent('listal:toast', { detail: { message, ttlMs } }).
// Handles auto-dismiss so callers don't need their own timers, and stacks
// multiple toasts in the top-right.
export function ToastLayer(): React.JSX.Element {
  const [toasts, setToasts] = useState<ActiveToast[]>([])

  useEffect(() => {
    const onToast = (e: Event): void => {
      const d = (e as CustomEvent<ToastEvent>).detail
      if (!d?.message) return
      const id = nextId++
      const ttl = d.ttlMs ?? 4000
      setToasts((cur) => [...cur, { ...d, id }])
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== id))
      }, ttl)
    }
    window.addEventListener('listal:toast', onToast)
    return () => window.removeEventListener('listal:toast', onToast)
  }, [])

  if (toasts.length === 0) return <></>
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-[320px] border px-3 py-2 text-[11.5px] shadow-2xl ${
            t.kind === 'error'
              ? 'border-[var(--color-danger)] bg-red-500/15 text-[var(--color-danger)]'
              : 'border-[var(--color-border-strong)] bg-[var(--color-shell)] text-[var(--color-text)]'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
