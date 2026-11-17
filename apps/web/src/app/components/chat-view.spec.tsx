import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { ChatView } from './chat-view';

type Handler = (...args: unknown[]) => void;

function fakeEvent(
  id: string,
  body: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    getId: () => id,
    getType: () => 'm.room.message',
    getSender: () => '@alice:matrix.org',
    getTs: () => 1,
    getContent: () => ({ msgtype: 'm.text', body }),
    isRedacted: () => false,
    status: null,
    ...overrides,
  };
}

function makeFakeRoom(id: string, name: string, events: ReturnType<typeof fakeEvent>[]) {
  const live = {
    getEvents: () => events,
    getPaginationToken: (direction: string) => (direction === 'b' ? 'tok-old' : null),
    getNeighbouringTimeline: () => null,
    setNeighbouringTimeline: vi.fn(),
    getTimelineSet: () => ({ getRoomId: () => id }),
    getRoomId: () => id,
  };
  return {
    roomId: id,
    name,
    getMyMembership: () => 'join',
    getLiveTimeline: () => live,
    getUnreadNotificationCount: () => 0,
    getMxcAvatarUrl: () => null,
    getJoinedMembers: () => [],
  };
}

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  sendReadReceipt: vi.fn(),
  paginateEventTimeline: vi.fn(),
  getMatrixClient: vi.fn(),
}));

vi.mock('../../client/init-matrix', () => ({
  getMatrixClient: mocks.getMatrixClient,
  hasActiveClient: vi.fn(() => true),
}));

// No HTTP calls are expected from the migrated chat view.
const fetchCalls: string[] = [];
global.fetch = (async (input: string | URL) => {
  fetchCalls.push(String(input));
  throw new Error(`unexpected http call: ${input}`);
}) as unknown as typeof fetch;

const ROOM = makeFakeRoom('!r1:matrix.org', 'SDK Room', [
  fakeEvent('$a:matrix.org', 'hello'),
  fakeEvent('$b:matrix.org', 'room'),
]);

function renderView() {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <ChatView onAuthError={vi.fn()} />
        </IconSetProvider>
      </UiKitProvider>
    </I18nProvider>,
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchCalls.length = 0;
  mocks.sendMessage.mockResolvedValue(undefined);
  mocks.sendReadReceipt.mockResolvedValue(undefined);
  mocks.paginateEventTimeline.mockResolvedValue(true);
  const client = {
    getUserId: () => '@alice:matrix.org',
    getRooms: () => [ROOM],
    getRoom: (roomId: string) => (roomId === ROOM.roomId ? ROOM : null),
    on: vi.fn(),
    off: vi.fn(),
    sendMessage: mocks.sendMessage,
    sendReadReceipt: mocks.sendReadReceipt,
    paginateEventTimeline: mocks.paginateEventTimeline,
  };
  mocks.getMatrixClient.mockReturnValue(client);
  useAuthStore.setState({
    credentials: {
      userId: '@alice:matrix.org',
      accessToken: 'at',
      deviceId: 'DEV',
      homeserverUrl: 'https://matrix.org',
    },
    session: null,
  });
  useChatStore.setState({ activeRoomId: '!r1:matrix.org', error: null });
});

afterEach(() => {
  useAuthStore.setState({ credentials: null, session: null });
  useChatStore.setState({ activeRoomId: null, error: null });
});

describe('ChatView (sdk timeline)', () => {
  it('renders live timeline items without any http calls', async () => {
    renderView();

    expect(await screen.findByText('hello')).toBeTruthy();
    expect(screen.getByText('room')).toBeTruthy();
    expect(screen.getByText('SDK Room')).toBeTruthy();
    expect(fetchCalls).toHaveLength(0);
  });

  it('sends through the sdk and clears the draft', async () => {
    renderView();

    const input = await screen.findByLabelText('Message');
    fireEvent.change(input, { target: { value: 'hi there' } });
    fireEvent.click(screen.getByTitle('Send'));

    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith('!r1:matrix.org', {
        msgtype: 'm.text',
        body: 'hi there',
      }),
    );
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('marks the room read when it opens', async () => {
    renderView();

    await waitFor(() =>
      expect(mocks.sendReadReceipt).toHaveBeenCalledWith(
        ROOM.getLiveTimeline().getEvents().at(-1),
        'm.read',
        true,
      ),
    );
  });

  it('paginates backwards from the load-older control', async () => {
    renderView();

    const loadMore = await screen.findByText('Load older messages');
    fireEvent.click(loadMore);

    await waitFor(() =>
      expect(mocks.paginateEventTimeline).toHaveBeenCalledWith(
        ROOM.getLiveTimeline(),
        { backwards: true, limit: 80 },
      ),
    );
  });

  it('auto-scrolls for new events only while the user is at the bottom', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const { container } = renderView();
    await screen.findByText('hello');

    // Initial render keeps the newest message visible.
    const initialCalls = scrollSpy.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);

    // User scrolled away from the bottom.
    const list = container.querySelector('.overflow-y-auto') as HTMLElement;
    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(list, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true });
    fireEvent.scroll(list);

    // A new event arrives from the SDK while the user is scrolled up.
    const client = mocks.getMatrixClient();
    const handlers = (client.on as ReturnType<typeof vi.fn>).mock.calls
      .filter(([event]) => event === 'Room.timeline')
      .map(([, handler]) => handler as Handler);
    for (const handler of handlers) handler(ROOM, undefined, false);

    expect(scrollSpy.mock.calls.length).toBe(initialCalls);
  });
});
