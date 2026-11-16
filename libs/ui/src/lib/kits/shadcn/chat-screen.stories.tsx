import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatScreen } from '../../proxy/proxy-chat-screen.js';
import { ProxyRail } from '../../proxy/proxy-rail.js';
import { ProxyRailButton } from '../../proxy/proxy-rail-button.js';

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
      <ProxyRail mode="dark" onThemeToggle={() => {}} onSettings={() => {}} onLogout={() => {}}>
        <ProxyRailButton icon="settings" title="Settings" />
      </ProxyRail>
    </ProxyChatScreen>
  ),
};
