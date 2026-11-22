import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatScreen } from '../../proxy/proxy-chat-screen';
import { ProxyRail } from '../../proxy/proxy-rail';
import { ProxyRoomListPanel } from '../../proxy/proxy-room-list-panel';
import { ProxyRoomListHeader } from '../../proxy/proxy-room-list-header';
import { ProxyRoomListItems } from '../../proxy/proxy-room-list-items';
import { ProxyRoomListEntry } from '../../proxy/proxy-room-list-entry';
import { ProxyRoomListItem } from '../../proxy/proxy-room-list-item';
import { ProxyRoomListItemContent } from '../../proxy/proxy-room-list-item-content';
import { ProxyChatViewEmpty } from '../../proxy/proxy-chat-view-empty';
import { ProxyChatViewPanel } from '../../proxy/proxy-chat-view-panel';
import { ProxyBottomNavigation } from '../../proxy/proxy-bottom-navigation';

const noop = () => undefined;

function Rooms() {
  return (
    <ProxyRoomListPanel>
      <ProxyRoomListHeader title="SewerNet" />
      <ProxyRoomListItems>
        {[
          { id: '!a:hs', name: 'General', preview: 'welcome' },
          { id: '!b:hs', name: 'Design', preview: 'new tokens' },
        ].map((room) => (
          <ProxyRoomListEntry key={room.id}>
            <ProxyRoomListItem id={room.id} active={room.id === '!a:hs'} onSelect={noop}>
              <ProxyRoomListItemContent name={room.name} preview={room.preview} />
            </ProxyRoomListItem>
          </ProxyRoomListEntry>
        ))}
      </ProxyRoomListItems>
    </ProxyRoomListPanel>
  );
}

function Chat() {
  return (
    <ProxyChatViewPanel>
      <ProxyChatViewEmpty label="Select a chat to start messaging" />
    </ProxyChatViewPanel>
  );
}

const meta: Meta<typeof ProxyChatScreen> = {
  title: 'Proxy/ChatScreen',
  component: ProxyChatScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    section: 'rooms',
    activeRoomId: null,
    rail: (
      <ProxyRail
        section="rooms"
        navigationLabel="Main navigation"
        roomsLabel="Chats"
        onRooms={noop}
        settingsLabel="Settings"
        onSettings={noop}
        logoutLabel="Log out"
        onLogout={noop}
        themeToggleLabel="Switch to dark theme"
        themeIcon="moon"
        onThemeToggle={noop}
      />
    ),
    rooms: <Rooms />,
    chat: <Chat />,
    settings: null,
    bottomNavigation: (
      <ProxyBottomNavigation
        section="rooms"
        chatsLabel="Chats"
        settingsLabel="Settings"
        navigationLabel="Main navigation"
        onRooms={noop}
        onSettings={noop}
      />
    ),
  },
};

export default meta;
type Story = StoryObj<typeof ProxyChatScreen>;

export const Default: Story = {};

export const Chatting: Story = {
  args: { section: 'chat', activeRoomId: '!a:hs' },
};

export const Settings: Story = {
  args: { section: 'settings', activeRoomId: '!a:hs' },
};
