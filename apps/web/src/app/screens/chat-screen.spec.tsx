import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRooms, type RoomEntry } from '../hooks/use-rooms';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { logoutCurrent } from '../../client/init-matrix';
import { ChatScreen } from './chat-screen';

vi.mock('../hooks/use-rooms', () => ({
  useRooms: vi.fn(),
}));

vi.mock('../../client/init-matrix', () => ({
  logoutCurrent: vi.fn(() => Promise.resolve()),
}));

interface MediaMock {
  matchMedia: typeof window.matchMedia;
  dispatch: (matches: boolean) => void;
}

function createMediaMock(matches: boolean): MediaMock {
  let current = matches;
  const listeners = new Set<() => void>();
  const matchMedia = ((query: string) => ({
    get matches() {
      return current;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
  return {
    matchMedia,
    dispatch: (next: boolean) => {
      current = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** Minimal `<dialog>` state machine for jsdom (real trap is browser-tested). */
function installDialogStub() {
  const proto = window.HTMLDialogElement?.prototype;
  if (!proto) throw new Error('jsdom is expected to expose HTMLDialogElement');
  const originalShowModal = proto.showModal;
  const originalClose = proto.close;
  Object.defineProperty(proto, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(proto, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
  return () => {
    Object.defineProperty(proto, 'showModal', {
      configurable: true,
      writable: true,
      value: originalShowModal,
    });
    Object.defineProperty(proto, 'close', {
      configurable: true,
      writable: true,
      value: originalClose,
    });
  };
}

// ChatView derives its timeline from the SDK singleton; chat-screen tests
// only cover the layout, so the timeline hook is stubbed.
vi.mock('../hooks/use-timeline', () => ({
  useTimeline: vi.fn(() => ({
    items: [],
    hasMore: false,
    loadOlder: vi.fn(),
    isLoading: false,
  })),
  useRoomEncrypted: vi.fn(() => false),
  prepareToEncryptThrottled: vi.fn(),
  sendMessageText: vi.fn(),
  sendMessageFile: vi.fn(),
  markRoomRead: vi.fn(),
}));

const mockedUseRooms = vi.mocked(useRooms);

function renderScreen() {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <MemoryRouter initialEntries={['/']}>
            <ChatScreen />
          </MemoryRouter>
        </IconSetProvider>
      </UiKitProvider>
    </I18nProvider>,
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const originalMatchMedia = window.matchMedia;
let media: MediaMock;
let restoreDialog: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({ activeRoomId: null, section: 'rooms', error: null });
  useAuthStore.setState({ credentials: null });
  media = createMediaMock(false);
  window.matchMedia = media.matchMedia;
  restoreDialog = installDialogStub();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  restoreDialog();
});

describe('ChatScreen', () => {
  it('renders the room list from the SDK store', () => {
    const rooms: RoomEntry[] = [
      { roomId: '!a:h.example', name: 'Alpha', preview: 'first' },
    ];
    mockedUseRooms.mockReturnValue(rooms);

    renderScreen();

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('first')).toBeTruthy();
  });

  it('keeps room selection in the chat store', () => {
    mockedUseRooms.mockReturnValue([]);
    renderScreen();
    expect(useChatStore.getState().activeRoomId).toBeNull();
  });

  it('falls back to the room list when the chat section has no room', () => {
    mockedUseRooms.mockReturnValue([]);
    useChatStore.setState({ activeRoomId: null, section: 'chat' });

    const { container } = renderScreen();

    const shell = container.querySelector('[data-sn-section]');
    expect(shell?.getAttribute('data-sn-section')).toBe('rooms');
    expect(container.querySelector('[data-sn-panel="rooms"]')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('[data-sn-panel="chat"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('opens the chat section when a room is selected', () => {
    mockedUseRooms.mockReturnValue([{ roomId: '!a:h.example', name: 'Alpha' }]);

    const { container } = renderScreen();
    fireEvent.click(screen.getByText('Alpha'));

    const shell = container.querySelector('[data-sn-section]');
    expect(shell?.getAttribute('data-sn-section')).toBe('chat');
    expect(container.querySelector('[data-sn-panel="chat"]')?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps the room search query across section changes', () => {
    mockedUseRooms.mockReturnValue([
      { roomId: '!a:h.example', name: 'Alpha' },
      { roomId: '!b:h.example', name: 'Beta' },
    ]);

    renderScreen();
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'alp' } });
    fireEvent.click(screen.getByText('Alpha'));
    expect(useChatStore.getState().section).toBe('chat');

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));

    const search = screen.getByPlaceholderText('Search') as HTMLInputElement;
    expect(search.value).toBe('alp');
    expect(screen.queryByText('Beta')).toBeNull();
  });
});

describe('ChatScreen navigation and logout', () => {
  it.each([
    { mode: 'compact', compact: true },
    { mode: 'wide', compact: false },
  ])('clears credentials before logout ($mode)', ({ compact }) => {
    act(() => media.dispatch(!compact));
    mockedUseRooms.mockReturnValue([{ roomId: '!a:hs', name: 'Alpha' }]);
    useChatStore.setState({ activeRoomId: '!a:hs', section: 'settings' });

    const stateAtLogout: {
      credentials: unknown;
      section: string;
      activeRoomId: string | null;
    }[] = [];
    vi.mocked(logoutCurrent).mockImplementation(() => {
      const state = useChatStore.getState();
      stateAtLogout.push({
        credentials: useAuthStore.getState().credentials,
        section: state.section,
        activeRoomId: state.activeRoomId,
      });
      return Promise.resolve();
    });

    useAuthStore.setState({
      credentials: {
        userId: '@alice:hs',
        accessToken: 'token',
        deviceId: 'device',
        homeserverUrl: 'https://hs',
      },
    });

    const { container } = renderScreen();
    if (compact) {
      // Compact logout lives in the settings screen: open it from the tabs.
      const tabs = container.querySelector('[data-sn-nav="bottom"]') as HTMLElement;
      fireEvent.click(within(tabs).getByRole('button', { name: 'Settings' }));
      const settingsPanel = container.querySelector(
        '[data-sn-panel="settings"]',
      ) as HTMLElement;
      fireEvent.click(within(settingsPanel).getByRole('button', { name: 'Log out' }));
    } else {
      const rail = container.querySelector('[data-sn-nav="rail"]') as HTMLElement;
      fireEvent.click(within(rail).getByRole('button', { name: 'Log out' }));
    }

    expect(logoutCurrent).toHaveBeenCalledTimes(1);
    expect(stateAtLogout).toHaveLength(1);
    // Credentials and UI state are cleared synchronously, before the SDK call
    // starts: the chat UI must never call getMatrixClient() on a torn client.
    expect(stateAtLogout[0].credentials).toBeNull();
    expect(stateAtLogout[0].section).toBe('rooms');
    expect(stateAtLogout[0].activeRoomId).toBeNull();
  });

  it('navigates between settings, rooms and the selected chat', () => {
    mockedUseRooms.mockReturnValue([{ roomId: '!a:hs', name: 'Alpha' }]);
    useChatStore.setState({ activeRoomId: '!a:hs', section: 'chat' });

    const { container } = renderScreen();
    // Reading a conversation hides the compact navigation on purpose, so the
    // chat panel shows no "Back" in jsdom (that button is hidden on wide).
    expect(container.querySelector('[data-sn-nav="bottom"]')?.hasAttribute('hidden')).toBe(true);

    act(() => useChatStore.getState().showRooms());

    const nav = container.querySelector('[data-sn-nav="bottom"]') as HTMLElement;
    expect(nav.hasAttribute('hidden')).toBe(false);

    fireEvent.click(within(nav).getByRole('button', { name: 'Settings' }));
    expect(useChatStore.getState().section).toBe('settings');
    expect(screen.getByRole('form', { name: 'Appearance' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useChatStore.getState().section).toBe('rooms');
    expect(useChatStore.getState().activeRoomId).toBe('!a:hs');

    fireEvent.click(within(nav).getByRole('button', { name: 'Settings' }));
    fireEvent.click(within(nav).getByRole('button', { name: 'Chats' }));
    expect(useChatStore.getState().section).toBe('rooms');
    expect(useChatStore.getState().activeRoomId).toBe('!a:hs');
  });

  it('marks the bottom navigation entries current for the visible section', () => {
    mockedUseRooms.mockReturnValue([{ roomId: '!a:hs', name: 'Alpha' }]);

    const { container } = renderScreen();
    const nav = container.querySelector('[data-sn-nav="bottom"]') as HTMLElement;
    const chats = within(nav).getByRole('button', { name: 'Chats' });
    const settings = within(nav).getByRole('button', { name: 'Settings' });
    expect(chats.getAttribute('aria-current')).toBe('page');
    expect(settings.hasAttribute('aria-current')).toBe(false);

    fireEvent.click(settings);
    expect(chats.hasAttribute('aria-current')).toBe(false);
    expect(settings.getAttribute('aria-current')).toBe('page');
    expect(useChatStore.getState().section).toBe('settings');
  });

  it('marks the rail entries current for the visible section', () => {
    act(() => media.dispatch(true));
    mockedUseRooms.mockReturnValue([{ roomId: '!a:hs', name: 'Alpha' }]);

    const { container } = renderScreen();
    const rail = container.querySelector('[data-sn-nav="rail"]') as HTMLElement;
    expect(rail).toBeTruthy();

    const chats = within(rail).getByRole('button', { name: 'Chats' });
    const settings = within(rail).getByRole('button', { name: 'Settings' });
    expect(chats.getAttribute('aria-current')).toBe('page');
    expect(settings.hasAttribute('aria-current')).toBe(false);

    fireEvent.click(settings);
    expect(chats.hasAttribute('aria-current')).toBe(false);
    expect(settings.getAttribute('aria-current')).toBe('page');

    expect(useChatStore.getState().section).toBe('settings');
  });
});

