import { useCallback, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useNavigate } from 'react-router-dom';
import { RoomList } from '../components/room-list';
import { ChatView } from '../components/chat-view';
import { Rail } from '../components/rail';
import { SettingsPanel } from '../components/settings-panel';
import { getEffectiveSection, useChatStore } from '../stores/chat-store';
import { logoutCurrent } from '../../client/init-matrix';
import { clearPublishedCredentials } from '../stores/auth-store';
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
  const navigate = useNavigate();
  const section = useChatStore((state) => state.section);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const showRooms = useChatStore((state) => state.showRooms);
  const showSettings = useChatStore((state) => state.showSettings);
  const closeSettings = useChatStore((state) => state.closeSettings);
  const resetUi = useChatStore((state) => state.resetUi);
  const { t } = useLingui();

  const handleAuthError = useCallback((err: unknown) => {
    if (isUnauthorized(err)) {
      // The live session is unusable: drop it from the UI (RequireAuth sends
      // the user to sign in again) without pretending the token is valid.
      clearPublishedCredentials();
    }
  }, []);

  /**
   * Logout order matters: credentials and UI navigation are cleared first, so
   * the chat UI unmounts before the client is torn down and no component ever
   * calls getMatrixClient() on a stopped client.
   */
  const handleLogout = useCallback(() => {
    clearPublishedCredentials();
    resetUi();
    void logoutCurrent().catch((err) => {
      // The durable logout reports failures through the auth store; never
      // present a failed deletion as a successful sign-out.
      console.error('[sewernet] logout failed:', err);
    });
    navigate('/welcome', { replace: true });
  }, [clearPublishedCredentials, resetUi, logoutCurrent, navigate]);

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
