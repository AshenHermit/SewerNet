import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatScreen } from '../../proxy/proxy-chat-screen';
import { ProxyRail } from '../../proxy/proxy-rail';
import { ProxyRailButton } from '../../proxy/proxy-rail-button';

const meta: Meta<typeof ProxyChatScreen> = {
  title: 'Proxy/ChatScreen',
  component: ProxyChatScreen,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyChatScreen>;

export const Default: Story = {
  render: () => (
    <ProxyChatScreen>
      <ProxyRail mode="dark" onThemeToggle={() => undefined} onSettings={() => undefined} onLogout={() => undefined}>
        <ProxyRailButton icon="settings" title="Settings" />
      </ProxyRail>
    </ProxyChatScreen>
  ),
};

