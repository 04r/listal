import { useState } from 'react'
import { X, Settings as SettingsIcon, RotateCcw } from 'lucide-react'
import { useSettings, type PanelKey } from '../stores/settings'

interface Props {
  onClose: () => void
}

const PANELS: Array<{ key: PanelKey; label: string }> = [
  { key: 'friends', label: 'Friends' },
  { key: 'convoy', label: 'Convoy' },
  { key: 'queue', label: 'Queue' },
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'chat', label: 'Chat' },
  { key: 'rooms', label: 'Rooms' }
]

const ACCENT_PRESETS = [
  '#1c5fa9', // foobar blue
  '#c43d3d', // red
  '#4a934a', // green
  '#c47a1c', // amber
  '#8a4dc4', // purple
  '#1c9a9a', // teal
  '#c41c8a', // pink
  '#4a4a4a'  // graphite
]

export function SettingsDialog({ onClose }: Props): React.JSX.Element {
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const panelSides = useSettings((s) => s.panelSides)
  const customizeMode = useSettings((s) => s.customizeMode)
  const setTheme = useSettings((s) => s.setTheme)
  const setAccent = useSettings((s) => s.setAccent)
  const setPanelSide = useSettings((s) => s.setPanelSide)
  const setCustomizeMode = useSettings((s) => s.setCustomizeMode)
  const setZoneContents = useSettings((s) => s.setZoneContents)
  const resetAll = useSettings((s) => s.resetAll)
  const [customAccent, setCustomAccent] = useState(accent)

  function applyCustomAccent(): void {
    if (/^#[0-9a-fA-F]{6}$/.test(customAccent)) setAccent(customAccent)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-h-[85vh] overflow-y-auto border border-[var(--color-border-strong)] bg-[var(--color-shell)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-7 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--grad-header)] px-2 text-[11px]">
          <SettingsIcon size={11} />
          <span className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Settings
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={12} />
          </button>
        </div>

        {/* Theme */}
        <Section title="Theme">
          <div className="flex gap-2">
            <ThemeButton
              active={theme === 'light'}
              onClick={() => setTheme('light')}
              label="Light"
              swatch="#ececec"
              text="#000000"
            />
            <ThemeButton
              active={theme === 'dark'}
              onClick={() => setTheme('dark')}
              label="Dark"
              swatch="#1c1c1c"
              text="#eaeaea"
            />
          </div>
        </Section>

        {/* Accent */}
        <Section title="Accent colour">
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setAccent(c)
                  setCustomAccent(c)
                }}
                title={c}
                className={`h-7 w-7 border ${
                  accent.toLowerCase() === c.toLowerCase()
                    ? 'border-white outline outline-2 outline-[var(--color-border-strong)]'
                    : 'border-[var(--color-border-strong)]'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[11px] text-[var(--color-text-muted)]">Custom</label>
            <input
              type="color"
              value={customAccent}
              onChange={(e) => setCustomAccent(e.target.value)}
              onBlur={applyCustomAccent}
              className="h-6 w-10 border border-[var(--color-border-strong)] p-0"
            />
            <input
              type="text"
              value={customAccent}
              onChange={(e) => setCustomAccent(e.target.value)}
              onBlur={applyCustomAccent}
              maxLength={7}
              className="h-6 w-20 border border-[var(--color-border-strong)] px-1 font-mono text-[11px]"
            />
            <button
              onClick={applyCustomAccent}
              className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 text-[11px] hover:bg-[var(--grad-btn-hover)]"
            >
              Apply
            </button>
          </div>
        </Section>

        {/* Panel positions */}
        <Section title="Panel positions">
          <div className="space-y-1">
            {PANELS.map((p) => (
              <div key={p.key} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-16 text-[var(--color-text-muted)]">{p.label}</span>
                <SideBtn
                  active={panelSides[p.key] === 'left'}
                  onClick={() => setPanelSide(p.key, 'left')}
                >
                  Left
                </SideBtn>
                <SideBtn
                  active={panelSides[p.key] === 'right'}
                  onClick={() => setPanelSide(p.key, 'right')}
                >
                  Right
                </SideBtn>
                <SideBtn
                  active={panelSides[p.key] === 'hidden'}
                  onClick={() => setPanelSide(p.key, 'hidden')}
                >
                  Hidden
                </SideBtn>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-[var(--color-text-dim)]">
            Changes apply as you click. Hidden means the panel's toolbar button won't open it.
          </p>
        </Section>

        {/* Customize UI */}
        <Section title="Customize UI">
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={customizeMode}
              onChange={(e) => setCustomizeMode(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span>Drag-to-reorder in the transport row</span>
          </label>
          <p className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">
            When on, transport blocks (play controls, shuffle/repeat, volume,
            timeline, panel buttons) show a grab handle. Drag them left or
            right to move. Resets on next launch.
          </p>
          <div className="mt-2">
            <button
              onClick={() =>
                setZoneContents({
                  top: [
                    'transport',
                    'shuffle-repeat',
                    'volume',
                    'timeline',
                    'panel-toggles'
                  ],
                  bottom: [],
                  left: [],
                  right: []
                })
              }
              className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-2 py-0.5 text-[11px] hover:bg-[var(--grad-btn-hover)]"
            >
              Reset transport layout
            </button>
          </div>
        </Section>

        {/* Reset */}
        <div className="flex justify-between border-t border-[var(--color-border)] bg-[var(--grad-header)] px-3 py-2">
          <button
            onClick={() => {
              if (confirm('Reset all Listal settings to defaults?')) resetAll()
            }}
            className="flex items-center gap-1 border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 py-1 text-[11.5px] text-[var(--color-danger)] hover:bg-[var(--grad-btn-hover)]"
          >
            <RotateCcw size={10} />
            Reset to defaults
          </button>
          <button
            onClick={onClose}
            className="border border-[var(--color-border-strong)] bg-[var(--grad-btn)] px-3 py-1 text-[11.5px] hover:bg-[var(--grad-btn-hover)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--grad-transport)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  )
}

function ThemeButton({
  active,
  onClick,
  label,
  swatch,
  text
}: {
  active: boolean
  onClick: () => void
  label: string
  swatch: string
  text: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border px-3 py-2 text-[12px] ${
        active
          ? 'border-[var(--color-accent)] outline outline-1 outline-[var(--color-accent)]'
          : 'border-[var(--color-border-strong)]'
      }`}
    >
      <span
        className="h-6 w-6 border border-[var(--color-border-strong)]"
        style={{ background: swatch, color: text }}
      >
        <span className="block text-center text-[10px] font-bold" style={{ color: text }}>
          Aa
        </span>
      </span>
      {label}
    </button>
  )
}

function SideBtn({
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
      className={`border px-2 py-0.5 text-[11px] ${
        active
          ? 'border-[var(--color-border-strong)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
          : 'border-[var(--color-border-strong)] bg-[var(--grad-btn)] text-[var(--color-text)] hover:bg-[var(--grad-btn-hover)]'
      }`}
    >
      {children}
    </button>
  )
}

