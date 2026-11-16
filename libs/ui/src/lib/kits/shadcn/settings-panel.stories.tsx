import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxySettingsPanel } from '../../proxy/proxy-settings-panel';

const meta: Meta<typeof ProxySettingsPanel> = {
  title: 'Proxy/SettingsPanel',
  component: ProxySettingsPanel,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxySettingsPanel>;

export const Default: Story = {
  args: {
    onClose: () => undefined,
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
    onReset: () => undefined,
  },
};

