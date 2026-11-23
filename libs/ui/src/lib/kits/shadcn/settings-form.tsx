import { useId } from 'react';
import { ProxyIcon } from '@sewer-net/icons';
import { cn } from '@sewer-net/utils';
import type { SettingsFormProps, SettingsPanelProps } from '../../ui-kit';

/**
 * Shared fields of the settings payload, i.e. everything except the container
 * props of `<ShadcnSettingsPanel>` that the screen/dialog destructure first.
 */
export type SettingsFormFields = Omit<
  SettingsPanelProps,
  'open' | 'onClose' | 'settingsLabel' | 'logoutLabel' | 'onLogout' | 'closeAriaLabel'
>;

/**
 * Narrowing helper: forwards only the shared form fields, so container
 * props (`open`, labels, DOM attributes) never leak into the DOM.
 */
export function settingsFormProps(props: SettingsFormFields): SettingsFormProps {
  const {
    appearanceLabel,
    interfaceLabel,
    colorSchemeLabel,
    accentLabel,
    fontLabel,
    radiusLabel,
    resetLabel,
    kitId,
    kitLabel,
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
    locale,
    onLocaleChange,
    localeOptions,
    updates,
    onReset,
  } = props;
  return {
    appearanceLabel,
    interfaceLabel,
    colorSchemeLabel,
    accentLabel,
    fontLabel,
    radiusLabel,
    resetLabel,
    kitId,
    kitLabel,
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
    locale,
    onLocaleChange,
    localeOptions,
    updates,
    onReset,
  };
}

/** Compact-mode minimum tap target for every settings control. */
const CONTROL = 'min-h-11 sn-wide:min-h-8';
const CHOICE = cn(
  CONTROL,
  'flex-1 rounded-[calc(var(--sn-radius)*0.75)] text-xs transition-colors',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sn-accent)]',
);
const CHOICE_ON = 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]';
const CHOICE_OFF =
  'bg-[var(--sn-surface-2)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)]';

/**
 * Appearance form shared by the compact settings screen and the wide dialog.
 *
 * All values are controlled from above (theme store in apps/web): the form
 * never owns or resets settings state, so mounting it in another container
 * cannot change the theme. Only one instance is rendered at a time.
 */
export function ShadcnSettingsForm({
  appearanceLabel,
  interfaceLabel,
  colorSchemeLabel,
  accentLabel,
  fontLabel,
  radiusLabel,
  resetLabel,
  kitId,
  kitLabel,
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
  locale,
  onLocaleChange,
  localeOptions,
  updates,
  onReset,
}: SettingsFormProps) {
  const headingId = useId();
  const radiusId = useId();

  return (
    <div
      role="form"
      aria-labelledby={headingId}
      data-sn-settings-form=""
      className="flex min-h-0 min-w-0 flex-col"
    >
      <h3
        id={headingId}
        className="sr-only"
      >
        {appearanceLabel}
      </h3>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <section className="mb-4">
          <h4 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
            {interfaceLabel}
          </h4>
          <div className="flex flex-col gap-2">
            <div className="flex gap-1">
              <button
                type="button"
                aria-pressed={kitId === 'shadcn'}
                onClick={() => onKitChange('shadcn')}
                className={cn(CHOICE, kitId === 'shadcn' ? CHOICE_ON : CHOICE_OFF)}
              >
                {kitLabel}
              </button>
            </div>
            <div className="flex gap-1">
              {localeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={locale === opt.value}
                  onClick={() => onLocaleChange(opt.value)}
                  className={cn(CHOICE, locale === opt.value ? CHOICE_ON : CHOICE_OFF)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-4">
          <h4 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
            {colorSchemeLabel}
          </h4>
          <div className="flex gap-1">
            {modeOptions.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                onClick={() => onModeChange(m.value)}
                className={cn(CHOICE, mode === m.value ? CHOICE_ON : CHOICE_OFF)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <h4 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
            {accentLabel}
          </h4>
          <div className="flex flex-wrap gap-2">
            {accentPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={accent === preset.value}
                onClick={() => onAccentChange(preset.value)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full border-2 transition-transform sn-wide:h-8 sn-wide:w-8',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sn-accent)]',
                  accent === preset.value
                    ? 'border-[var(--sn-text)]'
                    : 'border-transparent hover:scale-110',
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
          <h4 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">
            {fontLabel}
          </h4>
          <div className="grid grid-cols-2 gap-1">
            {fontOptions.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={font === f.id}
                onClick={() => onFontChange(f.id)}
                className={cn(CHOICE, font === f.id ? CHOICE_ON : CHOICE_OFF)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-3">
          <label
            id={radiusId}
            htmlFor={`${radiusId}-input`}
            className="mb-2 block text-xs font-medium text-[var(--sn-text-muted)]"
          >
            {radiusLabel}
          </label>
          <input
            id={`${radiusId}-input`}
            type="range"
            min={0}
            max={24}
            value={radius}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            className="h-11 w-full accent-[var(--sn-accent)] sn-wide:h-8"
          />
        </section>

        {updates}

        <button
          type="button"
          onClick={onReset}
          className={cn(
            CONTROL,
            'text-xs text-[var(--sn-text-dim)] underline-offset-2 hover:text-[var(--sn-text)] hover:underline',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sn-accent)]',
          )}
        >
          {resetLabel}
        </button>
      </div>
    </div>
  );
}
