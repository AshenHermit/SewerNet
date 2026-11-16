import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatViewMessageList } from '../../proxy/proxy-chat-view-message-list';

const meta: Meta<typeof ProxyChatViewMessageList> = {
  title: 'Proxy/ChatViewMessageList',
  component: ProxyChatViewMessageList,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyChatViewMessageList>;

export const WithMessages: Story = {
  args: {
    events: [
      {
        event_id: '$1',
        type: 'm.room.message',
        sender: '@alice:matrix.org',
        origin_server_ts: Date.now(),
        content: { body: 'Hello!' },
      },
      {
        event_id: '$2',
        type: 'm.room.message',
        sender: '@me:matrix.org',
        origin_server_ts: Date.now(),
        content: { body: 'Hi there!' },
      },
    ],
    currentUserId: '@me:matrix.org',
  },
};

