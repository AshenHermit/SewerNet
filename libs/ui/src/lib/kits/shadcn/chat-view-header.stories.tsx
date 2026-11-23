import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatViewHeader } from '../../proxy/proxy-chat-view-header';

const meta: Meta<typeof ProxyChatViewHeader> = {
  title: 'Proxy/ChatViewHeader',
  component: ProxyChatViewHeader,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyChatViewHeader>;

export const Default: Story = {
  args: {
    title: 'General',
    subtitle: '!example:matrix.org',
    onBack: () => undefined,
  },
};

export const WithAvatar: Story = {
  args: {
    title: 'Design',
    subtitle: '!design:matrix.org',
    onBack: () => undefined,
    avatarUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%236366f1"/></svg>',
  },
};

export const EncryptedRoom: Story = {
  args: {
    title: 'Secret plans',
    subtitle: '!secret:matrix.org',
    onBack: () => undefined,
    encrypted: true,
    encryptedLabel: 'Encrypted',
  },
};

