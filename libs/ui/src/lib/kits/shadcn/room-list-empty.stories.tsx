import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRoomListEmpty } from '../../proxy/proxy-room-list-empty';

const meta: Meta<typeof ProxyRoomListEmpty> = {
  title: 'Proxy/RoomListEmpty',
  component: ProxyRoomListEmpty,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyRoomListEmpty>;

export const Loading: Story = {
  args: { loading: true, loadingLabel: 'Loading chatsвЂ¦' },
};

export const Empty: Story = {
  args: { emptyLabel: 'No chats yet' },
};

