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

export const EncryptedRoom: Story = {
  args: {
    title: 'Secret plans',
    subtitle: '!secret:matrix.org',
    onBack: () => undefined,
    encrypted: true,
    encryptedLabel: 'Encrypted',
  },
};

