import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixCredentials, OidcSession } from './accounts';

const {
  createClientMock,
  httpMock,
  storeArgs,
  refresherCtorArgs,
  refresherDoRefresh,
  storeStartupMock,
  initAsyncMock,
  onMock,
  offMock,
  stopClientMock,
  logoutMock,
  initRustCryptoMock,
  startClientMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  httpMock: vi.fn(),
  storeArgs: [] as unknown[],
  refresherCtorArgs: [] as unknown[],
  refresherDoRefresh: vi.fn(),
  storeStartupMock: vi.fn(),
  initAsyncMock: vi.fn(),
  onMock: vi.fn(),
  offMock: vi.fn(),
  stopClientMock: vi.fn(),
  logoutMock: vi.fn(),
  initRustCryptoMock: vi.fn(),
  startClientMock: vi.fn(),
}));

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({
  initAsync: initAsyncMock,
}));

vi.mock('matrix-js-sdk', () => {
  class FakeIndexedDbStore {
    startup = storeStartupMock;
    destroy = vi.fn();
    constructor(opts: unknown) {
      storeArgs.push(opts);
    }
  }
  return {
    createClient: (opts: unknown) => createClientMock(opts),
    Method: { Post: 'POST', Get: 'GET' },
    ClientEvent: { Sync: 'sync' },
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

// The module under test holds module-level singletons (_client,
// resumePromise, cryptoInitPromise); re-import it fresh per test.
let matrix: typeof import('./init-matrix');

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

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  matrix = await import('./init-matrix');
  createClientMock.mockReset();
  httpMock.mockReset();
  refresherDoRefresh.mockReset();
  refresherDoRefresh.mockResolvedValue({ accessToken: 'at2', refreshToken: 'rt2' });
  refresherCtorArgs.length = 0;
  storeArgs.length = 0;
  // Each createClient call gets a fake whose getUserId reflects its own opts,
  // so cross-account tests can distinguish clients.
  createClientMock.mockImplementation((opts: Record<string, unknown>) => ({
    http: { request: httpMock },
    getUserId: () => opts?.userId,
    getSyncState: () => 'SYNCING',
    on: onMock,
    off: offMock,
    stopClient: stopClientMock,
    logout: logoutMock,
    initRustCrypto: initRustCryptoMock,
    startClient: startClientMock,
  }));
  syncHandlers.clear();
  onMock
    .mockReset()
    .mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'sync') syncHandlers.add(handler);
    });
  offMock
    .mockReset()
    .mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      syncHandlers.delete(handler);
    });
  storeStartupMock.mockReset().mockResolvedValue(undefined);
  initAsyncMock.mockReset().mockResolvedValue(undefined);
  stopClientMock.mockReset();
  logoutMock.mockReset().mockResolvedValue(undefined);
  initRustCryptoMock.mockReset().mockResolvedValue(undefined);
  startClientMock.mockReset().mockResolvedValue(undefined);
});

const CREDENTIALS: MatrixCredentials = {
  userId: USER,
  accessToken: 'at1',
  deviceId: 'dev1',
  homeserverUrl: HS,
  refreshToken: 'rt1',
};

const syncHandlers = new Set<(...args: unknown[]) => void>();

function lastSyncHandler(): (state: string) => void {
  const handler = [...syncHandlers].at(-1);
  if (!handler) throw new Error('no sync handler registered');
  return handler as (state: string) => void;
}

