import { PictureInPicture, PictureInPicture2, X } from 'lucide-react'
import { usePanelMode, type PanelKey } from '../stores/panelMode'

interface Props {
  panelKey: PanelKey
  onClose: () => void
  icon?: React.ReactNode
  label: string
  meta?: React.ReactNode
  variant?: 'dock' | 'float'
  extra?: React.ReactNode // extra buttons before pop-out
}

// Shared header for stacked/docked panels. Provides a pop-out button that
// swaps the panel into a FloatingWindow, plus a close button. Panels that
// need extra chrome pass it via `extra`.
export function PanelHeader({
  panelKey,
  onClose,
  icon,
  label,
  meta,
  variant = 'dock',
  extra
}: Props): React.JSX.Element {
  const setMode = usePanelMode((s) => s.set)
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]">
      {icon}
      <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {meta}
      <span className="ml-auto flex items-center gap-1" data-nodrag>
        {extra}
        {variant === 'dock' ? (
          <button
            onClick={() => setMode(panelKey, 'float')}
            title="Pop out"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <PictureInPicture size={12} />
          </button>
        ) : (
          <button
            onClick={() => setMode(panelKey, 'dock')}
            title="Dock"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <PictureInPicture2 size={12} />
          </button>
        )}
        <button
          onClick={onClose}
          title="Close"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X size={12} />
        </button>
      </span>
    </div>
  )
}
