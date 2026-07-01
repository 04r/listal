import { useEffect, useState } from 'react'
import {
  Plus,
  X,
  Library,
  ListMusic,
  Search,
  User,
  Radio,
  MessageSquare
} from 'lucide-react'
import { useTabs, tabTitleFor, type Tab } from '../stores/tabs'
import { useLibrary, type View } from '../stores/library'
import type { Playlist } from '../../../preload'

// Chrome-style tab strip. Sits between the menubar and the search row.
export function TabBar(): React.JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const activate = useTabs((s) => s.activate)
  const closeTab = useTabs((s) => s.closeTab)
  const addTab = useTabs((s) => s.addTab)
  const reorder = useTabs((s) => s.reorder)
  const setView = useLibrary((s) => s.setView)
  const version = useLibrary((s) => s.version)
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  // Load playlists for playlist-tab titles.
  useEffect(() => {
    void window.api.listPlaylists().then(setPlaylists)
  }, [version])

  function onClickTab(t: Tab): void {
    activate(t.id)
    setView(t.view)
  }

  function onNewTab(): void {
    // New tab defaults to Library — user can navigate from there.
    const id = addTab({ kind: 'library' })
    activate(id)
    setView({ kind: 'library' })
  }

  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <div className="flex h-7 shrink-0 items-end gap-0.5 border-b border-[var(--color-border-strong)] bg-[var(--color-bg)] px-1">
      {tabs.map((t) => {
        const active = t.id === activeId
        const title = tabTitleFor(t.view, playlistTitleFor(t.view, playlists))
        return (
          <div
            key={t.id}
            draggable
            onDragStart={() => setDragId(t.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              if (dragId && dragId !== t.id) e.preventDefault()
            }}
            onDrop={() => {
              if (dragId && dragId !== t.id) reorder(dragId, t.id)
              setDragId(null)
            }}
            onClick={() => onClickTab(t)}
            className={`group flex h-6 max-w-[180px] cursor-default items-center gap-1.5 border border-b-0 border-[var(--color-border-strong)] px-2 text-[11px] ${
              active
                ? 'bg-[var(--color-surface)] text-[var(--color-text)]'
                : 'bg-[var(--color-shell)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)]'
            }`}
            style={{ borderTopColor: active ? 'var(--color-accent)' : undefined, borderTopWidth: active ? 2 : 1 }}
            title={title}
          >
            <TabIcon view={t.view} />
            <span className="truncate">{title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.id)
                }}
                className="ml-1 text-[var(--color-text-dim)] opacity-0 hover:text-[var(--color-danger)] group-hover:opacity-100"
                aria-label="Close tab"
              >
                <X size={10} />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={onNewTab}
        title="New tab"
        className="ml-1 grid h-5 w-5 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-text-muted)] hover:bg-[var(--grad-btn-hover)] hover:text-[var(--color-text)]"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

function playlistTitleFor(view: View, playlists: Playlist[]): string | undefined {
  if (view.kind !== 'playlist') return undefined
  return playlists.find((p) => p.id === view.id)?.name
}

function TabIcon({ view }: { view: View }): React.JSX.Element {
  switch (view.kind) {
    case 'library':
      return <Library size={10} />
    case 'playlist':
      return <ListMusic size={10} />
    case 'search':
      return <Search size={10} />
    case 'artist':
    case 'uploader':
      return <User size={10} />
    case 'radio':
      return <Radio size={10} />
    case 'room':
      return <MessageSquare size={10} />
  }
}
