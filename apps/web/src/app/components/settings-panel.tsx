import { Trans } from '@lingui/react/macro';
import {
  ACCENT_PRESETS,
  FONT_LABELS,
  useThemeStore,
  type FontId,
  type ThemeMode,
} from '@sewer-net/themes';
import { ProxyIcon } from '@sewer-net/icons';
import { cn } from '@sewer-net/utils';

const MODES: { value: ThemeMode; label: React.ReactNode }[] = [
  { value: 'light', label: <Trans>Light</Trans> },
  { value: 'dark', label: <Trans>Dark</Trans> },
  { value: 'system', label: <Trans>System</Trans> },
];

const FONTS: FontId[] = ['inter', 'system', 'serif', 'mono'];

/**
 * Appearance settings: UI kit, color mode, accent color, font and radius.
 * Values are applied instantly through CSS variables (see libs/themes).
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useThemeStore((state) => state.settings);
  const setKit = useThemeStore((state) => state.setKit);
  const setMode = useThemeStore((state) => state.setMode);
  const setAccent = useThemeStore((state) => state.setAccent);
  const setFont = useThemeStore((state) => state.setFont);
  const setRadius = useThemeStore((state) => state.setRadius);
  const reset = useThemeStore((state) => state.reset);

  return (
    <div className="absolute bottom-16 left-16 z-30 w-72 rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--sn-text)]">
          <Trans>Appearance</Trans>
        </h2>
        <button
          onClick={onClose}
          className="text-[var(--sn-text-dim)] hover:text-[var(--sn-text)]"
        >
          <ProxyIcon name="close" size={16} />
        </button>
      </div>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          <Trans>Interface</Trans>
        </h3>
        <div className="flex gap-1">
          <KitOption kitId="shadcn" label="shadcn/ui" activeKitId={settings.kitId} onSelect={setKit} />
        </div>
      </section>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          <Trans>Color scheme</Trans>
        </h3>
        <div className="flex gap-1">
          {MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setMode(mode.value)}
              className={cn(
                'h-8 flex-1 rounded-[calc(var(--sn-radius)*0.75)] text-xs transition-colors',
                settings.mode === mode.value
                  ? 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
                  : 'bg-[var(--sn-surface-2)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)]',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          <Trans>Accent color</Trans>
        </h3>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              title={preset.label}
              onClick={() => setAccent(preset.value)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
                settings.accent === preset.value
                  ? 'border-[var(--sn-text)]'
                  : 'border-transparent',
              )}
              style={{ background: preset.value }}
            >
              {settings.accent === preset.value ? (
                <ProxyIcon name="check" size={14} className="text-white" />
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          <Trans>Font</Trans>
        </h3>
        <div className="grid grid-cols-2 gap-1">
          {FONTS.map((font) => (
            <button
              key={font}
              onClick={() => setFont(font)}
              className={cn(
                'h-8 rounded-[calc(var(--sn-radius)*0.75)] text-xs transition-colors',
                settings.font === font
                  ? 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
                  : 'bg-[var(--sn-surface-2)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)]',
              )}
            >
              {FONT_LABELS[font]}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-3">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          <Trans>Corner radius</Trans>
        </h3>
        <input
          type="range"
          min={0}
          max={24}
          value={settings.radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-[var(--sn-accent)]"
        />
      </section>

      <button
        onClick={reset}
        className="text-xs text-[var(--sn-text-dim)] underline-offset-2 hover:text-[var(--sn-text)] hover:underline"
      >
        <Trans>Reset to defaults</Trans>
      </button>
    </div>
  );
}

function KitOption({
  kitId,
  label,
  activeKitId,
  onSelect,
}: {
  kitId: string;
  label: string;
  activeKitId: string;
  onSelect: (kitId: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(kitId)}
      className={cn(
        'h-8 flex-1 rounded-[calc(var(--sn-radius)*0.75)] text-xs transition-colors',
        activeKitId === kitId
          ? 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
          : 'bg-[var(--sn-surface-2)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)]',
      )}
    >
      {label}
    </button>
  );
}
