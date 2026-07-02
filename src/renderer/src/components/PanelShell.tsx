import { usePanelMode, type PanelKey } from '../stores/panelMode'
import { FloatingWindow } from './FloatingWindow'
import { PanelHeader } from './PanelHeader'

interface Props {
  panelKey: PanelKey
  onClose: () => void
  icon?: React.ReactNode
  label: string
  meta?: React.ReactNode
  floatDefault: { x: number; y: number; w: number; h: number }
  minW?: number
  minH?: number
  headerExtra?: React.ReactNode
  children: React.ReactNode
}

// Wraps a panel with the shared dock/float behavior. Docked panels return a
// full-width section that fills its parent flex slot. Floated panels wrap
// their content in a FloatingWindow so the user can drag + resize.
export function PanelShell({
  panelKey,
  onClose,
  icon,
  label,
  meta,
  floatDefault,
  minW = 240,
  minH = 200,
  headerExtra,
  children
}: Props): React.JSX.Element {
  const mode = usePanelMode((s) => s.modes[panelKey])
  const setMode = usePanelMode((s) => s.set)

  if (mode === 'float') {
    return (
      <FloatingWindow
        name={`panel-${panelKey}`}
        defaultRect={floatDefault}
        minW={minW}
        minH={minH}
        onClose={onClose}
        title={
          <>
            {icon}
            <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {label}
            </span>
            {meta}
            <button
              data-nodrag
              onClick={() => setMode(panelKey, 'dock')}
              title="Dock"
              className="ml-auto mr-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              ⇱
            </button>
          </>
        }
      >
        <div className="flex h-full min-h-0 flex-col">{children}</div>
      </FloatingWindow>
    )
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-[var(--color-shell)]">
      <PanelHeader
        panelKey={panelKey}
        onClose={onClose}
        icon={icon}
        label={label}
        meta={meta}
        extra={headerExtra}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  )
}
