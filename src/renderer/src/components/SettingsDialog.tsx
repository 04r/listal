import { useEffect, useState } from 'react'
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
  const discordRpc = useSettings((s) => s.discordRpc)
  const setDiscordRpc = useSettings((s) => s.setDiscordRpc)
  const discordDetailsTemplate = useSettings((s) => s.discordDetailsTemplate)
  const setDiscordDetailsTemplate = useSettings((s) => s.setDiscordDetailsTemplate)
  const discordStateTemplate = useSettings((s) => s.discordStateTemplate)
  const setDiscordStateTemplate = useSettings((s) => s.setDiscordStateTemplate)
  const crossfadeSec = useSettings((s) => s.crossfadeSec)
  const setCrossfadeSec = useSettings((s) => s.setCrossfadeSec)
  const audioOutputDeviceId = useSettings((s) => s.audioOutputDeviceId)
  const setAudioOutputDeviceId = useSettings((s) => s.setAudioOutputDeviceId)
  const compactVisualizer = useSettings((s) => s.compactVisualizer)
  const setCompactVisualizer = useSettings((s) => s.setCompactVisualizer)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const resetAll = useSettings((s) => s.resetAll)

  useEffect(() => {
    async function loadDevices(): Promise<void> {
      try {
        // Some browsers hide device labels until getUserMedia has been called.
        // Best-effort — we don't need mic access, just labels.
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => s.getTracks().forEach((t) => t.stop()))
          .catch(() => {})
        const list = await navigator.mediaDevices.enumerateDevices()
        setAudioDevices(list.filter((d) => d.kind === 'audiooutput'))
      } catch {
        /* ignore */
      }
    }
    void loadDevices()
  }, [])
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

        {/* Playback */}
        <Section title="Playback">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[12px]">
              <span className="w-32 shrink-0">Crossfade</span>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={crossfadeSec}
                onChange={(e) => setCrossfadeSec(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-14 text-right tabular-nums">
                {crossfadeSec === 0 ? 'off' : `${crossfadeSec}s`}
              </span>
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <span className="w-32 shrink-0">Audio output</span>
              <select
                value={audioOutputDeviceId}
                onChange={(e) => setAudioOutputDeviceId(e.target.value)}
                className="h-6 flex-1 border border-[var(--color-border-strong)] bg-[var(--color-input)] px-1 text-[11.5px]"
              >
                <option value="">System default</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Device ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={compactVisualizer}
                onChange={(e) => setCompactVisualizer(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span>Show mini visualizer next to the timeline</span>
            </label>
          </div>
        </Section>

        {/* Integrations */}
        <Section title="Integrations">
          <label className="flex cursor-pointer items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={discordRpc}
              onChange={(e) => setDiscordRpc(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span>Show now-playing on Discord (Rich Presence)</span>
          </label>
          <div className="mt-1 text-[10.5px] text-[var(--color-text-dim)]">
            Off means Listal won't send anything to Discord. Discord doesn't
            need to be running either way.
          </div>
          {discordRpc && (
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[12px]">
                <span className="w-32 shrink-0">Title line</span>
                <input
                  value={discordDetailsTemplate}
                  onChange={(e) => setDiscordDetailsTemplate(e.target.value)}
                  className="h-6 flex-1 border border-[var(--color-border-strong)] bg-[var(--color-input)] px-1.5 text-[11.5px]"
                />
              </label>
              <label className="flex items-center gap-2 text-[12px]">
                <span className="w-32 shrink-0">Second line</span>
                <input
                  value={discordStateTemplate}
                  onChange={(e) => setDiscordStateTemplate(e.target.value)}
                  className="h-6 flex-1 border border-[var(--color-border-strong)] bg-[var(--color-input)] px-1.5 text-[11.5px]"
                />
              </label>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                Tokens: <code>{'{title}'}</code>, <code>{'{artist}'}</code>,{' '}
                <code>{'{service}'}</code>. Example: 🎧 {'{title}'} — {'{artist}'}
              </div>
            </div>
          )}
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

