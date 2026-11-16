import { useCallback, useEffect } from 'react';
import { matrixClient, MatrixApiError } from '../../lib/matrix-client';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore, type RoomInfo } from '../stores/chat-store';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';
import { ProxyChatScreen } from '@sewer-net/ui';

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
        // Один запрос sliding-sync за整ым списком комнат с названиями и превью.
        const synced = await matrixClient.getSyncedRooms(session);
        if (cancelled) return;
        const rooms: RoomInfo[] = synced.map((room) => ({
          id: room.room_id,
          name:
            room.name ??
            room.room_id.replace(/![^:]*:/, '!…:'),
          preview: room.preview ?? '',
          lastTs: room.lastTs ?? 0,
          avatar: room.avatar,
          topic: room.topic,
        }));
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
