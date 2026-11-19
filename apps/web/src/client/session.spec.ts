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
  refreshSessionTokens,
  registerLiveSessionOps,
  _resetSessionForTesting,
} from './session';
import {
  hydrateAuthStore,
  useAuthStore,
  _resetAuthStoreForTesting,
} from '../app/stores/auth-store';

const USER = '@alice:example.org';
const DEV = 'DEV-A';
const BLOCKED_KEY = 'sewernet_blocked_accounts_v1';

const alice: MatrixCredentials = {
  userId: USER,
  accessToken: 'tok-1',
  deviceId: DEV,
  homeserverUrl: 'https://matrix.example.org',
  refreshToken: 'rt-1',
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
  _resetForTesting();
  _resetSessionForTesting();
  _resetAuthStoreForTesting();
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
