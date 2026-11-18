import { useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ProxyRoomListEmpty,
  ProxyRoomListEntry,
  ProxyRoomListHeader,
  ProxyRoomListItem,
  ProxyRoomListItemContent,
  ProxyRoomListItems,
  ProxyRoomListPanel,
  ProxyRoomListSearch,
} from '@sewer-net/ui';
import { ProxyIcon } from '@sewer-net/icons';
import { useRooms } from '../hooks/use-rooms';
import { roomAvatarUrl } from '../../lib/media-url';
import { useChatStore } from '../stores/chat-store';

/**
 * Room list of the current account. The search query and the filtered rows are
 * local state: the shell keeps this component mounted across section and
 * breakpoint changes, so the query survives without living in a global store.
 */
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
    <ProxyRoomListPanel className="min-h-0">
      <ProxyRoomListHeader title={t`SewerNet`} />
      <ProxyRoomListSearch
        query={query}
        onChange={(value) => setQuery(value)}
        placeholder={t`Search`}
      />
      {filtered.length === 0 ? (
        <ProxyRoomListEmpty emptyLabel={<Trans>No chats yet</Trans>} />
      ) : (
        <ProxyRoomListItems aria-label={t`Chats`}>
          {filtered.map((room) => (
            <ProxyRoomListEntry key={room.roomId}>
              <ProxyRoomListItem
                id={room.roomId}
                active={activeRoomId === room.roomId}
                onSelect={(id) => setActiveRoom(id)}
              >
                <ProxyRoomListItemContent
                  icon={<ProxyIcon name="room" size={18} />}
                  avatarUrl={roomAvatarUrl(room.avatarMxc, 48)}
                  name={room.name}
                  preview={room.preview || undefined}
                  topic={room.topic}
                />
              </ProxyRoomListItem>
            </ProxyRoomListEntry>
          ))}
        </ProxyRoomListItems>
      )}
    </ProxyRoomListPanel>
  );
}
