import { useCallback, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useAuthStore } from '../stores/auth-store';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';
import { SettingsPanel } from '../components/settings-panel';
import { getEffectiveSection, useChatStore } from '../stores/chat-store';
import { logoutCurrent } from '../../client/init-matrix';
import { ProxyBottomNavigation, ProxyChatScreen, useLayoutMode, usePanelFocus } from '@sewer-net/ui';

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
  const closeSettings = useChatStore((state) => state.closeSettings);
  const resetUi = useChatStore((state) => state.resetUi);
  const { t } = useLingui();

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (isUnauthorized(err)) {
        setCredentials(null);
      }
    },
    [setCredentials],
  );

  /**
   * Logout order matters: credentials and UI navigation are cleared first, so
   * the chat UI unmounts before the client is torn down and no component ever
   * calls getMatrixClient() on a stopped client.
   */
  const handleLogout = useCallback(() => {
    setCredentials(null);
    resetUi();
    void Promise.resolve(logoutCurrent());
  }, [setCredentials, resetUi]);

  // The shell only ever receives the section it can actually render, so a
  // stale `chat` request can never show an empty conversation panel.
  const effectiveSection = getEffectiveSection(section, activeRoomId);

  // Keeps keyboard focus inside the visible panel across navigation and
  // reflows; it never touches store state, so drafts and sends survive.
  const shellRef = useRef<HTMLDivElement>(null);
  const mode = useLayoutMode();
  usePanelFocus(shellRef, effectiveSection, mode, activeRoomId);

  return (
    <ProxyChatScreen
      ref={shellRef}
      section={effectiveSection}
      activeRoomId={activeRoomId}
      rail={
        <Rail
          section={effectiveSection}
          onRooms={showRooms}
          onSettings={showSettings}
          onLogout={handleLogout}
        />
      }
      rooms={<RoomList />}
      chat={<ChatView onAuthError={handleAuthError} />}
      settings={
        <SettingsPanel
          open={effectiveSection === 'settings'}
          onClose={closeSettings}
          onLogout={handleLogout}
        />
      }
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
