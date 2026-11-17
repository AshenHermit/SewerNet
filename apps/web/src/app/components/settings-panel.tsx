import { useLingui } from '@lingui/react/macro';
import {
  ACCENT_PRESETS,
  FONT_LABELS,
  useThemeStore,
  type FontId,
  type ThemeMode,
} from '@sewer-net/themes';
import { ProxySettingsPanel } from '@sewer-net/ui';
import { SUPPORTED_LOCALES, type AppLocale } from '@sewer-net/types';
import { activateLocale } from '../../i18n';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const FONTS: FontId[] = ['inter', 'system', 'serif', 'mono'];
const LOCALES: { value: AppLocale; label: string }[] = Object.entries(
  SUPPORTED_LOCALES,
).map(([value, label]) => ({ value: value as AppLocale, label: String(label) }));

async function switchLocale(locale: AppLocale): Promise<void> {
  await activateLocale(locale);
}

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
  const { i18n, t } = useLingui();

  const modeLabels: Record<ThemeMode, string> = {
    light: t`Light`,
    dark: t`Dark`,
    system: t`System`,
  };

  return (
    <ProxySettingsPanel
      onClose={onClose}
      closeAriaLabel={t`Close`}
      appearanceLabel={t`Appearance`}
      interfaceLabel={t`Interface`}
      colorSchemeLabel={t`Color scheme`}
      accentLabel={t`Accent color`}
      fontLabel={t`Font`}
      radiusLabel={t`Corner radius`}
      resetLabel={t`Reset to defaults`}
      kitId={settings.kitId}
      kitLabel={t`UI kit`}
      onKitChange={setKit}
      mode={settings.mode}
      onModeChange={setMode}
      modeOptions={MODES.map((m) => ({ value: m.value, label: modeLabels[m.value] }))}
      accent={settings.accent}
      onAccentChange={setAccent}
      accentPresets={ACCENT_PRESETS}
      font={settings.font}
      onFontChange={setFont}
      fontOptions={FONTS.map((f) => ({ id: f, label: FONT_LABELS[f] }))}
      radius={settings.radius}
      onRadiusChange={setRadius}
      locale={i18n.locale as AppLocale}
      onLocaleChange={switchLocale}
      localeOptions={LOCALES}
      onReset={reset}
    />
  );
}
