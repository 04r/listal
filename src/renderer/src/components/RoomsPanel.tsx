import { useEffect, useState } from 'react'
import { MessagesSquare, Plus, Compass, Hash, Loader2 } from 'lucide-react'
import { PanelShell } from './PanelShell'
import { useRooms, type Room } from '../stores/rooms'
import { useLibrary } from '../stores/library'
import { useAuth } from '../stores/auth'

interface Props {
  onClose: () => void
}

export function RoomsPanel({ onClose }: Props): React.JSX.Element {
  const joined = useRooms((s) => s.joined)
  const browsed = useRooms((s) => s.browsed)
  const loading = useRooms((s) => s.loading)
  const error = useRooms((s) => s.error)
  const me = useAuth((s) => s.profile)
  const setView = useLibrary((s) => s.setView)
  const [tab, setTab] = useState<'joined' | 'browse'>('joined')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newVisibility, setNewVisibility] = useState<'public' | 'friends' | 'private'>('public')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Load public rooms lazily when the user flips to Browse.
  useEffect(() => {
    if (tab === 'browse' && browsed.length === 0) {
      void useRooms.getState().browsePublic()
    }
  }, [tab, browsed.length])

  function openRoom(room: Room): void {
    setView({ kind: 'room', roomId: room.id })
    onClose()
  }

  async function joinAndOpen(room: Room): Promise<void> {
    const res = await useRooms.getState().joinRoom(room.id)
    if (res.ok) openRoom(room)
  }

  async function createRoom(): Promise<void> {
    setBusy(true)
    setCreateError(null)
    const res = await useRooms
      .getState()
      .createRoom(newName, newDesc.trim() || undefined, newVisibility)
    setBusy(false)
    if (!res.ok) {
      setCreateError(res.error)
      return
    }
    setCreating(false)
    setNewName('')
    setNewDesc('')
    openRoom(res.room)
  }

  const joinedIds = new Set(joined.map((r) => r.id))

  return (
    <PanelShell
      panelKey="rooms"
      onClose={onClose}
      icon={<MessagesSquare size={11} />}
      label="Rooms"
      floatDefault={{ x: 120, y: 100, w: 320, h: 500 }}
    >
      <div className="flex border-b border-[var(--color-border)] bg-[var(--grad-transport)] text-[11px]">
        <TabBtn active={tab === 'joined'} onClick={() => setTab('joined')}>
          Joined · {joined.length}
        </TabBtn>
        <TabBtn active={tab === 'browse'} onClick={() => setTab('browse')}>
          <Compass size={10} className="mr-1 inline" />
          Browse
        </TabBtn>
      </div>

      {error && (
        <div className="border-b border-[var(--color-border)] bg-red-500/10 px-2 py-1 text-[10.5px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'joined' && (
          <>
            {loading && (
              <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-[var(--color-text-muted)]">
                <Loader2 size={11} className="animate-spin" />
                Loading rooms…
              </div>
            )}
            {!loading && joined.length === 0 && (
              <div className="px-2 py-2 text-[10.5px] text-[var(--color-text-dim)]">
                Not in any rooms. Browse public rooms or create one.
              </div>
            )}
            {joined.map((r) => (
              <RoomRow
                key={r.id}
                room={r}
                isMine={r.owner_id === me?.id}
                onOpen={() => openRoom(r)}
              />
            ))}
          </>
        )}

        {tab === 'browse' && (
          <>
            {browsed.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-[var(--color-text-muted)]">
                <Loader2 size={11} className="animate-spin" />
                Looking for public rooms…
              </div>
            )}
            {browsed.map((r) => {
              const already = joinedIds.has(r.id)
              return (
                <RoomRow
                  key={r.id}
                  room={r}
                  isMine={r.owner_id === me?.id}
                  onOpen={() => (already ? openRoom(r) : void joinAndOpen(r))}
                  cta={already ? 'Open' : 'Join'}
                />
              )
            })}
          </>
        )}
      </div>

      {/* Create room */}
      <div className="border-t border-[var(--color-border)] bg-[var(--grad-header)] p-2 text-[11px]">
        {creating ? (
          <div className="space-y-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="room-name"
              maxLength={40}
              className="h-6 w-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[11.5px] outline-none focus:border-[var(--color-accent)]"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="description (optional)"
              maxLength={140}
              className="h-6 w-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[11.5px] outline-none focus:border-[var(--color-accent)]"
            />
            <select
              value={newVisibility}
              onChange={(e) =>
                setNewVisibility(e.target.value as 'public' | 'friends' | 'private')
              }
              className="h-6 w-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-1 text-[11.5px]"
            >
              <option value="public">Public — anyone can find + join</option>
              <option value="friends">Friends only — only your friends see it</option>
              <option value="private">Private — invite only</option>
            </select>
            {createError && <div className="text-[10.5px] text-[var(--color-danger)]">{createError}</div>}
            <div className="flex justify-end gap-1">
              <button
                onClick={() => {
                  setCreating(false)
                  setCreateError(null)
                }}
                className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 hover:bg-[var(--grad-btn-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => void createRoom()}
                disabled={busy || !newName.trim()}
                className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-primary)] px-2 py-0.5 font-semibold text-white hover:bg-[var(--grad-primary-hover)] disabled:opacity-40"
              >
                {busy && <Loader2 size={10} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-btn)] py-1 text-[11.5px] hover:bg-[var(--grad-btn-hover)]"
          >
            <Plus size={11} />
            New room
          </button>
        )}
      </div>
    </PanelShell>
  )
}

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-r border-[var(--color-border)] px-3 py-1.5 text-left ${
        active
          ? 'bg-[var(--color-shell)] font-semibold text-[var(--color-text)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)]'
      }`}
    >
      {children}
    </button>
  )
}

function RoomRow({
  room,
  isMine,
  onOpen,
  cta = 'Open'
}: {
  room: Room
  isMine: boolean
  onOpen: () => void
  cta?: string
}): React.JSX.Element {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-2 border-b border-[var(--color-border)]/40 px-2 py-1 text-left text-[11.5px] hover:bg-[var(--color-surface-3)]"
    >
      <Hash size={11} className="shrink-0 text-[var(--color-text-muted)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {room.name}
          {isMine && (
            <span className="ml-1 text-[9px] uppercase tracking-wider text-[var(--color-accent)]">
              owner
            </span>
          )}
        </div>
        {room.description && (
          <div className="truncate text-[10px] text-[var(--color-text-muted)]">
            {room.description}
          </div>
        )}
      </div>
      <span className="opacity-0 group-hover:opacity-100 text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
        {cta}
      </span>
    </button>
  )
}
