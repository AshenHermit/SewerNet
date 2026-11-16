import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRail } from '../../proxy/proxy-rail';
import { ProxyRailButton } from '../../proxy/proxy-rail-button';

const meta: Meta<typeof ProxyRail> = {
  title: 'Proxy/Rail',
  component: ProxyRail,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyRail>;

export const Default: Story = {
  render: () => (
    <ProxyRail mode="dark" onThemeToggle={() => undefined} onSettings={() => undefined} onLogout={() => undefined}>
      <ProxyRailButton icon="sun" title="Switch theme" />
      <ProxyRailButton icon="settings" title="Settings" />
      <ProxyRailButton icon="logout" title="Log out" />
    </ProxyRail>
  ),
};

