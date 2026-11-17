import { useCallback } from 'react';
import { MatrixApiError } from '../../lib/matrix-client';
import { useAuthStore } from '../stores/auth-store';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';
import { ProxyChatScreen } from '@sewer-net/ui';

export function ChatScreen() {
  const setCredentials = useAuthStore((state) => state.setCredentials);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof MatrixApiError && err.status === 401) {
        setCredentials(null);
      }
    },
    [setCredentials],
  );

  return (
    <ProxyChatScreen>
      <Rail />
      <RoomList />
      <ChatView onAuthError={handleAuthError} />
    </ProxyChatScreen>
  );
}
