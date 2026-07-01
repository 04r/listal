import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Loader2,
  Volume2,
  VolumeX,
  Mic2,
  Users,
  Radio,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  GripVertical
} from 'lucide-react'
import { usePlayer } from '../stores/player'
import { useConvoy } from '../stores/convoy'
import { useSettings, type ToolbarSlot, type Zone } from '../stores/settings'

export interface TransportZoneProps {
  zone: Zone
  orientation: 'horizontal' | 'vertical'
  lyricsOpen: boolean
  onToggleLyrics: () => void
  friendsOpen: boolean
  onToggleFriends: () => void
  convoyOpen: boolean
  onToggleConvoy: () => void
  queueOpen: boolean
  onToggleQueue: () => void
}

// Renders whichever slots the user has assigned to this zone, in the order
// they've set. In customize mode, slots can be dragged between zones — the
// receiving zone's SlotWrapper (or an end-of-zone drop target) handles the
// re-parenting via settings.moveSlot.
export function TransportZone(props: TransportZoneProps): React.JSX.Element | null {
  const contents = useSettings((s) => s.zoneContents[props.zone])
  const editing = useSettings((s) => s.customizeMode)
  const moveSlot = useSettings((s) => s.moveSlot)
  const slots = useSlotContent(props)

  if (contents.length === 0 && !editing) return null

  const vertical = props.orientation === 'vertical'
  const containerClass = vertical
    ? 'flex flex-col items-stretch gap-1 border-l border-r border-[var(--color-border)] bg-[var(--grad-transport)] px-1 py-2 w-[64px] shrink-0'
    : 'flex h-9 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-transport)] px-2'

  return (
    <div className={containerClass}>
      {editing && vertical && (
        <ZoneLabel>{props.zone.toUpperCase()}</ZoneLabel>
      )}
      {editing && !vertical && contents.length === 0 && (
        <span className="mx-2 text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          empty · drop here
        </span>
      )}
      {contents.map((slot) => (
        <SlotWrapper
          key={slot}
          slot={slot}
          zone={props.zone}
          orientation={props.orientation}
          editing={editing}
          onDrop={(from) => moveSlot(from, props.zone, slot)}
        >
          {slots[slot]}
        </SlotWrapper>
      ))}
      {editing && (
        // Trailing drop target so you can drop a slot at the end of the zone.
        <div
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }}
          onDrop={(e) => {
            e.preventDefault()
            const from = e.dataTransfer.getData('text/x-listal-slot') as ToolbarSlot
            if (from) moveSlot(from, props.zone, null)
          }}
          className={
            vertical
              ? 'flex h-6 items-center justify-center rounded-sm border border-dashed border-[var(--color-accent)]/60 text-[9px] uppercase text-[var(--color-accent)]/70'
              : 'flex h-6 items-center justify-center rounded-sm border border-dashed border-[var(--color-accent)]/60 px-2 text-[9px] uppercase text-[var(--color-accent)]/70'
          }
        >
          +
        </div>
      )}
    </div>
  )
}

function ZoneLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="pb-1 text-center text-[9px] font-bold uppercase tracking-widest text-[var(--color-accent)]">
      {children}
    </span>
  )
}

function SlotWrapper({
  slot,
  zone,
  orientation,
  editing,
  onDrop,
  children
}: {
  slot: ToolbarSlot
  zone: Zone
  orientation: 'horizontal' | 'vertical'
  editing: boolean
  onDrop: (from: ToolbarSlot) => void
  children: React.ReactNode
}): React.JSX.Element {
  const vertical = orientation === 'vertical'
  const grows = slot === 'timeline' && !vertical
  return (
    <div
      draggable={editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-listal-slot', slot)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (!editing) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        if (!editing) return
        e.preventDefault()
        const from = e.dataTransfer.getData('text/x-listal-slot') as ToolbarSlot
        if (!from || from === slot) return
        onDrop(from)
      }}
      title={editing ? `${slot} · ${zone}` : undefined}
      className={`flex ${vertical ? 'flex-col' : 'flex-row'} items-center gap-1 ${
        grows ? 'flex-1' : ''
      } ${
        editing
          ? 'cursor-grab rounded-sm border border-dashed border-[var(--color-accent)] px-1 py-0.5 active:cursor-grabbing'
          : ''
      }`}
    >
      {editing && (
        <GripVertical
          size={11}
          className="shrink-0 text-[var(--color-accent)] opacity-70"
        />
      )}
      {children}
    </div>
  )
}

