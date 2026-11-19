import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginAccountOperation,
  getAccount,
  getActiveUserId,
  getBlockedAccounts,
  initializeAccounts,
  saveAndActivateAccount,
  setActiveAccount,
  upsertAccount,
  _resetForTesting,
  type MatrixCredentials,
} from './accounts';
import type { AccountPersistence, AccountSnapshot } from '../platform/contracts';
import { BrowserPersistence } from '../platform/browser';
import {
  captureSession,
  commitLogin,
  getSessionEpoch,
  logoutAccount,
  logoutCurrent,
  publishSessionToSw,
  refreshSessionTokens,
  registerLiveSessionOps,
  _resetSessionForTesting,
} from './session';
import { getPlatformKind, initializePlatform, _resetRuntimeForTesting } from '../platform/runtime';
import {
  hydrateAuthStore,
  useAuthStore,
  _resetAuthStoreForTesting,
} from '../app/stores/auth-store';

// Tests that need the browser media-proxy path must select the browser runtime.
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

const USER = '@alice:example.org';
const OTHER_USER = '@bob:example.org';
const DEV = 'DEV-A';
const BLOCKED_KEY = 'sewernet_blocked_accounts_v1';

const alice: MatrixCredentials = {
  userId: USER,
  accessToken: 'tok-1',
  deviceId: DEV,
  homeserverUrl: 'https://matrix.example.org',
  refreshToken: 'rt-1',
};

const bob: MatrixCredentials = {
  userId: OTHER_USER,
  accessToken: 'tok-b',
  deviceId: 'DEV-B',
  homeserverUrl: 'https://matrix.example.org',
  refreshToken: 'rt-b',
};

/** In-memory durable store: every operation is a real awaited write. */
class FakePersistence implements AccountPersistence {
  snapshot: AccountSnapshot = { accounts: {}, activeUserId: null, blockedAccounts: {} };
  upsertCalls: MatrixCredentials[] = [];
  barrierCalls: Array<{ userId: string; deviceId: string; reason: string }> = [];
  removeCalls: string[] = [];
  failBegin = false;
  failUpsert = false;
  failRemove = false;
  deferUpserts = false;
  private pendingUpserts: Array<() => void> = [];

  async load(): Promise<AccountSnapshot> {
    return {
      accounts: { ...this.snapshot.accounts },
      activeUserId: this.snapshot.activeUserId,
      blockedAccounts: { ...this.snapshot.blockedAccounts },
    };
  }

  async upsertAccount(c: MatrixCredentials): Promise<void> {
    this.upsertCalls.push(c);
    if (this.deferUpserts) {
      await new Promise<void>((resolve) => this.pendingUpserts.push(resolve));
    }
    if (this.failUpsert) {
      throw new Error('upsert failed');
    }
    this.snapshot.accounts[c.userId] = c;
    delete this.snapshot.blockedAccounts[c.userId];
  }

  releaseUpserts(): void {
    for (const release of this.pendingUpserts.splice(0)) {
      release();
    }
  }

  async beginOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void> {
    this.barrierCalls.push({ userId, deviceId, reason });
    if (this.failBegin) {
      throw new Error('barrier failed');
    }
    this.snapshot.blockedAccounts[userId] = { deviceId, reason };
  }

  async removeAccount(userId: string): Promise<void> {
    this.removeCalls.push(userId);
    if (this.failRemove) {
      throw new Error('delete failed');
    }
    delete this.snapshot.accounts[userId];
    delete this.snapshot.blockedAccounts[userId];
    if (this.snapshot.activeUserId === userId) {
      this.snapshot.activeUserId = null;
    }
  }

  async setActiveAccount(userId: string | null): Promise<void> {
    this.snapshot.activeUserId = userId;
  }

  async clear(): Promise<void> {
    this.snapshot = { accounts: {}, activeUserId: null, blockedAccounts: {} };
  }

  async flush(): Promise<void> {
    // nothing to flush
  }
}

class FailingCommitBrowserPersistence extends BrowserPersistence {
  failUpsert = false;

  override async upsertAccount(c: MatrixCredentials): Promise<void> {
    if (this.failUpsert) {
      throw new Error('commit failed');
    }
    await super.upsertAccount(c);
  }
}

function resetAll(): void {
  localStorage.clear();
  removeServiceWorker();
  _resetForTesting();
  _resetSessionForTesting();
  _resetAuthStoreForTesting();
  _resetRuntimeForTesting();
}

/** A worker that is registered but never becomes active and never looks up. */
function installHangingServiceWorker(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: new Promise(() => undefined),
      getRegistration: vi.fn(() => new Promise(() => undefined)),
      register: vi.fn(),
    },
  });
}

