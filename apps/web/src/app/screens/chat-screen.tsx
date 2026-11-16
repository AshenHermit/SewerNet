import { useCallback, useEffect } from 'react';
import { matrixClient, MatrixApiError, type AuthSession } from '../../lib/matrix-client';
import { useAuthStore } from '../stores/auth-store';
import {
  previewFromEvent,
  useChatStore,
  type RoomInfo,
} from '../stores/chat-store';
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

  /** Загружает имя комнаты из события состояния и превью последнего сообщения. */
  async function enrichRoom(session: AuthSession, roomId: string): Promise<RoomInfo> {
    const room: RoomInfo = {
      id: roomId,
      name: roomId.replace(/![^:]*:/, '!…:'),
      preview: '',
      lastTs: 0,
    };

    try {
      const state = await matrixClient.getRoomState(session, roomId, 'm.room.name');
      if (state && typeof state.name === 'string') {
        room.name = state.name;
      }
    } catch {
      // Оставляем запасное имя на основе ID комнаты.
    }

    try {
      const res = await matrixClient.getMessages(session, roomId, { limit: 1 });
      const last = res.chunk[0];
      if (last?.type === 'm.room.message') {
        room.preview = previewFromEvent(last);
        room.lastTs = last.origin_server_ts ?? 0;
      }
    } catch {
      // Оставляем пустое превью.
    }

    return room;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      if (!session) return;
      chat.setLoadingRooms(true);
      chat.setError(null);
      try {
        const { joined_rooms } = await matrixClient.getJoinedRooms(session);
        if (cancelled) return;
        // Имена и превью всех комнат загружаются параллельно, чтобы список
        // отображал достоверные данные сразу, без открытия чата.
        const rooms = await Promise.all(
          joined_rooms.map((id) => enrichRoom(session, id)),
        );
        if (cancelled) return;
        chat.setRooms(rooms.sort((a, b) => b.lastTs - a.lastTs));
      } catch (err) {
        if (!cancelled) {
          handleAuthError(err);
          chat.setError(err instanceof Error ? err.message : 'Failed to load rooms');
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
