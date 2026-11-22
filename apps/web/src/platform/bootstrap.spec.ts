import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserPersistence } from './browser';
import {
  bootstrapSession,
  getBootstrapSnapshot,
  subscribeBootstrap,
  _resetBootstrapForTesting,
} from './bootstrap';
import { _resetRuntimeForTesting } from './runtime';
import { getAccount, getActiveUserId, _resetForTesting } from '../client/accounts';
import { useAuthStore, _resetAuthStoreForTesting } from '../app/stores/auth-store';

const USER = '@alice:example.org';
const alice = {
  userId: USER,
  accessToken: 'tok-1',
  deviceId: 'DEV-A',
  homeserverUrl: 'https://matrix.example.org',
};

function seedStorage(): void {
  localStorage.setItem('sewernet_accounts', JSON.stringify({ [USER]: alice }));
  localStorage.setItem('sewernet_active_account', USER);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  _resetForTesting();
  _resetRuntimeForTesting();
  _resetAuthStoreForTesting();
  _resetBootstrapForTesting();
});

describe('bootstrapSession', () => {
  it('bootstrap_never_resumes_before_load', async () => {
    seedStorage();

    let releaseLoad!: () => void;
    const originalLoad = BrowserPersistence.prototype.load;
    vi.spyOn(BrowserPersistence.prototype, 'load').mockImplementation(function (
      this: BrowserPersistence,
    ) {
      return new Promise((resolve) => {
        releaseLoad = () => resolve(originalLoad.call(this));
      });
    });

    const listeners = vi.fn();
    subscribeBootstrap(listeners);

    const booting = bootstrapSession();

    expect(getBootstrapSnapshot().status).toBe('loading');
    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('loading');
    // Nothing is published while the durable snapshot is still loading.
    expect(() => getActiveUserId()).toThrow();

    await vi.waitFor(() => expect(releaseLoad).toBeTypeOf('function'));
    releaseLoad();
    await booting;


    expect(getBootstrapSnapshot().status).toBe('ready');
    expect(useAuthStore.getState().status).toBe('ready');
    expect(useAuthStore.getState().credentials).toEqual(alice);
    expect(getAccount(USER)).toEqual(alice);
    expect(listeners).toHaveBeenCalled();
  });

  it('bootstrap_failure_has_retry_no_fallback', async () => {
    seedStorage();
    localStorage.setItem('sewernet:auth', '{"session":"legacy"}');

    vi.spyOn(BrowserPersistence.prototype, 'load').mockRejectedValueOnce(
      new Error('Malformed accounts data'),
    );

    await expect(bootstrapSession()).rejects.toThrow('Malformed accounts data');

    expect(getBootstrapSnapshot().status).toBe('error');
    expect(getBootstrapSnapshot().error).toContain('Malformed');
    // A failed load is an error, not an empty account: nothing published and
    // no fallback to browser storage happened behind our back.
    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('storage-error');
    expect(localStorage.getItem('sewernet_accounts')).toContain(alice.accessToken);

    await bootstrapSession();

    expect(getBootstrapSnapshot().status).toBe('ready');
    expect(getBootstrapSnapshot().error).toBeNull();
    expect(useAuthStore.getState().credentials).toEqual(alice);
    // Legacy key is removed only after platform selection + a successful load.
    expect(localStorage.getItem('sewernet:auth')).toBeNull();
  });
});