// Slot bodies. Same visual content regardless of zone — layout (vertical vs
// horizontal) is controlled by the parent zone.
function useSlotContent(props: TransportZoneProps): Record<ToolbarSlot, React.ReactNode> {
  const {
    lyricsOpen,
    onToggleLyrics,
    friendsOpen,
    onToggleFriends,
    convoyOpen,
    onToggleConvoy,
    queueOpen,
    onToggleQueue,
    orientation
  } = props
  const vertical = orientation === 'vertical'
  const convoyActive = useConvoy((s) => !!s.session)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const toggleShuffle = usePlayer((s) => s.toggleShuffle)
  const cycleRepeat = usePlayer((s) => s.cycleRepeat)
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.loading)
  const durationSec = usePlayer((s) => s.durationSec)
  const positionSec = usePlayer((s) => s.positionSec)
  const volume = usePlayer((s) => s.volume)
  const toggle = usePlayer((s) => s.toggle)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seekTo = usePlayer((s) => s.seekTo)
  const setVolume = usePlayer((s) => s.setVolume)
  const toggleMute = usePlayer((s) => s.toggleMute)

  const canPlay = index >= 0 && index < queue.length
  const hasNext = index >= 0 && index + 1 < queue.length
  const hasPrev = index > 0

  const flow = vertical ? 'flex flex-col gap-1' : 'flex items-center gap-1'
  const btn =
    'grid h-6 w-7 place-items-center border border-[var(--color-border-strong)]'

  return {
    transport: (
      <div className={flow}>
        <TbButton title="Stop" onClick={() => seekTo(0)} disabled={!canPlay}>
          <Square size={11} fill="currentColor" />
        </TbButton>
        <TbButton
          title={playing ? 'Pause' : 'Play'}
          onClick={toggle}
          disabled={!canPlay}
        >
          {loading ? (
            <Loader2 size={11} className="animate-spin" />
          ) : playing ? (
            <Pause size={11} fill="currentColor" />
          ) : (
            <Play size={11} fill="currentColor" className="translate-x-[1px]" />
          )}
        </TbButton>
        <TbButton title="Previous" onClick={() => void prev()} disabled={!hasPrev}>
          <SkipBack size={11} fill="currentColor" />
        </TbButton>
        <TbButton title="Next" onClick={() => void next()} disabled={!hasNext}>
          <SkipForward size={11} fill="currentColor" />
        </TbButton>
      </div>
    ),
    'shuffle-repeat': (
      <div className={flow}>
        <button
          onClick={toggleShuffle}
          title={shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          className={`${btn} ${
            shuffle
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
          }`}
        >
          <Shuffle size={11} />
        </button>
        <button
          onClick={cycleRepeat}
          title={
            repeat === 'off'
              ? 'Repeat: off'
              : repeat === 'all'
                ? 'Repeat: all'
                : 'Repeat: one'
          }
          className={`${btn} ${
            repeat !== 'off'
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
          }`}
        >
          {repeat === 'one' ? <Repeat1 size={11} /> : <Repeat size={11} />}
        </button>
      </div>
    ),
    volume: (
      <div className={flow}>
        <button
          onClick={toggleMute}
          className="grid h-6 w-6 place-items-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          aria-label={volume === 0 ? 'Unmute' : 'Mute'}
          title={volume === 0 ? 'Unmute' : 'Mute'}
        >
          {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className={vertical ? 'w-full' : 'w-24'}
        />
      </div>
    ),
    timeline: vertical ? (
      <div className="flex w-full flex-col items-center gap-1">
        <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {fmt(positionSec)}
        </span>
        <input
          type="range"
          min={0}
          max={durationSec || 1}
          step={0.1}
          value={positionSec}
          disabled={!canPlay || durationSec <= 0}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="w-full"
        />
        <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {fmt(durationSec)}
        </span>
      </div>
    ) : (
      <div className="flex flex-1 items-center gap-2">
        <span className="w-9 text-right text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {fmt(positionSec)}
        </span>
        <input
          type="range"
          min={0}
          max={durationSec || 1}
          step={0.1}
          value={positionSec}
          disabled={!canPlay || durationSec <= 0}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-9 text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {fmt(durationSec)}
        </span>
      </div>
    ),
    'panel-toggles': (
      <div className={flow}>
        <button
          onClick={onToggleQueue}
          title="Queue"
          className={`${btn} ${
            queueOpen
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
          }`}
        >
          <ListMusic size={11} />
        </button>
        <button
          onClick={onToggleLyrics}
          title="Lyrics"
          className={`${btn} ${
            lyricsOpen
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
          }`}
        >
          <Mic2 size={11} />
        </button>
        <button
          onClick={onToggleFriends}
          title="Friends"
          className={`${btn} ${
            friendsOpen
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
          }`}
        >
          <Users size={11} />
        </button>
        <button
          onClick={onToggleConvoy}
          title={convoyActive ? 'Convoy (active)' : 'Convoy'}
          className={`relative ${btn} ${
            convoyOpen
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
          }`}
        >
          <Radio size={11} />
          {convoyActive && !convoyOpen && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" />
          )}
        </button>
      </div>
    )
  }
}

function TbButton({
  children,
  onClick,
  title,
  disabled
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid h-6 w-7 place-items-center border border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)] active:bg-[var(--color-surface-3)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
