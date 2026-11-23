import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { useThemeStore } from '@sewer-net/themes';
import { useRooms, type RoomEntry } from '../hooks/use-rooms';
import { useTimeline } from '../hooks/use-timeline';
import { markRoomRead, sendMessageFile, sendMessageText } from '../hooks/use-timeline';
import { ChatScreen } from './chat-screen';

vi.mock('../hooks/use-rooms', () => ({
  useRooms: vi.fn(),
}));

vi.mock('../../client/init-matrix', () => ({
  logoutCurrent: vi.fn(() => Promise.resolve()),
  getMatrixClient: vi.fn(() => null),
  hasActiveClient: vi.fn(() => false),
}));

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
const mockedUseTimeline = vi.mocked(useTimeline);
const mockedSendMessageText = vi.mocked(sendMessageText);
const mockedSendMessageFile = vi.mocked(sendMessageFile);
const mockedMarkRoomRead = vi.mocked(markRoomRead);

const ROOMS: RoomEntry[] = [
  { roomId: '!a:hs', name: 'Alpha', preview: 'unfinished draft' },
  { roomId: '!b.b[room]:hs', name: 'Beta', preview: 'second' },
];

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
    Object.defineProperty(proto, 'showModal', { configurable: true, writable: true, value: originalShowModal });
    Object.defineProperty(proto, 'close', { configurable: true, writable: true, value: originalClose });
  };
}

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

const originalMatchMedia = window.matchMedia;
let media: MediaMock;
let restoreDialog: () => void;

/** Test-local viewport switch: the media change is applied inside `act`. */
function setCompact(compact: boolean) {
  act(() => {
    media.dispatch(!compact);
  });
}

function panel(container: HTMLElement, name: 'rooms' | 'chat' | 'settings') {
  return container.querySelector<HTMLElement>(`[data-sn-panel="${name}"]`)!;
}

function messageInput(): HTMLInputElement {
  return screen.getByLabelText('Message') as HTMLInputElement;
}

function searchInput(): HTMLInputElement {
  return screen.getByPlaceholderText('Search') as HTMLInputElement;
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseRooms.mockReturnValue(ROOMS);
  mockedUseTimeline.mockReturnValue({ items: [], hasMore: false, loadOlder: vi.fn(), isLoading: false });
  mockedSendMessageText.mockResolvedValue(undefined);
  mockedSendMessageFile.mockResolvedValue(undefined);
  mockedMarkRoomRead.mockResolvedValue(undefined);
  useChatStore.setState({ activeRoomId: null, section: 'rooms', error: null });
  useAuthStore.setState({
    credentials: {
      userId: '@alice:hs',
      accessToken: 'at',
      deviceId: 'DEV',
      homeserverUrl: 'https://hs',
    },
  });
  useThemeStore.setState({
    settings: { kitId: 'shadcn', mode: 'dark', accent: '#22c55e', font: 'inter', radius: 10 },
  });
  media = createMediaMock(false);
  window.matchMedia = media.matchMedia;
  restoreDialog = installDialogStub();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  restoreDialog();
  useAuthStore.setState({ credentials: null });
  useChatStore.setState({ activeRoomId: null, section: 'rooms', error: null });
});

