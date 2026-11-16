import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRail } from '../../proxy/proxy-rail.js';
import { ProxyRailButton } from '../../proxy/proxy-rail-button.js';

const meta: Meta<typeof ProxyRail> = {
  title: 'Proxy/Rail',
  component: ProxyRail,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyRail>;

export const Default: Story = {
  render: () => (
    <ProxyRail mode="dark" onThemeToggle={() => {}} onSettings={() => {}} onLogout={() => {}}>
      <ProxyRailButton icon="sun" title="Switch theme" />
      <ProxyRailButton icon="settings" title="Settings" />
      <ProxyRailButton icon="logout" title="Log out" />
    </ProxyRail>
  ),
};
