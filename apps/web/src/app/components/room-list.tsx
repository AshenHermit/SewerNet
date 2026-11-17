import { useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ProxyRoomListEmpty,
  ProxyRoomListItem,
  ProxyRoomListItemContent,
  ProxyRoomListPanel,
  ProxyRoomListSearch,
} from '@sewer-net/ui';
import { ProxyIcon } from '@sewer-net/icons';
import { useRooms } from '../hooks/use-rooms';
import { useChatStore } from '../stores/chat-store';

export function RoomList() {
  const rooms = useRooms();
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const setActiveRoom = useChatStore((state) => state.setActiveRoom);
  const { t } = useLingui();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? rooms.filter((room) => room.name.toLowerCase().includes(q))
      : rooms;
  }, [rooms, query]);

  return (
    <ProxyRoomListPanel>
      <ProxyRoomListSearch
        query={query}
        onChange={(value) => setQuery(value)}
        placeholder={t`Search`}
      />
      {filtered.length === 0 ? (
        <ProxyRoomListEmpty emptyLabel={<Trans>No chats yet</Trans>} />
      ) : (
        <ul className="overflow-y-auto">
          {filtered.map((room) => (
            <li key={room.roomId}>
              <ProxyRoomListItem
                id={room.roomId}
                active={activeRoomId === room.roomId}
                onSelect={(id) => setActiveRoom(id)}
              >
                <ProxyRoomListItemContent
                  icon={<ProxyIcon name="room" size={18} />}
                  name={room.name}
                  preview={room.preview || undefined}
                  topic={room.topic}
                />
              </ProxyRoomListItem>
            </li>
          ))}
        </ul>
      )}
    </ProxyRoomListPanel>
  );
}