describe('ChatScreen state preservation', () => {
  it('preserves draft query selection across navigation and resize', () => {
    const { container } = renderScreen();

    fireEvent.click(within(panel(container, 'rooms')).getByText('Alpha'));
    const message = messageInput();
    fireEvent.change(message, { target: { value: 'unfinished draft' } });

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    const search = searchInput();
    fireEvent.change(search, { target: { value: 'Alpha' } });

    setCompact(false);
    act(() => {
      useChatStore.getState().closeSettings();
    });
    setCompact(true);

    expect(messageInput().value).toBe('unfinished draft');
    expect(messageInput().isSameNode(message)).toBe(true);
    expect(searchInput().value).toBe('Alpha');
    expect(searchInput().isSameNode(search)).toBe(true);
    expect(useChatStore.getState().activeRoomId).toBe('!a:hs');
    expect(useThemeStore.getState().settings.mode).toBe('dark');
  });

  it('does not resend pending text', async () => {
    let resolveSend: (() => void) | undefined;
    mockedSendMessageText.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const { container } = renderScreen();

    fireEvent.click(within(panel(container, 'rooms')).getByText('Alpha'));
    fireEvent.change(messageInput(), { target: { value: 'unfinished draft' } });
    fireEvent.click(screen.getByTitle('Send'));

    setCompact(false);
    setCompact(true);

    expect(mockedSendMessageText).toHaveBeenCalledTimes(1);
    expect(messageInput().value).toBe('unfinished draft');
    expect(useChatStore.getState().activeRoomId).toBe('!a:hs');

    await act(async () => {
      resolveSend?.();
    });
    expect(messageInput().value).toBe('');
  });

  it('does not reupload pending file', async () => {
    let resolveSend: (() => void) | undefined;
    mockedSendMessageFile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const { container } = renderScreen();

    fireEvent.click(within(panel(container, 'rooms')).getByText('Alpha'));
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['data'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    setCompact(false);
    setCompact(true);

    expect(mockedSendMessageFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSend?.();
    });
    expect(useChatStore.getState().error).toBeNull();
  });

  it('keeps failed draft and error', async () => {
    mockedSendMessageText.mockRejectedValue(new Error('network failed'));
    const { container } = renderScreen();

    fireEvent.click(within(panel(container, 'rooms')).getByText('Alpha'));
    fireEvent.change(messageInput(), { target: { value: 'unfinished draft' } });
    fireEvent.click(screen.getByTitle('Send'));

    await waitFor(() => expect(useChatStore.getState().error).toBe('network failed'));
    setCompact(false);
    setCompact(true);

    expect(messageInput().value).toBe('unfinished draft');
    expect(useChatStore.getState().error).toBe('network failed');
    expect(mockedSendMessageText).toHaveBeenCalledTimes(1);
  });

  it('does not scroll or paginate a hidden timeline', () => {
    const loadOlder = vi.fn();
    mockedUseTimeline.mockReturnValue({
      items: [
        {
          eventId: '$a:hs',
          event: { getType: () => 'm.room.message' } as never,
          ts: 1,
          sender: '@alice:hs',
          content: { body: 'hello', msgtype: 'm.text' },
          own: false,
        },
      ],
      hasMore: true,
      loadOlder,
      isLoading: false,
    });
    const scrollSpy = vi.fn();
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollSpy;

    try {
      const { container } = renderScreen();
      fireEvent.click(within(panel(container, 'rooms')).getByText('Alpha'));
      expect(screen.getByText('hello')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
      const scrollRegion = container.querySelector<HTMLElement>('[data-sn-scroll="messages"]')!;
      Object.defineProperty(scrollRegion, 'scrollTop', { configurable: true, value: 0 });
      Object.defineProperty(scrollRegion, 'scrollHeight', { configurable: true, value: 400 });
      Object.defineProperty(scrollRegion, 'clientHeight', { configurable: true, value: 100 });

      scrollSpy.mockClear();
      loadOlder.mockClear();
      mockedMarkRoomRead.mockClear();

      fireEvent.scroll(scrollRegion);
      setCompact(false);
      setCompact(true);

      expect(loadOlder).not.toHaveBeenCalled();
      expect(scrollSpy).not.toHaveBeenCalled();
      expect(mockedMarkRoomRead).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });

  it('does not reconnect or repeat receipts', () => {
    const { container } = renderScreen();
    fireEvent.click(within(panel(container, 'rooms')).getByText('Alpha'));

    setCompact(false);
    setCompact(true);
    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    fireEvent.click(within(panel(container, 'rooms')).getByText('Alpha'));

    expect(mockedMarkRoomRead).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().activeRoomId).toBe('!a:hs');
    // The very first render has no room selected (`null`); every later
    // subscription must stay on the room the user opened, so a reflow never
    // tears the timeline down and reconnects it to another room.
    const selected = mockedUseTimeline.mock.calls
      .map(([roomId]) => roomId)
      .filter((roomId) => roomId !== null);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((roomId) => roomId === '!a:hs')).toBe(true);
  });
});
