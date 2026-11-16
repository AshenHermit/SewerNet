import { useCallback, useEffect } from 'react';
import {
  matrixClient,
  MatrixApiError,
  type AuthSession,
} from '../../lib/matrix-client';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore, type RoomInfo } from '../stores/chat-store';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';
import { ProxyChatScreen } from '@sewer-net/ui';

/**
 * Имя комнаты, когда у неё нет ни `m.room.name`, ни алиаса, ни собеседника в
 * DM. Полный room id полезнее заглушки: по нему комнаты хотя бы различимы.
 */
function fallbackRoomName(roomId: string): string {
  return roomId;
}

/**
 * Homeserver'ы без sliding-sync (MSC3575) отвечают 400/404 на room-list.
 * Только для них включается старый путь; остальные ошибки пробрасываются.
 */
function isSlidingSyncUnsupported(err: unknown): boolean {
  return (
    err instanceof MatrixApiError && (err.status === 404 || err.status === 400)
  );
}

/** Старый путь: joined_rooms + имя/превью по каждой комнате. */
async function loadLegacyRooms(session: AuthSession): Promise<RoomInfo[]> {
  const { joined_rooms } = await matrixClient.getJoinedRooms(session);
  return Promise.all(
    joined_rooms.map(async (roomId) => {
      const [state, history] = await Promise.all([
        matrixClient
          .getRoomState(session, roomId, 'm.room.name')
          .catch(() => ({}) as Record<string, unknown>),
        matrixClient.getMessages(session, roomId, { limit: 1 }).catch(() => null),
      ]);
      const last = history?.chunk?.[0];
      const name = state['name'];
      const preview = last?.content?.['body'];
      const lastTs = last?.origin_server_ts;
      return {
        id: roomId,
        name: typeof name === 'string' ? name : fallbackRoomName(roomId),
        preview: typeof preview === 'string' ? preview : '',
        lastTs: typeof lastTs === 'number' ? lastTs : 0,
      } satisfies RoomInfo;
    }),
  );
}

/** Список комнат: один sliding-sync запрос, иначе — фолбэк. */
async function loadRoomList(session: AuthSession): Promise<RoomInfo[]> {
  try {
    const synced = await matrixClient.getSyncedRooms(session);
    return synced.map((room) => ({
      id: room.room_id,
      name: room.name ?? fallbackRoomName(room.room_id),
      preview: room.preview ?? '',
      lastTs: room.lastTs ?? 0,
      avatar: room.avatar,
      topic: room.topic,
    }));
  } catch (err) {
    if (!isSlidingSyncUnsupported(err)) throw err;
    return loadLegacyRooms(session);
  }
}

export function ChatScreen() {
  const session = useAuthStore((state) => state.session);
  const clearSession = useAuthStore((state) => state.clearSession);
  const chat = useChatStore();

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof MatrixApiError && err.status === 401) {
        clearSession();
      }
    },
    [clearSession],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      if (!session) return;
      chat.setLoadingRooms(true);
      chat.setError(null);
      try {
        // Один запрос sliding-sync за целым списком комнат с названиями и
        // превью; на homeserver'ах без него — фолбэк на joined_rooms.
        const rooms = await loadRoomList(session);
        if (cancelled) return;
        chat.setRooms(rooms.sort((a, b) => b.lastTs - a.lastTs));
      } catch (err) {
        if (!cancelled) {
          handleAuthError(err);
          chat.setError(
            err instanceof Error ? err.message : 'Failed to load rooms',
          );
        }
      } finally {
        if (!cancelled) chat.setLoadingRooms(false);
      }
    }

    void loadRooms();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, handleAuthError]);

  return (
    <ProxyChatScreen>
      <Rail />
      <RoomList />
      <ChatView onAuthError={handleAuthError} />
    </ProxyChatScreen>
  );
}
