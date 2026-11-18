import { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useAuthStore } from '../stores/auth-store';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';
import { getEffectiveSection, useChatStore } from '../stores/chat-store';
import { ProxyBottomNavigation, ProxyChatScreen } from '@sewer-net/ui';

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
  const section = useChatStore((state) => state.section);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const showRooms = useChatStore((state) => state.showRooms);
  const showSettings = useChatStore((state) => state.showSettings);
  const { t } = useLingui();

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (isUnauthorized(err)) {
        setCredentials(null);
      }
    },
    [setCredentials],
  );

  // The shell only ever receives the section it can actually render, so a
  // stale `chat` request can never show an empty conversation panel.
  const effectiveSection = getEffectiveSection(section, activeRoomId);

  return (
    <ProxyChatScreen
      section={effectiveSection}
      activeRoomId={activeRoomId}
      rail={<Rail />}
      rooms={<RoomList />}
      chat={<ChatView onAuthError={handleAuthError} />}
      settings={null}
      bottomNavigation={
        <ProxyBottomNavigation
          section={effectiveSection}
          chatsLabel={t`Chats`}
          settingsLabel={t`Settings`}
          navigationLabel={t`Main navigation`}
          onRooms={showRooms}
          onSettings={showSettings}
        />
      }
    />
  );
}
