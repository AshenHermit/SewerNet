import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatViewPanel } from '../../proxy/proxy-chat-view-panel';

const meta: Meta<typeof ProxyChatViewPanel> = {
  title: 'Proxy/ChatViewPanel',
  component: ProxyChatViewPanel,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProxyChatViewPanel>;

export const Default: Story = {
  args: { children: 'Chat view content' },
};

