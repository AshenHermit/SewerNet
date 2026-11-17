import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { ChatView } from './chat-view';

// useRooms reads the SDK singleton for the room display name.
vi.mock('../../client/init-matrix', () => ({
  getMatrixClient: vi.fn(() => ({
    getUserId: () => '@alice:matrix.org',
    getRooms: () => [
      { roomId: '!r1:matrix.org', name: 'SDK Room', getMyMembership: () => 'join' },
    ],
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

type FetchHandler = (url: string, init: RequestInit) => Response;

function installFetch(handler: FetchHandler): { url: string; init: RequestInit }[] {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = global.fetch;
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  void original;
  return calls;
}

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

const session = {
  homeserverUrl: 'https://matrix.org',
  accessToken: 'at',
  userId: '@alice:matrix.org',
  deviceId: 'DEV',
};

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => {
  localStorage.removeItem('sewernet:auth');
  useAuthStore.setState({ credentials: null, session: null });
  useChatStore.setState({
    activeRoomId: null,
    messages: {},
    error: null,
    loadingMessages: false,
  });
});

describe('ChatView', () => {
  it('делает 6 параллельных запросов при открытии комнаты и берёт имя из /state', async () => {
    const calls = installFetch((url) => {
      if (url.includes('/state/m.room.name')) {
        return new Response(JSON.stringify({ name: 'State Room' }), {
          status: 200,
        });
      }
      if (url.includes('/messages')) {
        return new Response(
          JSON.stringify({
            chunk: [
              {
                event_id: '$last:matrix.org',
                type: 'm.room.message',
                sender: '@alice:matrix.org',
                origin_server_ts: 1,
                content: { msgtype: 'm.text', body: 'hi' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/members')) {
        return new Response(JSON.stringify({ chunk: [] }), { status: 200 });
      }
      if (url.includes('/threads')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes('/aliases')) {
        return new Response(JSON.stringify({ aliases: [] }), { status: 200 });
      }
      if (url.includes('/read_markers')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    useAuthStore.setState({ credentials: session, session });
    useChatStore.setState({
      activeRoomId: '!r1:matrix.org',
    });

    renderView();

    await waitFor(() => expect(calls).toHaveLength(6));

    const urls = calls.map((c) => c.url);
    expect(
      urls.some((u) => u.includes('/rooms/!r1%3Amatrix.org/state/m.room.name')),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes('/rooms/!r1%3Amatrix.org/messages')),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes('/rooms/!r1%3Amatrix.org/members')),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes('/rooms/!r1%3Amatrix.org/threads')),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes('/rooms/!r1%3Amatrix.org/aliases')),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes('/rooms/!r1%3Amatrix.org/read_markers')),
    ).toBe(true);

    // read_markers шлёт JSON-тело с m.fully_read / m.read.
    const markersCall = calls.find((c) => c.url.includes('/read_markers'));
    expect(markersCall).toBeDefined();
    if (markersCall) {
      expect(JSON.parse(String(markersCall.init.body))).toEqual({
        'm.fully_read': '$last:matrix.org',
        'm.read': '$last:matrix.org',
      });
    }

    // Имя комнаты теперь из SDK-списка (useRooms).
    await waitFor(() => expect(screen.getByText('SDK Room')).toBeTruthy());
  });

  it('загружает историю, даже если /threads и /aliases недоступны', async () => {
    installFetch((url) => {
      if (url.includes('/state/m.room.name')) {
        return new Response(JSON.stringify({ name: 'State Room' }), {
          status: 200,
        });
      }
      if (url.includes('/messages')) {
        return new Response(
          JSON.stringify({
            chunk: [
              {
                event_id: '$last:matrix.org',
                type: 'm.room.message',
                sender: '@alice:matrix.org',
                origin_server_ts: 1,
                content: { msgtype: 'm.text', body: 'hi' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/read_markers')) {
        return new Response(
          JSON.stringify({ errcode: 'M_FORBIDDEN', error: 'Forbidden' }),
          { status: 403 },
        );
      }
      // /members, /threads, /aliases — 403 на чужих/старых homeserver'ах.
      return new Response(
        JSON.stringify({ errcode: 'M_FORBIDDEN', error: 'Forbidden' }),
        { status: 403 },
      );
    });
    useAuthStore.setState({ credentials: session, session });
    useChatStore.setState({
      activeRoomId: '!r1:matrix.org',
    });

    renderView();

    await waitFor(() =>
      expect(useChatStore.getState().messages['!r1:matrix.org']).toHaveLength(1),
    );
    expect(useChatStore.getState().error).toBeNull();
  });
});
