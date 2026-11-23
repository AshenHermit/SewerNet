import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SettingsPanelProps } from '../../ui-kit';
import { ProxySettingsPanel } from '../../proxy/proxy-settings-panel';

const meta: Meta<typeof ProxySettingsPanel> = {
  title: 'Proxy/SettingsPanel',
  component: ProxySettingsPanel,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxySettingsPanel>;

const baseArgs: SettingsPanelProps = {
  open: true,
  onClose: () => undefined,
  onLogout: () => undefined,
  settingsLabel: 'Settings',
  logoutLabel: 'Log out',
  closeAriaLabel: 'Close',
  appearanceLabel: 'Appearance',
  interfaceLabel: 'Interface',
  colorSchemeLabel: 'Color scheme',
  accentLabel: 'Accent color',
  fontLabel: 'Font',
  radiusLabel: 'Corner radius',
  resetLabel: 'Reset to defaults',
  kitLabel: 'shadcn/ui',
  kitId: 'shadcn',
  onKitChange: () => undefined,
  mode: 'dark',
  onModeChange: () => undefined,
  modeOptions: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ],
  accent: '#22c55e',
  onAccentChange: () => undefined,
  accentPresets: [
    { id: 'sewer', label: 'Sewer Green', value: '#22c55e' },
    { id: 'matrix', label: 'Matrix Blue', value: '#3b82f6' },
  ],
  font: 'inter',
  onFontChange: () => undefined,
  fontOptions: [
    { id: 'inter', label: 'Inter' },
    { id: 'system', label: 'System' },
    { id: 'serif', label: 'Serif' },
    { id: 'mono', label: 'Mono' },
  ],
  radius: 10,
  onRadiusChange: () => undefined,
  locale: 'en',
  onLocaleChange: () => undefined,
  localeOptions: [
    { value: 'en', label: 'EN' },
    { value: 'ru', label: 'RU' },
  ],
  onReset: () => undefined,
};

/**
 * Compact viewport (< 48rem) renders the settings screen in the shell slot;
 * wide viewports render the modal dialog. Both are viewport driven, so the
 * story is switched by resizing the Storybook canvas.
 */
export const Default: Story = { args: baseArgs };

/** Wide dialog forced closed: nothing is rendered for this slot. */
export const WideClosed: Story = {
  args: { ...baseArgs, open: false },
};
