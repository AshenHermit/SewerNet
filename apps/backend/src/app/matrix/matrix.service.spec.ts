import { HttpException } from '@nestjs/common';
import { MatrixService } from './matrix.service';

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
