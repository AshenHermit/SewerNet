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
import { roomAvatarSource } from '../../lib/media-url';
import { useMedia } from '../hooks/use-media';
import { useChatStore } from '../stores/chat-store';

/**
 * Room list of the current account. The search query and the filtered rows are
 * local state: the shell keeps this component mounted across section and
 * breakpoint changes, so the query survives without living in a global store.
 */
function RoomRow({ room, active, onSelect }: {
  room: { roomId: string; name: string; avatarMxc?: string; preview?: string; topic?: string };
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const { url } = useMedia(roomAvatarSource(room.avatarMxc, 48));
  return (
    <ProxyRoomListEntry>
      <ProxyRoomListItem id={room.roomId} active={active} onSelect={onSelect}>
        <ProxyRoomListItemContent
          icon={<ProxyIcon name="room" size={18} />}
          avatarUrl={url}
          name={room.name}
          preview={room.preview || undefined}
          topic={room.topic}
        />
      </ProxyRoomListItem>
    </ProxyRoomListEntry>
  );
}

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
            <RoomRow
              key={room.roomId}
              room={room}
              active={activeRoomId === room.roomId}
              onSelect={(id) => setActiveRoom(id)}
            />
          ))}
        </ProxyRoomListItems>
      )}
    </ProxyRoomListPanel>
  );
}
