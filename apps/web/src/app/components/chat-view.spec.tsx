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

/** Structural event shape loose enough for encrypted-event fakes too. */
interface FakeTimelineEvent {
  getId: () => string;
  getType: () => string;
  getSender: () => string;
  getTs: () => number;
  getContent: () => Record<string, unknown>;
  isRedacted: () => boolean;
  status: string | null;
}

function makeFakeRoom(id: string, name: string, events: FakeTimelineEvent[]) {
  let prev: unknown = null;
  const live = {
    getEvents: () => events,
    getPaginationToken: (direction: string) => (direction === 'b' ? 'tok-old' : null),
    getNeighbouringTimeline: () => prev,
    setNeighbouringTimeline: vi.fn((_direction: string, neighbour: unknown) => {
      prev = neighbour;
    }),
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
  uploadContent: vi.fn(),
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
  mocks.uploadContent.mockResolvedValue({ content_uri: 'mxc://hs/uploaded' });
  mocks.paginateEventTimeline.mockResolvedValue(true);
  const client = {
    getUserId: () => '@alice:matrix.org',
    getRooms: () => [ROOM],
    getRoom: (roomId: string) => (roomId === ROOM.roomId ? ROOM : null),
    on: vi.fn(),
    off: vi.fn(),
    sendMessage: mocks.sendMessage,
    sendReadReceipt: mocks.sendReadReceipt,
    uploadContent: mocks.uploadContent,
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

  it('attaches a file through the sdk upload', async () => {
    renderView();
    await screen.findByText('hello');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.uploadContent).toHaveBeenCalledWith(file, expect.anything()),
    );
    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith('!r1:matrix.org', {
        msgtype: 'm.file',
        body: 'notes.pdf',
        filename: 'notes.pdf',
        url: 'mxc://hs/uploaded',
        info: { size: file.size, mimetype: 'application/pdf' },
      }),
    );
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

describe('ChatView (e2ee)', () => {
  function encryptedEvent(id: string, opts?: { shouldAttempt?: boolean }) {
    const event = {
      getId: () => id,
      getType: () => 'm.room.encrypted',
      getSender: () => '@bob:matrix.org',
      getTs: () => 2,
      getContent: () => ({ msgtype: 'm.text', body: `dec ${id}` }),
      isRedacted: () => false,
      status: null,
      shouldAttemptDecryption: () => opts?.shouldAttempt ?? true,
      attemptDecryption: vi.fn(async () => undefined),
    };
    return event;
  }

  type FakeEvent = FakeTimelineEvent;

  function makeEncryptedRoom(id: string, liveEvents: FakeEvent[], olderEvents: FakeEvent[] = []) {
    const room = makeFakeRoom(id, 'Crypto Room', liveEvents);
    const live = room.getLiveTimeline();
    const older = {
      getEvents: () => olderEvents,
      getPaginationToken: () => null,
      getNeighbouringTimeline: () => null,
      setNeighbouringTimeline: vi.fn(),
      getTimelineSet: () => ({ getRoomId: () => id }),
      getRoomId: () => id,
    };
    const setNeighbouringTimeline = live.setNeighbouringTimeline as (dir: string, n: unknown) => void;
    mocks.paginateEventTimeline.mockImplementation(() => {
      setNeighbouringTimeline('b', older);
      return Promise.resolve(true);
    });
    return room;
  }

  function renderEncrypted(
    room: ReturnType<typeof makeEncryptedRoom>,
    crypto: unknown = { isEncryptionEnabledInRoom: vi.fn(async () => false), prepareToEncrypt: vi.fn() },
  ) {
    const client = {
      getUserId: () => '@alice:matrix.org',
      getRooms: () => [room],
      getRoom: (roomId: string) => (roomId === room.roomId ? room : null),
      on: vi.fn(),
      off: vi.fn(),
      sendMessage: mocks.sendMessage,
      sendReadReceipt: mocks.sendReadReceipt,
      paginateEventTimeline: mocks.paginateEventTimeline,
      getCrypto: () => crypto,
    };
    mocks.getMatrixClient.mockReturnValue(client);
    useChatStore.setState({ activeRoomId: room.roomId, error: null });
    return renderView();
  }

  it('retries decryption for undecrypted events while paginating', async () => {
    const events = [
      encryptedEvent('$e0:matrix.org', { shouldAttempt: false }),
      encryptedEvent('$e1:matrix.org'),
    ];
    const room = makeEncryptedRoom('!enc:matrix.org', [events[0]], [events[1]]);
    renderEncrypted(room, { isEncryptionEnabledInRoom: vi.fn(async () => true), prepareToEncrypt: vi.fn() });

    fireEvent.click(await screen.findByText('Load older messages'));

    await waitFor(() => expect(events[1].attemptDecryption).toHaveBeenCalled());
    expect(events[1].attemptDecryption).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isRetry: true }),
    );
    // Already decrypted events are not retried.
    expect(events[0].attemptDecryption).not.toHaveBeenCalled();
  });

  it('renders the decrypted body once Event.decrypted fires', async () => {
    // Undecrypted encrypted events carry no visible payload; the SDK mutates
    // the same event object on successful decryption.
    const event = {
      getId: () => '$e0:matrix.org',
      getType: () => 'm.room.encrypted',
      getSender: () => '@bob:matrix.org',
      getTs: () => 2,
      getContent: () => ({}),
      isRedacted: () => false,
      status: null,
    };
    const room = makeEncryptedRoom('!enc:matrix.org', [event]);
    renderEncrypted(room);

    const client = mocks.getMatrixClient();
    const handlers = (client.on as ReturnType<typeof vi.fn>).mock.calls
      .filter(([name]) => name === 'Event.decrypted')
      .map(([, handler]) => handler as Handler);
    (event as Record<string, unknown>).getType = () => 'm.room.message';
    (event as Record<string, unknown>).getContent = () => ({
      msgtype: 'm.text',
      body: 'dec $e0:matrix.org',
    });
    for (const handler of handlers) handler(event);

    expect(await screen.findByText('dec $e0:matrix.org')).toBeTruthy();
  });

  it('shows the encrypted badge when crypto is enabled in the room', async () => {
    const room = makeEncryptedRoom('!enc:matrix.org', [encryptedEvent('$e0:matrix.org')]);
    const crypto = {
      isEncryptionEnabledInRoom: vi.fn(async () => true),
      prepareToEncrypt: vi.fn(),
    };
    renderEncrypted(room, crypto);

    expect(await screen.findByText('Encrypted')).toBeTruthy();
    expect(crypto.isEncryptionEnabledInRoom).toHaveBeenCalledWith('!enc:matrix.org');
  });

  it('calls prepareToEncrypt before sending, at most once per minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 25 });
    try {
      const room = makeEncryptedRoom('!enc:matrix.org', [encryptedEvent('$e0:matrix.org')]);
      const crypto = {
        isEncryptionEnabledInRoom: vi.fn(async () => false),
        prepareToEncrypt: vi.fn(),
      };
      renderEncrypted(room, crypto);

      const input = await screen.findByLabelText('Message');
      fireEvent.change(input, { target: { value: 'one' } });
      fireEvent.click(screen.getByTitle('Send'));
      fireEvent.change(input, { target: { value: 'two' } });
      fireEvent.click(screen.getByTitle('Send'));
      await waitFor(() => expect(crypto.prepareToEncrypt).toHaveBeenCalledTimes(1));

      await vi.advanceTimersByTimeAsync(61_000);
      fireEvent.change(input, { target: { value: 'three' } });
      fireEvent.click(screen.getByTitle('Send'));
      await waitFor(() => expect(crypto.prepareToEncrypt).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });
});