function removeServiceWorker(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  resetAll();
  vi.restoreAllMocks();
});

describe('durable login', () => {
  it('login_writes_once_before_auth_publish', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    hydrateAuthStore();
    persistence.deferUpserts = true;

    const committing = commitLogin(alice);

    await flushMicrotasks();
    // Nothing published while the durable write is pending.
    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('ready');
    expect(persistence.snapshot.accounts[USER]).toBeUndefined();

    persistence.releaseUpserts();
    await committing;

    expect(persistence.upsertCalls).toHaveLength(1);
    expect(persistence.snapshot.accounts[USER]).toEqual(alice);
    expect(useAuthStore.getState().credentials).toEqual(alice);
    expect(useAuthStore.getState().status).toBe('ready');
  });
});

describe('guarded refresh', () => {
  it('rotation_barrier_precedes_network_and_blocks_crash_resume', async () => {
    await initializeAccounts(new BrowserPersistence());
    await saveAndActivateAccount(alice);
    hydrateAuthStore();

    const tokenEndpoint = vi.fn(async () => {
      const barrier = JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? '{}');
      expect(barrier[USER]).toEqual({ deviceId: DEV, reason: 'refresh' });
      return { accessToken: 'tok-2', refreshToken: 'rt-2' };
    });

    const tokens = await refreshSessionTokens(captureSession(USER, DEV), tokenEndpoint);

    expect(tokens.accessToken).toBe('tok-2');
    expect(JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? '{}')).toEqual({});
    expect(getAccount(USER)?.accessToken).toBe('tok-2');

    // Simulate a crash between the barrier write and the commit, then restart.
    await beginAccountOperation(USER, DEV, 'refresh');
    _resetForTesting();
    _resetSessionForTesting();
    _resetAuthStoreForTesting();
    await initializeAccounts(new BrowserPersistence());
    hydrateAuthStore();

    expect(getBlockedAccounts()[USER]).toEqual({ deviceId: DEV, reason: 'refresh' });
    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('storage-error');
  });

  it('barrier_failure_never_calls_token_endpoint', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();
    persistence.failBegin = true;

    const stopped: string[] = [];
    registerLiveSessionOps({
      stop: (userId) => stopped.push(userId),
      getClient: () => null,
      deleteLocalData: async () => undefined,
      getActiveUserId: () => USER,
    });
    const tokenEndpoint = vi.fn();

    const refreshWithFailingBarrier = async (): Promise<void> => {
      await refreshSessionTokens(captureSession(USER, DEV), tokenEndpoint);
    };

    await expect(refreshWithFailingBarrier()).rejects.toThrow();
    expect(tokenEndpoint).not.toHaveBeenCalled();
    expect(stopped).toEqual([USER]);
    expect(useAuthStore.getState().credentials).toBeNull();
  });

  it('rotated_refresh_waits_for_commit', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();
    persistence.deferUpserts = true;

    const tokenEndpoint = vi.fn(async () => ({ accessToken: 'tok-2', refreshToken: 'rt-2' }));
    let settled = false;
    const refresh = refreshSessionTokens(captureSession(USER, DEV), tokenEndpoint).then((tokens) => {
      settled = true;
      return tokens;
    });

    await vi.waitFor(() => expect(tokenEndpoint).toHaveBeenCalledTimes(1));
    await flushMicrotasks();

    // Tokens are not returned and the store is not published before the commit.
    expect(settled).toBe(false);
    expect(useAuthStore.getState().credentials?.accessToken).toBe('tok-1');
    expect(persistence.snapshot.accounts[USER].accessToken).toBe('tok-1');

    persistence.releaseUpserts();
    const tokens = await refresh;

    expect(tokens.accessToken).toBe('tok-2');
    expect(useAuthStore.getState().credentials?.accessToken).toBe('tok-2');
  });

  it('failed_rotation_stops_and_blocks_restart', async () => {
    const persistence = new FailingCommitBrowserPersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();
    persistence.failUpsert = true;

    const stopped: string[] = [];
    registerLiveSessionOps({
      stop: (userId) => stopped.push(userId),
      getClient: () => null,
      deleteLocalData: async () => undefined,
      getActiveUserId: () => USER,
    });

    await expect(
      refreshSessionTokens(captureSession(USER, DEV), async () => ({
        accessToken: 'tok-2',
        refreshToken: 'rt-2',
      })),
    ).rejects.toThrow('commit failed');

    expect(stopped).toEqual([USER]);
    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('storage-error');

    // Restart loads the persisted snapshot instead of reusing memory.
    _resetForTesting();
    _resetSessionForTesting();
    _resetAuthStoreForTesting();
    await initializeAccounts(new BrowserPersistence());
    hydrateAuthStore();

    expect(getBlockedAccounts()[USER].reason).toBe('refresh');
    expect(useAuthStore.getState().credentials).toBeNull();
  });

  it('late_refresh_after_logout_or_new_device_cannot_resurrect', async () => {
    await initializeAccounts(new BrowserPersistence());
    await saveAndActivateAccount(alice);
    hydrateAuthStore();

    // 1) Logout while the refresh is in flight.
    let releaseNetwork!: (tokens: { accessToken: string }) => void;
    const pendingNetwork = new Promise<{ accessToken: string }>((resolve) => {
      releaseNetwork = resolve;
    });
    const lateRefresh = refreshSessionTokens(
      captureSession(USER, DEV),
      () => pendingNetwork,
    );
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? '{}')[USER]).toBeTruthy(),
    );

    const loggingOut = logoutAccount(USER);
    releaseNetwork({ accessToken: 'late-token' });
    await expect(lateRefresh).rejects.toThrow();
    await loggingOut;

    expect(getAccount(USER)).toBeNull();
    expect(
      JSON.parse(localStorage.getItem('sewernet_accounts') ?? '{}')[USER],
    ).toBeUndefined();

    // 2) A new login on another device while a refresh is in flight.
    await saveAndActivateAccount(alice);
    hydrateAuthStore();
    let releaseSecond!: (tokens: { accessToken: string }) => void;
    const secondNetwork = new Promise<{ accessToken: string }>((resolve) => {
      releaseSecond = resolve;
    });
    const staleRefresh = refreshSessionTokens(captureSession(USER, DEV), () => secondNetwork);
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? '{}')[USER]).toBeTruthy(),
    );

    await commitLogin({
      ...alice,
      deviceId: 'DEV-2',
      accessToken: 'tok-new',
      refreshToken: 'rt-new',
    });
    releaseSecond({ accessToken: 'late-token' });
    await expect(staleRefresh).rejects.toThrow();

    expect(getAccount(USER)?.deviceId).toBe('DEV-2');
    expect(getAccount(USER)?.accessToken).toBe('tok-new');
    expect(useAuthStore.getState().credentials?.accessToken).toBe('tok-new');
  });

  it('concurrent_refreshes_share_one_token_request', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();

    let release!: (tokens: { accessToken: string; refreshToken?: string }) => void;
    const network = new Promise<{ accessToken: string; refreshToken?: string }>((resolve) => {
      release = resolve;
    });
    const tokenEndpoint = vi.fn(() => network);
    const capture = captureSession(USER, DEV);
    const upsertsBefore = persistence.upsertCalls.length;

    const first = refreshSessionTokens(capture, tokenEndpoint);
    const second = refreshSessionTokens(capture, tokenEndpoint);

    // Two 401s share one rotating-token redemption; the second never races it.
    await vi.waitFor(() => expect(tokenEndpoint).toHaveBeenCalledTimes(1));
    expect(persistence.barrierCalls).toHaveLength(1);

    release({ accessToken: 'tok-2', refreshToken: 'rt-2' });
    const [a, b] = await Promise.all([first, second]);

    expect(a.accessToken).toBe('tok-2');
    expect(b.accessToken).toBe('tok-2');
    expect(tokenEndpoint).toHaveBeenCalledTimes(1);
    expect(persistence.upsertCalls).toHaveLength(upsertsBefore + 1);
    expect(getAccount(USER)?.accessToken).toBe('tok-2');
  });

  it('stale_capture_does_not_join_a_newer_refresh', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();

    const stale = captureSession(USER, DEV);
    // A fresh login tombstones the stale capture without changing the device.
    await commitLogin(alice);
    const fresh = captureSession(USER, DEV);
    expect(fresh.epoch).toBeGreaterThan(stale.epoch);

    let release!: (tokens: { accessToken: string }) => void;
    const freshNetwork = new Promise<{ accessToken: string }>((resolve) => {
      release = resolve;
    });
    const freshEndpoint = vi.fn(() => freshNetwork);
    const freshRefresh = refreshSessionTokens(fresh, freshEndpoint);
    await vi.waitFor(() => expect(freshEndpoint).toHaveBeenCalledTimes(1));

    const staleEndpoint = vi.fn(async () => ({ accessToken: 'stale-token' }));
    await expect(refreshSessionTokens(stale, staleEndpoint)).rejects.toThrow();
    expect(staleEndpoint).not.toHaveBeenCalled();
    expect(freshEndpoint).toHaveBeenCalledTimes(1);

    release({ accessToken: 'tok-2' });
    await expect(freshRefresh).resolves.toMatchObject({ accessToken: 'tok-2' });
  });
});