describe('loginWithPassword', () => {
  it('sends a password login with refresh token and persists resolved credentials', async () => {
    const loginRequest = vi.fn().mockResolvedValue(loginResponse());
    createClientMock.mockReturnValueOnce({ loginRequest });

    const creds = await matrix.loginWithPassword('alice', 'secret', HS);

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

  it('updates useAuthStore credentials on successful login', async () => {
    const loginRequest = vi.fn().mockResolvedValue(loginResponse());
    createClientMock.mockReturnValueOnce({ loginRequest });
    const setCredentials = vi.fn();
    vi.doMock('../app/stores/auth-store', () => ({
      useAuthStore: { getState: vi.fn(() => ({ setCredentials })) },
    }));
    vi.resetModules();
    const fresh = await import('./init-matrix');

    await fresh.loginWithPassword('bob', 'pwd', HS);
    expect(setCredentials).toHaveBeenCalledTimes(1);
    expect(setCredentials.mock.calls[0][0]).toMatchObject({
      userId: USER,
      accessToken: 'at1',
    });
  });

  it('falls back to the input url when the response has no well_known', async () => {
    createClientMock
      .mockReturnValueOnce({ loginRequest: vi.fn().mockResolvedValue(loginResponse({ well_known: undefined })) });
    const creds = await matrix.loginWithPassword('alice', 'secret', HS);
    expect(creds.homeserverUrl).toBe(HS);
  });

  it('requests persistent storage when available', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'storage', {
      value: { persist, persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
    });
    createClientMock.mockReturnValueOnce({ loginRequest: vi.fn().mockResolvedValue(loginResponse()) });
    await matrix.loginWithPassword('alice', 'secret', HS);
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
    matrix.createAuthenticatedClient(
      { ...base, store: { fake: true }, refreshToken: 'rt1' } as unknown as Parameters<typeof matrix.createAuthenticatedClient>[0],
    );
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
    matrix.createAuthenticatedClient({ ...base });
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
    matrix.createAuthenticatedClient({ ...base, refreshToken: 'rt1', oidc });
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
    matrix.createAuthenticatedClient({ ...base, refreshToken: 'rt1' });
    const opts = lastCreateOpts();
    httpMock.mockResolvedValue({ access_token: 'at3', refresh_token: 'rt3', expires_in_ms: 7_200_000 });

    const tokens = await (opts.tokenRefreshFunction as (t: string) => Promise<{ accessToken: string }>)('rt1');

    expect(httpMock).toHaveBeenCalledWith('POST', '/refresh', undefined, { refresh_token: 'rt1' }, { prefix: '/_matrix/client/v3' });
    expect(tokens).toMatchObject({ accessToken: 'at3', refreshToken: 'rt3' });
    expect(readAccounts()[USER]).toMatchObject({
      accessToken: 'at3',
      refreshToken: 'rt3',
      expiresInMs: expect.closeTo(7_200_000, -4),
    });
  });

  it('retries native refresh with v1 prefix on M_UNRECOGNIZED', async () => {
    matrix.createAuthenticatedClient({ ...base, refreshToken: 'rt1' });
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
  it('creates an IndexedDBStore named per user with indexedDB option', () => {
    matrix.createStore(USER);
    const opts = storeArgs.at(-1) as Record<string, unknown>;
    expect(opts).toHaveProperty('dbName', `sewernet-store-${USER}`);
    expect(opts).toHaveProperty('indexedDB', undefined);
  });
});

describe('singleton', () => {
  it('throws when no client has been built yet', () => {
    expect(matrix.hasActiveClient()).toBe(false);
    expect(() => matrix.getMatrixClient()).toThrow();
  });
});

describe('resume', () => {
  it('builds the client: store startup + wasm init, rust crypto, startClient, one-shot first sync', async () => {
    const onFirstSync = vi.fn();
    const client = await matrix.resume(CREDENTIALS, onFirstSync);

    expect(storeStartupMock).toHaveBeenCalledTimes(1);
    expect(initAsyncMock).toHaveBeenCalledTimes(1);
    expect(initRustCryptoMock).toHaveBeenCalledWith({ cryptoDatabasePrefix: `sewernet-js-sdk-${USER}` });
    expect(startClientMock).toHaveBeenCalledWith({
      initialSyncLimit: 20,
      lazyLoadMembers: true,
      clientWellKnownPollPeriod: 86_400,
    });
    expect(matrix.getMatrixClient()).toBe(client);

    const handler = lastSyncHandler();
    (handler as (state: string) => void)('PREPARED');
    expect(onFirstSync).toHaveBeenCalledTimes(1);
    expect(syncHandlers.has(handler as (...args: unknown[]) => void)).toBe(false);
    expect(offMock).toHaveBeenCalledWith('sync', handler);
  });

  it('fires onFirstSync on CATCHUP as well', async () => {
    const onFirstSync = vi.fn();
    await matrix.resume(CREDENTIALS, onFirstSync);
    lastSyncHandler()('CATCHUP');
    expect(onFirstSync).toHaveBeenCalledTimes(1);
  });

  it('returns the existing client for the same user with an active sync', async () => {
    const first = await matrix.resume(CREDENTIALS);
    createClientMock.mockClear();
    const second = await matrix.resume({ ...CREDENTIALS, accessToken: 'at2' });
    expect(second).toBe(first);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent resumes into a single build', async () => {
    const [a, b] = await Promise.all([matrix.resume(CREDENTIALS), matrix.resume(CREDENTIALS)]);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('does not leak clients between concurrent resumes for different users', async () => {
    const userA = '@alice:h.example';
    const userB = '@bob:h.example';

    const promiseA = matrix.resume({ ...CREDENTIALS, userId: userA });
    const promiseB = matrix.resume({ ...CREDENTIALS, userId: userB });

    const [clientA, clientB] = await Promise.all([promiseA, promiseB]);

    expect(clientA.getUserId()).toBe(userA);
    expect(clientB.getUserId()).toBe(userB);
    expect(clientA).not.toBe(clientB);
  });
});

describe('logoutCurrent', () => {
  it('stops the client, clears indexed databases and drops the account', async () => {
    await matrix.resume(CREDENTIALS);
    const deleteDatabase = vi.fn(() => ({ addEventListener: (_t: string, cb: () => void) => cb() }));
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => [{ name: `sewernet-js-sdk-${USER}-crypto` }]),
      deleteDatabase,
    });

    await matrix.logoutCurrent();

    expect(stopClientMock).toHaveBeenCalled();
    expect(logoutMock).toHaveBeenCalledWith(true);
    expect(matrix.hasActiveClient()).toBe(false);
    expect(readAccounts()[USER]).toBeUndefined();
    const deleted = deleteDatabase.mock.calls.map((c: unknown[]) => c[0]);
    expect(deleted).toContain(`sewernet-store-${USER}`);
    expect(deleted).toContain(`sewernet-js-sdk-${USER}-crypto`);
    vi.unstubAllGlobals();
  });

  it('resolves logout when the homeserver hangs past 10 seconds', async () => {
    vi.useFakeTimers();
    try {
      await matrix.resume(CREDENTIALS);
      logoutMock.mockReturnValue(new Promise(() => undefined));
      vi.stubGlobal('indexedDB', {
        databases: vi.fn(async () => []),
        deleteDatabase: () => ({ addEventListener: (_t: string, cb: () => void) => cb() }),
      });
      const pending = matrix.logoutCurrent();
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;
      expect(matrix.hasActiveClient()).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('stops the client and clears it if logout occurs during startClient', async () => {
    let startClientResolve: () => void;
    startClientMock.mockReturnValue(
      new Promise<void>((resolve) => {
        startClientResolve = resolve;
      }),
    );

    const resumePromise = matrix.resume(CREDENTIALS);

    // Wait for buildClient to reach startClient
    await vi.waitFor(() => expect(startClientMock).toHaveBeenCalled());

    // Call logout while startClient is pending
    const logoutPromise = matrix.logoutCurrent();

    // startClient eventually finishes
    startClientResolve!();

    await Promise.all([resumePromise, logoutPromise]);

    expect(stopClientMock).toHaveBeenCalled();
    expect(matrix.hasActiveClient()).toBe(false);
  });
});

describe('prewarmCrypto', () => {
  it('initializes the rust crypto wasm module', async () => {
    await matrix.prewarmCrypto();
    expect(initAsyncMock).toHaveBeenCalled();
  });
});
