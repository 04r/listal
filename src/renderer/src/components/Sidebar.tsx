import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { Playlist } from '../../../preload'
import { useLibrary } from '../stores/library'

// foobar2000's left pane is a tree: a heading per group, expandable, plain
// rows below. Approximating that without the actual album/artist tree (we
// don't yet have a local-file model) — show Library and Playlists.
// Service auth (Spotify etc.) lives in the menubar's Account → Services
// submenu.
export function Sidebar(): React.JSX.Element {
  const { view, setView, version, bump } = useLibrary()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [openLib, setOpenLib] = useState(true)
  const [openPl, setOpenPl] = useState(true)

  useEffect(() => {
    window.api.listPlaylists().then(setPlaylists)
  }, [version])

  async function createNew(): Promise<void> {
    const name = newName.trim()
    if (!name) {
      setCreating(false)
      return
    }
    const p = await window.api.createPlaylist(name)
    setNewName('')
    setCreating(false)
    bump()
    setView({ kind: 'playlist', id: p.id })
  }

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-shell)] text-[12px]">
      <TreeGroup
        label="Library"
        open={openLib}
        onToggle={() => setOpenLib((o) => !o)}
      >
        <TreeRow
          label="All tracks"
          active={view.kind === 'library'}
          onClick={() => setView({ kind: 'library' })}
        />
        <TreeRow
          label="Search…"
          active={view.kind === 'search'}
          onClick={() => setView({ kind: 'search' })}
        />
      </TreeGroup>

      <TreeGroup
        label="Playlists"
        open={openPl}
        onToggle={() => setOpenPl((o) => !o)}
        action={
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCreating(true)
            }}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="New playlist"
          >
            <Plus size={11} />
          </button>
        }
      >
        {creating && (
          <div className="px-2 py-0.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={createNew}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createNew()
                else if (e.key === 'Escape') {
                  setNewName('')
                  setCreating(false)
                }
              }}
              placeholder="Name…"
              className="h-5 w-full border border-[var(--color-border-strong)] bg-[var(--color-input)] px-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        )}
        {playlists.length === 0 && !creating && (
          <div className="px-6 py-1 text-[11px] text-[var(--color-text-dim)]">
            (none)
          </div>
        )}
        {playlists.map((p) => (
          <TreeRow
            key={p.id}
            label={p.name}
            count={p.trackCount}
            active={view.kind === 'playlist' && view.id === p.id}
            onClick={() => setView({ kind: 'playlist', id: p.id })}
          />
        ))}
      </TreeGroup>

    </aside>
  )
}

function TreeGroup({
  label,
  open,
  onToggle,
  action,
  children
}: {
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="flex w-full items-center gap-1 bg-[var(--grad-header)] px-1.5 py-0.5 font-semibold uppercase text-[10.5px] tracking-wider text-[var(--color-text-muted)]">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-1 text-left hover:text-[var(--color-text)]"
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="flex-1">{label}</span>
        </button>
        {action}
      </div>
      {open && <div className="py-0.5">{children}</div>}
    </div>
  )
}

function TreeRow({
  label,
  count,
  active,
  onClick
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-6 py-0.5 text-left ${
        active
          ? 'bg-[var(--color-row-current)] text-[var(--color-row-current-fg)]'
          : 'text-[var(--color-text)] hover:bg-[var(--color-surface-3)]'
      }`}
    >
      <span className="truncate">{label}</span>
      {count != null && (
        <span
          className={`ml-2 shrink-0 text-[10.5px] ${
            active ? 'text-white/80' : 'text-[var(--color-text-dim)]'
          }`}
        >
          ({count})
        </span>
      )}
    </button>
  )
}
