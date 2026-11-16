import { ProxyKitOption } from '../../proxy/index';
import { ProxyIcon } from '@sewer-net/icons';
import { cn } from '@sewer-net/utils';
import type { SettingsPanelProps } from '../../ui-kit';

export function ShadcnSettingsPanel({
  onClose,
  closeAriaLabel,
  appearanceLabel,
  interfaceLabel,
  colorSchemeLabel,
  accentLabel,
  fontLabel,
  radiusLabel,
  resetLabel,
  kitLabel,
  kitId,
  onKitChange,
  mode,
  onModeChange,
  modeOptions,
  accent,
  onAccentChange,
  accentPresets,
  font,
  onFontChange,
  fontOptions,
  radius,
  onRadiusChange,
  onReset,
  className,
  ...props
}: SettingsPanelProps) {
  return (
    <div
      {...props}
      className={cn(
        'absolute bottom-16 left-16 z-30 w-72 rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-4 shadow-xl',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--sn-text)]">
          {appearanceLabel}
        </h2>
        <button onClick={onClose} className="text-[var(--sn-text-dim)] hover:text-[var(--sn-text)]" aria-label={closeAriaLabel}>
          <ProxyIcon name="close" size={16} />
        </button>
      </div>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          {interfaceLabel}
        </h3>
        <div className="flex gap-1">
          <ProxyKitOption
            kitId="shadcn"
            label={kitLabel}
            active={kitId === 'shadcn'}
            onSelect={onKitChange}
          />
        </div>
      </section>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          {colorSchemeLabel}
        </h3>
        <div className="flex gap-1">
          {modeOptions.map((m) => (
            <button
              key={m.value}
              onClick={() => onModeChange(m.value)}
              className={cn(
                'h-8 flex-1 rounded-[calc(var(--sn-radius)*0.75)] text-xs transition-colors',
                mode === m.value
                  ? 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
                  : 'bg-[var(--sn-surface-2)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)]',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          {accentLabel}
        </h3>
        <div className="flex flex-wrap gap-2">
          {accentPresets.map((preset) => (
            <button
              key={preset.id}
              title={preset.label}
              onClick={() => onAccentChange(preset.value)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
                accent === preset.value
                  ? 'border-[var(--sn-text)]'
                  : 'border-transparent',
              )}
              style={{ background: preset.value }}
            >
              {accent === preset.value ? (
                <ProxyIcon name="check" size={14} className="text-white" />
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          {fontLabel}
        </h3>
        <div className="grid grid-cols-2 gap-1">
          {fontOptions.map((f) => (
            <button
              key={f.id}
              onClick={() => onFontChange(f.id)}
              className={cn(
                'h-8 rounded-[calc(var(--sn-radius)*0.75)] text-xs transition-colors',
                font === f.id
                  ? 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
                  : 'bg-[var(--sn-surface-2)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-3">
        <h3 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
          {radiusLabel}
        </h3>
        <input
          type="range"
          min={0}
          max={24}
          value={radius}
          onChange={(e) => onRadiusChange(Number((e.target as HTMLInputElement).value))}
          className="w-full accent-[var(--sn-accent)]"
        />
      </section>

      <button
        onClick={onReset}
        className="text-xs text-[var(--sn-text-dim)] underline-offset-2 hover:text-[var(--sn-text)] hover:underline"
      >
        {resetLabel}
      </button>
    </div>
  );
}