describe('logout', () => {
  it('logout_without_client_still_removes_credentials', async () => {
    await initializeAccounts(new BrowserPersistence());
    await saveAndActivateAccount(alice);
    hydrateAuthStore();

    await logoutCurrent();

    expect(getAccount(USER)).toBeNull();
    expect(getActiveUserId()).toBeNull();
    expect(localStorage.getItem('sewernet_accounts')).toBe('{}');
    expect(useAuthStore.getState().credentials).toBeNull();
  });

  it('delete_failure_is_visible', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();
    persistence.failRemove = true;

    await expect(logoutCurrent()).rejects.toThrow('delete failed');

    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('storage-error');
    expect(useAuthStore.getState().error).toContain('delete');
    // The delete barrier records the unfinished operation for the next start.
    expect(persistence.snapshot.blockedAccounts[USER]).toEqual({
      deviceId: DEV,
      reason: 'delete',
    });
  });

  it('logout_preserves_other_accounts', async () => {
    await initializeAccounts(new BrowserPersistence());
    await saveAndActivateAccount(alice);
    await saveAndActivateAccount(bob);
    await setActiveAccount(USER);
    hydrateAuthStore();

    await logoutCurrent();

    // Only the active account is gone, in storage and in the memory snapshot.
    expect(getAccount(USER)).toBeNull();
    expect(getAccount(OTHER_USER)).toEqual(bob);
    const stored = JSON.parse(localStorage.getItem('sewernet_accounts') ?? '{}');
    expect(stored[USER]).toBeUndefined();
    expect(stored[OTHER_USER]).toEqual(bob);
    expect(getActiveUserId()).not.toBe(USER);
    expect(getActiveUserId()).toBeNull();
    expect(useAuthStore.getState().credentials).toBeNull();
  });

  it('logout_completes_when_the_service_worker_lookup_hangs', async () => {
    await initializePlatform();
    expect(getPlatformKind()).toBe('browser');
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();
    installHangingServiceWorker();

    await logoutAccount(USER);

    // A worker that never answers cannot delay the barrier or the deletion.
    expect(persistence.barrierCalls).toEqual([
      { userId: USER, deviceId: DEV, reason: 'delete' },
    ]);
    expect(persistence.removeCalls).toEqual([USER]);
    expect(persistence.snapshot.accounts[USER]).toBeUndefined();
    expect(getAccount(USER)).toBeNull();
    expect(useAuthStore.getState().credentials).toBeNull();
  });

  it('delayed_logout_worker_clear_cannot_erase_a_new_login_session', async () => {
    await initializePlatform();
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    hydrateAuthStore();

    let releaseOldLookup!: (registration: { active: ServiceWorker }) => void;
    const oldLookup = new Promise<{ active: ServiceWorker }>((resolve) => {
      releaseOldLookup = resolve;
    });
    let lookupCount = 0;
    let workerSession: { accessToken: string; baseUrl: string } | null = null;
    const worker = {
      postMessage: vi.fn((message: { type: string; accessToken?: string; baseUrl?: string }) => {
        workerSession = message.type === 'setSession'
          ? { accessToken: message.accessToken ?? '', baseUrl: message.baseUrl ?? '' }
          : null;
      }),
    } as unknown as ServiceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(() => {
          lookupCount += 1;
          return lookupCount === 1 ? oldLookup : Promise.resolve({ active: worker });
        }),
        register: vi.fn(),
      },
    });

    await logoutAccount(USER);
    await vi.waitFor(() => expect(lookupCount).toBe(1));
    expect(getAccount(USER)).toBeNull();

    const newLogin = { ...alice, accessToken: 'tok-new', refreshToken: 'rt-new' };
    await commitLogin(newLogin);
    await publishSessionToSw(newLogin.accessToken, newLogin.homeserverUrl);
    expect(workerSession).toEqual({
      accessToken: 'tok-new',
      baseUrl: newLogin.homeserverUrl,
    });

    releaseOldLookup({ active: worker });
    // Let the delayed logout lookup finish; its stale clear must be discarded.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(workerSession).toEqual({
      accessToken: 'tok-new',
      baseUrl: newLogin.homeserverUrl,
    });
  });
});

describe('session epochs', () => {
  it('commitLogin invalidates older captures for the same user', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    const before = getSessionEpoch(USER);
    await commitLogin(alice);
    expect(getSessionEpoch(USER)).toBeGreaterThan(before);
    expect(getSessionEpoch('@other:example.org')).toBe(0);
  });

  it('upserted tokens are visible through the committed snapshot', async () => {
    const persistence = new FakePersistence();
    await initializeAccounts(persistence);
    await saveAndActivateAccount(alice);
    await upsertAccount({ ...alice, accessToken: 'tok-9' });
    await setActiveAccount(USER);
    expect(getAccount(USER)?.accessToken).toBe('tok-9');
  });
});
