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
import { useChatStore } from '../stores/chat-store';

export function RoomList() {
  const rooms = useChatStore((state) => state.rooms);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const setActiveRoom = useChatStore((state) => state.setActiveRoom);
  const loading = useChatStore((state) => state.loadingRooms);
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
      {loading ? (
        <ProxyRoomListEmpty
          loading
          loadingLabel={<Trans>Loading chats…</Trans>}
        />
      ) : filtered.length === 0 ? (
        <ProxyRoomListEmpty
          emptyLabel={<Trans>No chats yet</Trans>}
        />
      ) : (
        <ul>
          {filtered.map((room) => (
            <li key={room.id}>
              <ProxyRoomListItem
                id={room.id}
                active={activeRoomId === room.id}
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
