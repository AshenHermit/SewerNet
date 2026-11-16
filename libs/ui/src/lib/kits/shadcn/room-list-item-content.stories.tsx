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

