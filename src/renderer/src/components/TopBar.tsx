import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X, Music2 } from 'lucide-react'
import { useLibrary } from '../stores/library'

export function TopBar(): React.JSX.Element {
  const { view, setView } = useLibrary()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // When we switch to Search view from elsewhere, focus the input
  useEffect(() => {
    if (view.kind === 'search') inputRef.current?.focus()
  }, [view.kind])

  function onFocus(): void {
    if (view.kind !== 'search') setView({ kind: 'search' })
    // Publish the query to the SearchView via a global event
    dispatchSearchQuery(query)
  }

  function onChange(v: string): void {
    setQuery(v)
    if (view.kind !== 'search') setView({ kind: 'search' })
    dispatchSearchQuery(v)
  }

  return (
    <header className="drag relative z-20 flex h-14 shrink-0 items-center gap-3 bg-black px-3">
      {/* Brand mark */}
      <div className="no-drag flex items-center gap-2 px-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
          <Music2 size={18} strokeWidth={2.5} />
        </div>
      </div>

      {/* Center cluster: history + search */}
      <div className="no-drag mx-auto flex max-w-3xl flex-1 items-center gap-2">
        <button
          className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Forward"
        >
          <ChevronRight size={18} />
        </button>

        <label className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            placeholder="What do you want to play?"
            className="h-12 w-full rounded-full bg-[var(--color-surface)] pl-12 pr-12 text-sm text-[var(--color-text)] outline-none ring-0 placeholder:text-[var(--color-text-muted)] focus:bg-[var(--color-surface-2)] focus:ring-1 focus:ring-white/40"
          />
          {query && (
            <button
              onClick={() => onChange('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              aria-label="Clear"
            >
              <X size={16} />
            </button>
          )}
        </label>
      </div>

      {/* Right cluster placeholder — overlay reserves space for window controls */}
      <div className="no-drag flex items-center gap-2 pr-32" />
    </header>
  )
}

const SEARCH_EVT = 'zp:search-query'

function dispatchSearchQuery(q: string): void {
  window.dispatchEvent(new CustomEvent<string>(SEARCH_EVT, { detail: q }))
}

export function useSearchQuery(initial = ''): [string, (v: string) => void] {
  const [q, setQ] = useState(initial)
  useEffect(() => {
    const handler = (e: Event): void => {
      setQ((e as CustomEvent<string>).detail)
    }
    window.addEventListener(SEARCH_EVT, handler)
    return () => window.removeEventListener(SEARCH_EVT, handler)
  }, [])
  return [q, setQ]
}
