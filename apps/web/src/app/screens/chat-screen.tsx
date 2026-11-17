import { useCallback } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';
import { ProxyChatScreen } from '@sewer-net/ui';

/** Detects an expired matrix session coming from the SDK error shape. */
function isUnauthorized(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const candidate = err as {
    httpStatus?: unknown;
    status?: unknown;
    errcode?: unknown;
  };
  return (
    candidate.httpStatus === 401 ||
    candidate.status === 401 ||
    candidate.errcode === 'M_UNKNOWN_TOKEN'
  );
}

export function ChatScreen() {
  const setCredentials = useAuthStore((state) => state.setCredentials);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (isUnauthorized(err)) {
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
