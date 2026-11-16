import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatViewMessage } from '../../proxy/proxy-chat-view-message.js';

const meta: Meta<typeof ProxyChatViewMessage> = {
  title: 'Proxy/ChatViewMessage',
  component: ProxyChatViewMessage,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyChatViewMessage>;

export const Theirs: Story = {
  args: {
    event: {
      event_id: '$1',
      type: 'm.room.message',
      sender: '@alice:matrix.org',
      origin_server_ts: Date.now(),
      content: { body: 'Hello!' },
    },
  },
};

export const Ours: Story = {
  args: {
    event: {
      event_id: '$2',
      type: 'm.room.message',
      sender: '@me:matrix.org',
      origin_server_ts: Date.now(),
      content: { body: 'Hi there!' },
    },
    own: true,
  },
};
