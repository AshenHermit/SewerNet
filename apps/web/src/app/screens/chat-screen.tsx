import { useCallback, useEffect } from 'react';
import { matrixClient, MatrixApiError } from '../../lib/matrix-client';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore, type RoomInfo } from '../stores/chat-store';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';

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
        const { joined_rooms } = await matrixClient.getJoinedRooms(session);
        if (cancelled) return;
        const rooms: RoomInfo[] = joined_rooms.map((id) => ({
          id,
          name: id.replace(/![^:]*:/, '!…:'),
          preview: '',
          lastTs: 0,
        }));
        chat.setRooms(rooms);
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
    <div className="flex h-full overflow-hidden bg-[var(--sn-bg)]">
      <Rail />
      <RoomList />
      <ChatView onAuthError={handleAuthError} />
    </div>
  );
}
