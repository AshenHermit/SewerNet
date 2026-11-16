import { afterEach, describe, expect, it } from 'vitest';
import {
  discoverMasAuth,
  MatrixApiError,
  matrixClient,
  normalizeHomeserver,
  refreshOauthToken,
  type AuthSession,
} from './matrix-client';

interface FetchCall {
  url: string;
  init: RequestInit;
}

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function installFetch(handler: FetchHandler): FetchCall[] {
  const calls: FetchCall[] = [];
  const original = global.fetch;
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  void original;
  return calls;
}

const session: AuthSession = {
  homeserverUrl: 'https://matrix.org',
  accessToken: 'expired',
  userId: '@alice:matrix.org',
  deviceId: 'DEV',
  issuer: 'https://account.matrix.org/',
  clientId: 'cid',
  refreshToken: 'rt_old',
};

afterEach(() => {
  localStorage.removeItem('sewernet:auth');
});

describe('normalizeHomeserver', () => {
  it('resolves a schemeless homeserver via the well-known document', async () => {
    installFetch((url) => {
      if (url === 'https://matrix.org/.well-known/matrix/client') {
        return new Response(
          JSON.stringify({
            'm.homeserver': { base_url: 'https://matrix-client.matrix.org' },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    await expect(normalizeHomeserver('matrix.org')).resolves.toBe(
      'https://matrix-client.matrix.org',
    );
  });

  it('keeps a homeserver without a well-known entry as-is', async () => {
    installFetch(() => new Response('{}', { status: 404 }));
    await expect(normalizeHomeserver('https://example.org')).resolves.toBe(
      'https://example.org',
    );
  });
});

describe('discoverMasAuth', () => {
  const oidcMetadata = {
    issuer: 'https://account.matrix.org/',
    authorizationEndpoint: 'https://account.matrix.org/authorize',
    tokenEndpoint: 'https://account.matrix.org/oauth2/token',
    registrationEndpoint: 'https://account.matrix.org/oauth2/registration',
    responseModesSupported: ['form_post', 'query', 'fragment'],
    promptValuesSupported: ['login', 'create'],
  };

  it('falls back to the well-known authentication block and backend discovery', async () => {
    installFetch((url) => {
      if (url === 'https://matrix.org/_matrix/client/v1/auth_metadata') {
        return new Response('not found', { status: 404 });
      }
      if (url === 'https://matrix.org/.well-known/matrix/client') {
        return new Response(
          JSON.stringify({
            authentication: { type: 'oauth', issuer: 'https://account.matrix.org/' },
          }),
          { status: 200 },
        );
      }
      if (url === '/api/matrix/oauth/discover') {
        return new Response(JSON.stringify(oidcMetadata), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    await expect(discoverMasAuth('https://matrix.org')).resolves.toEqual(
      oidcMetadata,
    );
  });

  it('returns null when the homeserver announces no issuer', async () => {
    installFetch(
      () => new Response('not found', { status: 404 }),
    );
    await expect(discoverMasAuth('https://matrix.org')).resolves.toBeNull();
  });
});

describe('matrixClient OAuth endpoints', () => {
  it('registers a client and returns its client_id', async () => {
    const calls = installFetch((url) => {
      if (url === '/api/matrix/oauth/register') {
        return new Response(JSON.stringify({ clientId: 'cid_123' }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 404 });
    });
    const clientId = await matrixClient.registerOauthClient(
      'https://account.matrix.org/',
      'http://localhost:4200/callback',
    );
    expect(clientId).toBe('cid_123');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      issuer: 'https://account.matrix.org/',
      redirectUri: 'http://localhost:4200/callback',
    });
  });

  it('exchanges an authorization code for tokens', async () => {
    const calls = installFetch((url) => {
      if (url === '/api/matrix/oauth/token') {
        return new Response(JSON.stringify({ accessToken: 'at', refreshToken: 'rt' }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 404 });
    });
    const tokens = await matrixClient.exchangeOauthCode({
      issuer: 'https://account.matrix.org/',
      clientId: 'cid',
      redirectUri: 'http://localhost:4200/callback',
      code: 'abc',
      codeVerifier: 'ver',
      grantType: 'authorization_code',
    });
    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      grantType: 'authorization_code',
      code: 'abc',
    });
  });
});

describe('auto-refresh on 401', () => {
  it('refreshes once and retries the request with the new token', async () => {
    const calls = installFetch((url, init) => {
      if (url === '/api/matrix/oauth/token') {
        return new Response(
          JSON.stringify({
            accessToken: 'new_at',
            refreshToken: 'rt_new',
            expiresIn: 3600,
          }),
          { status: 200 },
        );
      }
      if (url === '/api/matrix/rooms') {
        const authorization = (init.headers as Record<string, string>)['Authorization'];
        return authorization === 'Bearer new_at'
          ? new Response(JSON.stringify({ joined_rooms: ['!r'] }), { status: 200 })
          : new Response(
              JSON.stringify({ errcode: 'M_UNKNOWN_TOKEN', error: 'Invalid token' }),
              { status: 401 },
            );
      }
      return new Response('{}', { status: 404 });
    });

    const result = await matrixClient.getJoinedRooms(session);

    expect(result).toEqual({ joined_rooms: ['!r'] });
    const tokenCall = calls.find((call) => call.url === '/api/matrix/oauth/token');
    expect(tokenCall).toBeDefined();
    expect(JSON.parse(String(tokenCall?.init.body))).toEqual({
      issuer: 'https://account.matrix.org/',
      clientId: 'cid',
      grantType: 'refresh_token',
      refreshToken: 'rt_old',
    });
    const roomsCalls = calls.filter((call) => call.url === '/api/matrix/rooms');
    expect(roomsCalls).toHaveLength(2);
    expect((roomsCalls[1]?.init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer new_at',
    );
  });

  it('does not refresh twice when the retry is also unauthorized', async () => {
    const calls = installFetch((url) => {
      if (url === '/api/matrix/oauth/token') {
        return new Response(JSON.stringify({ accessToken: 'new_at' }), {
          status: 200,
        });
      }
      if (url === '/api/matrix/rooms') {
        return new Response(
          JSON.stringify({ errcode: 'M_UNKNOWN_TOKEN', error: 'Invalid token' }),
          { status: 401 },
        );
      }
      return new Response('{}', { status: 404 });
    });

    await expect(matrixClient.getJoinedRooms(session)).rejects.toThrow(MatrixApiError);
    expect(calls.filter((call) => call.url === '/api/matrix/oauth/token')).toHaveLength(1);
  });

  it('shares one refresh between parallel 401s (single flight)', async () => {
    let tokenCalls = 0;
    installFetch((url, init) => {
      if (url === '/api/matrix/oauth/token') {
        tokenCalls += 1;
        return tokenCalls === 1
          ? new Response(
              JSON.stringify({
                accessToken: 'new_at',
                refreshToken: 'rt_new',
                expiresIn: 3600,
              }),
              { status: 200 },
            )
          : new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      if (url === '/api/matrix/rooms') {
        const authorization = (init.headers as Record<string, string>)['Authorization'];
        return authorization === 'Bearer new_at'
          ? new Response(JSON.stringify({ joined_rooms: ['!r'] }), { status: 200 })
          : new Response(
              JSON.stringify({ errcode: 'M_UNKNOWN_TOKEN', error: 'bad' }),
              { status: 401 },
            );
      }
      return new Response('{}', { status: 404 });
    });

    // MAS rotates refresh tokens: a second parallel grant would fail with
    // invalid_grant and log the user out, so both requests must share one.
    const [a, b] = await Promise.all([
      matrixClient.getJoinedRooms(session),
      matrixClient.getJoinedRooms(session),
    ]);
    expect(a).toEqual({ joined_rooms: ['!r'] });
    expect(b).toEqual({ joined_rooms: ['!r'] });
    expect(tokenCalls).toBe(1);
  });

  it('surfaces the original 401 when the refresh itself fails', async () => {
    const calls = installFetch((url) => {
      if (url === '/api/matrix/oauth/token') {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
        });
      }
      if (url === '/api/matrix/rooms') {
        return new Response(
          JSON.stringify({ errcode: 'M_UNKNOWN_TOKEN', error: 'Invalid token' }),
          { status: 401 },
        );
      }
      return new Response('{}', { status: 404 });
    });

    await expect(refreshOauthToken(session)).rejects.toMatchObject({ status: 400 });
    expect(calls.filter((call) => call.url === '/api/matrix/rooms')).toHaveLength(0);
  });
});
