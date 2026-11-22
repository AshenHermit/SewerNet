import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRail } from '../../proxy/proxy-rail';

const noop = () => undefined;

const meta: Meta<typeof ProxyRail> = {
  title: 'Proxy/Rail',
  component: ProxyRail,
  parameters: { layout: 'centered' },
  args: {
    section: 'rooms',
    navigationLabel: 'Main navigation',
    roomsLabel: 'Chats',
    onRooms: noop,
    settingsLabel: 'Settings',
    onSettings: noop,
    logoutLabel: 'Log out',
    onLogout: noop,
    themeToggleLabel: 'Switch to dark theme',
    themeIcon: 'moon',
    onThemeToggle: noop,
  },
};

export default meta;
type Story = StoryObj<typeof ProxyRail>;

export const Default: Story = {};

/** Settings is the visible section, so "Chats" is no longer current. */
export const SettingsCurrent: Story = {
  args: { section: 'settings' },
};
