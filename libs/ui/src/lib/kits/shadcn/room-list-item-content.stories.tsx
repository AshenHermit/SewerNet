import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRoomListItemContent } from '../../proxy/proxy-room-list-item-content';

const meta: Meta<typeof ProxyRoomListItemContent> = {
  title: 'Proxy/RoomListItemContent',
  component: ProxyRoomListItemContent,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyRoomListItemContent>;

export const Default: Story = {
  args: {
    name: 'General',
    preview: 'Hello, world!',
    unread: 3,
  },
};

export const WithAvatar: Story = {
  args: {
    name: 'Design',
    preview: 'Let’s review the new kit',
    avatarUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%230ea5e9"/></svg>',
  },
};

