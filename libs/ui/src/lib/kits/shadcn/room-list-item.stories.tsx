import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRoomListItem } from '../../proxy/proxy-room-list-item';

const meta: Meta<typeof ProxyRoomListItem> = {
  title: 'Proxy/RoomListItem',
  component: ProxyRoomListItem,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProxyRoomListItem>;

export const Default: Story = {
  args: { id: 'general', children: 'General' },
};

export const Active: Story = {
  args: { id: 'random', children: 'Random', active: true },
};

export const WithUnread: Story = {
  args: { id: 'random', children: 'Random', active: true, unread: 5 },
};

export const UnreadInactive: Story = {
  args: { id: 'dev', children: 'Development', unread: 2 },
};

