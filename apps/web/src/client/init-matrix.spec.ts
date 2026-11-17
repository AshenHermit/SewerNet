import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, httpMock, storeArgs, refresherCtorArgs, refresherDoRefresh } = vi.hoisted(
  () => ({
    createClientMock: vi.fn(),
    httpMock: vi.fn(),
    storeArgs: [] as unknown[],
    refresherCtorArgs: [] as unknown[],
    refresherDoRefresh: vi.fn(),
  }),
);

vi.mock('matrix-js-sdk', () => {
  class FakeIndexedDbStore {
    constructor(opts: unknown) {
      storeArgs.push(opts);
    }
  }
  return {
    createClient: (opts: unknown) => createClientMock(opts),
    Method: { Post: 'POST', Get: 'GET' },
    IndexedDBStore: FakeIndexedDbStore,
  };
});

vi.mock('matrix-js-sdk/lib/oidc', () => {
  class FakeOidcTokenRefresher {
    doRefreshAccessToken = refresherDoRefresh;
    constructor(...args: unknown[]) {
      refresherCtorArgs.push(args);
    }
  }
  return { OidcTokenRefresher: FakeOidcTokenRefresher };
});

import {
  createAuthenticatedClient,
  createStore,
  getMatrixClient,
  hasActiveClient,
  loginWithPassword,
} from './init-matrix';
import type { MatrixCredentials, OidcSession } from './accounts';

const HS = 'https://h.example';
const USER = '@u:h.example';

function loginResponse(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    access_token: 'at1',
    device_id: 'dev1',
    refresh_token: 'rt1',
    expires_in_ms: 3_600_000,
    well_known: { 'm.homeserver': { base_url: 'https://resolved.example' } },
    ...overrides,
  };
}

function readAccounts(): Record<string, MatrixCredentials> {
  return JSON.parse(localStorage.getItem('sewernet_accounts') ?? '{}');
}

function lastCreateOpts(): Record<string, unknown> {
  return createClientMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  localStorage.clear();
  createClientMock.mockReset();
  httpMock.mockReset();
  refresherDoRefresh.mockReset();
  refresherDoRefresh.mockResolvedValue({ accessToken: 'at2', refreshToken: 'rt2' });
  refresherCtorArgs.length = 0;
  storeArgs.length = 0;
  createClientMock.mockReturnValue({
    http: { request: httpMock },
    getUserId: () => USER,
    getSyncState: () => 'SYNCING',
  });
});

describe('loginWithPassword', () => {
  it('sends a password login with refresh token and persists resolved credentials', async () => {
    const loginRequest = vi.fn().mockResolvedValue(loginResponse());
    createClientMock.mockReturnValueOnce({ loginRequest });

    const creds = await loginWithPassword('alice', 'secret', HS);

    expect(loginRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: 'alice' },
        password: 'secret',
        device_id: expect.any(String),
        refresh_token: true,
        initial_device_display_name: 'SewerNet Web',
      }),
    );
    expect(creds).toEqual({
      userId: USER,
      accessToken: 'at1',
      deviceId: 'dev1',
      homeserverUrl: 'https://resolved.example',
      refreshToken: 'rt1',
      expiresInMs: 3_600_000,
      oidc: undefined,
    });
    const accounts = readAccounts();
    expect(accounts[USER]).toMatchObject({ accessToken: 'at1', homeserverUrl: 'https://resolved.example' });
    expect(localStorage.getItem('sewernet_active_account')).toBe(USER);
  });

  it('falls back to the input url when the response has no well_known', async () => {
    createClientMock
      .mockReturnValueOnce({ loginRequest: vi.fn().mockResolvedValue(loginResponse({ well_known: undefined })) });
    const creds = await loginWithPassword('alice', 'secret', HS);
    expect(creds.homeserverUrl).toBe(HS);
  });

  it('requests persistent storage when available', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'storage', {
      value: { persist, persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
    });
    createClientMock.mockReturnValueOnce({ loginRequest: vi.fn().mockResolvedValue(loginResponse()) });
    await loginWithPassword('alice', 'secret', HS);
    expect(persist).toHaveBeenCalled();
  });
});

