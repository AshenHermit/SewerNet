import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRoomListSearch } from '../../proxy/proxy-room-list-search.js';

const meta: Meta<typeof ProxyRoomListSearch> = {
  title: 'Proxy/RoomListSearch',
  component: ProxyRoomListSearch,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyRoomListSearch>;

export const Default: Story = {
  args: {
    query: '',
    onChange: () => {},
    placeholder: 'Search',
  },
};
