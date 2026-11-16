import { HttpException } from '@nestjs/common';
import { MatrixService } from './matrix.service';
import type { SlidingSyncRoomListRequest } from '@sewer-net/types';

describe('MatrixService', () => {
  let service: MatrixService;

  beforeEach(() => {
    service = new MatrixService();
  });

  describe('proxy', () => {
    it('rejects an invalid homeserver URL', async () => {
      await expect(service.proxy('not-a-url', '/_matrix/client/v3/login'))
        .rejects.toThrow(HttpException);
    });

    it('rejects a missing homeserver URL', async () => {
      await expect(
        service.proxy('', '/_matrix/client/v3/login'),
      ).rejects.toThrow(HttpException);
    });

    it('strips trailing slashes from the homeserver URL', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const fetchMock = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ user_id: '@a:b' }), {
          status: 200,
        });
      }) as unknown as typeof fetch;
      const original = global.fetch;
      global.fetch = fetchMock;
      try {
        const result = await service.proxy('https://matrix.org///', '/whoami');
        expect(result).toEqual({ user_id: '@a:b' });
        expect(calls[0]?.url).toBe('https://matrix.org/whoami');
      } finally {
        global.fetch = original;
      }
    });

    it('propagates homeserver errors as HttpException', async () => {
      const original = global.fetch;
      global.fetch = (async () =>
        new Response(JSON.stringify({ errcode: 'M_UNKNOWN_TOKEN', error: 'Invalid token' }), {
          status: 401,
        })) as unknown as typeof fetch;
      try {
        await expect(
          service.proxy('https://matrix.org', '/account/whoami', {
            token: 'bad',
          }),
        ).rejects.toMatchObject({
          status: 401,
          response: { errcode: 'M_UNKNOWN_TOKEN' },
        });
      } finally {
        global.fetch = original;
      }
    });

    it('aborts and throws 504 when homeserver does not respond in time', async () => {
      const original = global.fetch;
      global.fetch = (async (_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
          init.signal?.addEventListener('abort', abort, { once: true });
          if (init.signal?.aborted) abort();
          // never resolves -> forces timeout
        });
      }) as unknown as typeof fetch;
      try {
        await expect(
          service.proxy('https://matrix.org', '/account/whoami', {
            token: 'bad',
            timeoutMs: 50,
          }),
        ).rejects.toMatchObject({
          status: 504,
          response: { errcode: 'M_REQUEST_TIMEOUT' },
        });
      } finally {
        global.fetch = original;
      }
    });

    it('throws 502 when fetch rejects with a network error', async () => {
      const original = global.fetch;
      global.fetch = (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch;
      try {
        await expect(
          service.proxy('https://matrix.org', '/account/whoami', {
            token: 'bad',
          }),
        ).rejects.toMatchObject({
          status: 502,
          response: { errcode: 'M_REQUEST_FAILED' },
        });
      } finally {
        global.fetch = original;
      }
    });
  });

  describe('getRoomState', () => {
    it('proxies the room state event to the homeserver', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ name: 'My room' }), {
          status: 200,
        });
      }) as unknown as typeof fetch;
      try {
        const result = await service.getRoomState(
          'https://matrix.org',
          '!room:matrix.org',
          'm.room.name',
          'token',
        );
        expect(result).toEqual({ name: 'My room' });
        expect(calls[0]?.url).toBe(
          'https://matrix.org/_matrix/client/v3/rooms/!room%3Amatrix.org/state/m.room.name',
        );
        expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe(
          'Bearer token',
        );
      } finally {
        global.fetch = original;
      }
    });

    it('rejects an invalid homeserver URL', async () => {
      await expect(
        service.getRoomState('not-a-url', '!room:matrix.org', 'm.room.name'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('syncRoomList', () => {
    it('posts a room-list sliding-sync body and returns the parsed response', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ pos: '123', rooms: {} }), {
          status: 200,
        });
      }) as unknown as typeof fetch;
      try {
        const result = await service.syncRoomList('https://matrix.org', 'token');
        expect(result).toEqual({ pos: '123', rooms: {} });
        expect(calls[0]?.url).toBe(
          'https://matrix.org/_matrix/client/unstable/org.matrix.simplified_msc3575/sync',
        );
        expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe(
          'Bearer token',
        );
        expect((calls[0]?.init.headers as Record<string, string>)['Content-Type']).toBe(
          'application/json',
        );
        const body = JSON.parse(String(calls[0]?.init.body)) as SlidingSyncRoomListRequest;
        expect(body.conn_id).toBe('room-list');
        expect(body.lists.all_rooms.ranges).toEqual([[0, 19]]);
        expect(body.lists.all_rooms.required_state).toContain('m.room.name');
        expect(body.lists.all_rooms.timeline_limit).toBe(1);
      } finally {
        global.fetch = original;
      }
    });

    it('throws HttpException when the homeserver returns 404', async () => {
      const original = global.fetch;
      global.fetch = (async () =>
        new Response(
          JSON.stringify({ errcode: 'M_UNRECOGNIZED', error: 'Unknown endpoint' }),
          { status: 404 },
        )) as unknown as typeof fetch;
      try {
        await expect(
          service.syncRoomList('https://matrix.org', 'token'),
        ).rejects.toMatchObject({ status: 404 });
      } finally {
        global.fetch = original;
      }
    });
  });

  describe('room endpoints', () => {
    const roomId = '!room:matrix.org';

    it('gets room members', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ chunk: [] }), { status: 200 });
      }) as unknown as typeof fetch;
      try {
        await service.getRoomMembers('https://matrix.org', roomId, 'token');
        expect(calls[0]?.url).toBe(
          'https://matrix.org/_matrix/client/v3/rooms/!room%3Amatrix.org/members',
        );
        expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe(
          'Bearer token',
        );
      } finally {
        global.fetch = original;
      }
    });

    it('gets room threads with limit=30', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ chunk: [] }), { status: 200 });
      }) as unknown as typeof fetch;
      try {
        await service.getRoomThreads('https://matrix.org', roomId, 'token');
        expect(calls[0]?.url).toBe(
          'https://matrix.org/_matrix/client/v1/rooms/!room%3Amatrix.org/threads?limit=30',
        );
      } finally {
        global.fetch = original;
      }
    });

    it('gets room aliases', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ aliases: [] }), { status: 200 });
      }) as unknown as typeof fetch;
      try {
        await service.getRoomAliases('https://matrix.org', roomId, 'token');
        expect(calls[0]?.url).toBe(
          'https://matrix.org/_matrix/client/v3/rooms/!room%3Amatrix.org/aliases',
        );
      } finally {
        global.fetch = original;
      }
    });

    it('sets read markers with JSON body', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({}), { status: 200 });
      }) as unknown as typeof fetch;
      try {
        await service.setReadMarkers('https://matrix.org', roomId, 'token', {
          'm.fully_read': 'evt1',
          'm.read': 'evt2',
        });
        expect(calls[0]?.url).toBe(
          'https://matrix.org/_matrix/client/v3/rooms/!room%3Amatrix.org/read_markers',
        );
        expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe(
          'Bearer token',
        );
        expect((calls[0]?.init.headers as Record<string, string>)['Content-Type']).toBe(
          'application/json',
        );
        expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
          'm.fully_read': 'evt1',
          'm.read': 'evt2',
        });
      } finally {
        global.fetch = original;
      }
    });
  });

  describe('login', () => {
    it('posts password login payload to the homeserver', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const original = global.fetch;
      global.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ access_token: 't' }), {
          status: 200,
        });
      }) as unknown as typeof fetch;
      try {
        await service.login('https://matrix.org', {
          user: 'alice',
          password: 'secret',
        });
        expect(calls[0]?.url).toBe('https://matrix.org/_matrix/client/v3/login');
        const body = JSON.parse(String(calls[0]?.init.body)) as {
          type: string;
          identifier: { type: string; user: string };
          initial_device_display_name: string;
        };
        expect(body.type).toBe('m.login.password');
        expect(body.identifier).toEqual({ type: 'm.id.user', user: 'alice' });
        expect(body.initial_device_display_name).toBe('SewerNet');
      } finally {
        global.fetch = original;
      }
    });
  });
});
