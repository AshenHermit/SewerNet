import { render, waitFor } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { ChatScreen } from './chat-screen';

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
  useAuthStore.setState({ session: null });
  useChatStore.setState({ rooms: [], error: null, loadingRooms: false });
});

describe('ChatScreen', () => {
  it('загружает комнаты с именами за один вызов getSyncedRooms', async () => {
    const rooms = [
      {
        room_id: '!r1:matrix.org',
        name: 'Room 1',
        preview: 'hi',
        lastTs: 100,
        avatar: 'a',
        topic: 't',
      },
      { room_id: '!r2:matrix.org', lastTs: 50 },
    ];
    const calls = installFetch((url) =>
      url === '/api/matrix/sync/room-list'
        ? new Response(JSON.stringify(rooms), { status: 200 })
        : new Response('{}', { status: 404 }),
    );
    useAuthStore.setState({ session });

    renderScreen();

    await waitFor(() => expect(useChatStore.getState().rooms).toHaveLength(2));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/matrix/sync/room-list');
    expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer at',
    );
    expect((calls[0]?.init.headers as Record<string, string>)['x-matrix-homeserver']).toBe(
      'https://matrix.org',
    );

    const stored = useChatStore.getState().rooms;
    const r1 = stored.find((r) => r.id === '!r1:matrix.org');
    const r2 = stored.find((r) => r.id === '!r2:matrix.org');
    expect(r1?.name).toBe('Room 1');
    expect(r1?.preview).toBe('hi');
    expect(r1?.lastTs).toBe(100);
    expect(r1?.avatar).toBe('a');
    expect(r1?.topic).toBe('t');
    expect(r2?.name).toBe('!…:matrix.org');
    expect(r2?.lastTs).toBe(50);
    // Сортировка по lastTs по убыванию.
    expect(stored[0].id).toBe('!r1:matrix.org');
  });

  it('ставит ошибку в стор при неудаче getSyncedRooms', async () => {
    installFetch(() =>
      new Response(
        JSON.stringify({ errcode: 'M_UNKNOWN', error: 'boom' }),
        { status: 500 },
      ),
    );
    useAuthStore.setState({ session });

    renderScreen();

    await waitFor(() =>
      expect(useChatStore.getState().error).not.toBeNull(),
    );
  });
});