describe('createAuthenticatedClient', () => {
  const base = {
    baseUrl: HS,
    userId: USER,
    accessToken: 'at1',
    deviceId: 'dev1',
  };

  it('passes auth flags and token refresh wiring to createClient', () => {
    createAuthenticatedClient({ ...base, store: { fake: true }, refreshToken: 'rt1' });
    const opts = lastCreateOpts();
    expect(opts).toMatchObject({
      baseUrl: HS,
      userId: USER,
      accessToken: 'at1',
      deviceId: 'dev1',
      store: { fake: true },
      cryptoCallbacks: {},
      timelineSupport: true,
      fallbackICEServerAllowed: true,
      refreshToken: 'rt1',
      tokenRefreshFunction: expect.any(Function),
    });
  });

  it('omits tokenRefreshFunction when there is no refresh token', () => {
    createAuthenticatedClient({ ...base });
    expect(lastCreateOpts().tokenRefreshFunction).toBeUndefined();
  });

  it('refreshes through OidcTokenRefresher for oidc sessions and persists new tokens', async () => {
    const oidc: OidcSession = {
      issuer: 'https://issuer.example',
      clientId: 'cid',
      redirectUri: 'http://localhost:4200/oidc/callback',
      responseMode: 'query',
      idTokenClaims: { sub: USER },
    };
    createAuthenticatedClient({ ...base, refreshToken: 'rt1', oidc });
    const opts = lastCreateOpts();
    expect(refresherCtorArgs[0]).toEqual([
      oidc.issuer,
      oidc.clientId,
      oidc.redirectUri,
      'dev1',
      oidc.idTokenClaims,
    ]);

    refresherDoRefresh.mockResolvedValue({ accessToken: 'at2', refreshToken: 'rt2', expiry: new Date(Date.now() + 1_800_000) });
    const tokens = await (opts.tokenRefreshFunction as (t: string) => Promise<{ accessToken: string }>)('rt1');
    expect(refresherDoRefresh).toHaveBeenCalledWith('rt1');
    expect(tokens.accessToken).toBe('at2');
    expect(readAccounts()[USER]).toMatchObject({
      accessToken: 'at2',
      refreshToken: 'rt2',
      oidc,
      expiresInMs: expect.closeTo(1_800_000, -4),
    });
  });

  it('refreshes natively with v3 prefix and persists the result', async () => {
    createAuthenticatedClient({ ...base, refreshToken: 'rt1' });
    const opts = lastCreateOpts();
    httpMock.mockResolvedValue({ access_token: 'at3', refresh_token: 'rt3', expires_in_ms: 7_200_000 });

    const tokens = await (opts.tokenRefreshFunction as (t: string) => Promise<{ accessToken: string }>)('rt1');

    expect(httpMock).toHaveBeenCalledWith('POST', '/refresh', undefined, { refresh_token: 'rt1' }, { prefix: '/_matrix/client/v3' });
    expect(tokens).toMatchObject({ accessToken: 'at3', refreshToken: 'rt3' });
    expect(readAccounts()[USER]).toMatchObject({ accessToken: 'at3', refreshToken: 'rt3', expiresInMs: 7_200_000 });
  });

  it('retries native refresh with v1 prefix on M_UNRECOGNIZED', async () => {
    createAuthenticatedClient({ ...base, refreshToken: 'rt1' });
    const opts = lastCreateOpts();
    httpMock
      .mockRejectedValueOnce({ errcode: 'M_UNRECOGNIZED' })
      .mockResolvedValueOnce({ access_token: 'at4', refresh_token: 'rt4', expires_in_ms: 7_200_000 });

    const tokens = await (opts.tokenRefreshFunction as (t: string) => Promise<{ accessToken: string }>)('rt1');

    expect(httpMock).toHaveBeenCalledTimes(2);
    expect(httpMock).toHaveBeenLastCalledWith('POST', '/refresh', undefined, { refresh_token: 'rt1' }, { prefix: '/_matrix/client/v1' });
    expect(tokens.accessToken).toBe('at4');
  });
});

describe('createStore', () => {
  it('creates an IndexedDBStore named per user', () => {
    createStore(USER);
    expect(storeArgs.at(-1)).toEqual({ dbName: `sewernet-store-${USER}` });
  });
});

describe('singleton', () => {
  it('throws when no client has been built yet', () => {
    expect(hasActiveClient()).toBe(false);
    expect(() => getMatrixClient()).toThrow();
  });
});
