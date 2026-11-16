import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRoomListPanel } from '../../proxy/proxy-room-list-panel';
import { ProxyRoomListItem } from '../../proxy/proxy-room-list-item';

const meta: Meta<typeof ProxyRoomListPanel> = {
  title: 'Proxy/RoomListPanel',
  component: ProxyRoomListPanel,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProxyRoomListPanel>;

export const Default: Story = {
  args: {
    children: (
      <>
        <ProxyRoomListItem id="general" children="General" />
        <ProxyRoomListItem id="random" children="Random" active unread={3} />
        <ProxyRoomListItem id="dev" children="Development" />
      </>
    ),
  },
};

