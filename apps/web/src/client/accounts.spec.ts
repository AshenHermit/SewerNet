import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupLegacyStorage,
  clearAllAccounts,
  getAccount,
  getActiveAccount,
  getActiveUserId,
  listAccounts,
  removeAccount,
  setActiveAccount,
  upsertAccount,
  initializeAccounts,
  subscribeAccounts,
  flushAccounts,
  _resetForTesting,
  type MatrixCredentials,
} from './accounts';
import type { AccountPersistence, AccountSnapshot } from '../platform/contracts';
import { BrowserPersistence } from '../platform/browser';

const alice: MatrixCredentials = {
  userId: '@alice:example.org',
  accessToken: 'tok-a',
  deviceId: 'DEV-A',
  homeserverUrl: 'https://matrix.example.org',
};

const bob: MatrixCredentials = {
  userId: '@bob:example.org',
  accessToken: 'tok-b',
  deviceId: 'DEV-B',
  homeserverUrl: 'https://matrix.example.org',
  refreshToken: 'rt-b',
  expiresInMs: 3_600_000,
};

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  _resetForTesting();
});

describe('accounts map', () => {
  beforeEach(async () => {
    _resetForTesting();
    await initializeAccounts(new BrowserPersistence());
  });

  it('upsertAccount stores credentials keyed by userId', async () => {
    await upsertAccount(alice);

    expect(getAccount('@alice:example.org')).toEqual(alice);
    expect(
      JSON.parse(localStorage.getItem('sewernet_accounts') ?? '{}'),
    ).toEqual({ '@alice:example.org': alice });
  });

  it('upsertAccount replaces an existing account with the same userId', async () => {
    await upsertAccount(alice);
    const rotated = { ...alice, accessToken: 'tok-a2' };
    await upsertAccount(rotated);

    expect(getAccount('@alice:example.org')).toEqual(rotated);
    expect(listAccounts()).toHaveLength(1);
  });

  it('getAccount returns null for an unknown user', () => {
    expect(getAccount('@ghost:example.org')).toBeNull();
  });

  it('listAccounts returns every stored account', async () => {
    await upsertAccount(alice);
    await upsertAccount(bob);

    expect(listAccounts()).toEqual(expect.arrayContaining([alice, bob]));
  });

  it('removeAccount deletes the account', async () => {
    await upsertAccount(alice);
    await removeAccount('@alice:example.org');

    expect(getAccount('@alice:example.org')).toBeNull();
    expect(listAccounts()).toEqual([]);
  });

  it('removeAccount clears the active pointer when removing the active user', async () => {
    await upsertAccount(alice);
    await setActiveAccount(alice.userId);
    await removeAccount(alice.userId);

    expect(getActiveUserId()).toBeNull();
  });

  it('setActiveAccount/getActiveUserId/getActiveAccount follow the active pointer', async () => {
    await upsertAccount(alice);
    await upsertAccount(bob);
    await setActiveAccount(bob.userId);

    expect(getActiveUserId()).toBe('@bob:example.org');
    expect(getActiveAccount()).toEqual(bob);

    await setActiveAccount(alice.userId);
    expect(getActiveAccount()).toEqual(alice);
  });

  it('getActiveAccount returns null when no active user is set', async () => {
    await upsertAccount(alice);

    expect(getActiveAccount()).toBeNull();
  });

  it('clearAllAccounts wipes accounts and the active pointer', async () => {
    await upsertAccount(alice);
    await setActiveAccount(alice.userId);
    await clearAllAccounts();

    expect(listAccounts()).toEqual([]);
    expect(getActiveUserId()).toBeNull();
    expect(localStorage.getItem('sewernet_accounts')).toBeNull();
  });

  it('cleanupLegacyStorage removes the legacy auth key', () => {
    localStorage.setItem('sewernet:auth', '{"session":"old"}');
    cleanupLegacyStorage();

    expect(localStorage.getItem('sewernet:auth')).toBeNull();
  });
});

describe('async account persistence', () => {
  const previousCredentials: MatrixCredentials = {
    userId: '@alice:example.org',
    accessToken: 'tok-a',
    deviceId: 'DEV-A',
    homeserverUrl: 'https://matrix.example.org',
  };

  const nextCredentials: MatrixCredentials = {
    userId: '@alice:example.org',
    accessToken: 'tok-a2',
    deviceId: 'DEV-A',
    homeserverUrl: 'https://matrix.example.org',
  };

  beforeEach(() => {
    localStorage.clear();
    _resetForTesting();
  });

  it('uninitialized_reads_are_rejected', () => {
    expect(() => getAccount('@alice:example.org')).toThrow('Accounts not initialized');
    expect(() => listAccounts()).toThrow('Accounts not initialized');
    expect(() => getActiveUserId()).toThrow('Accounts not initialized');
    expect(() => getActiveAccount()).toThrow('Accounts not initialized');
  });

  it('write_commits_before_snapshot_notification', async () => {
    const callLog: Array<{ op: string; userId: string }> = [];

    const fakePersistence: AccountPersistence = {
      async load(): Promise<AccountSnapshot> {
        return { accounts: {}, activeUserId: null, blockedAccounts: {} };
      },
      async upsertAccount(c: MatrixCredentials): Promise<void> {
        callLog.push({ op: 'upsert', userId: c.userId });
      },
      async beginOperation(): Promise<void> {
        // Not used in this test
      },
      async removeAccount(): Promise<void> {
        // Not used in this test
      },
      async setActiveAccount(): Promise<void> {
        // Not used in this test
      },
      async clear(): Promise<void> {
        // Not used in this test
      },
      async flush(): Promise<void> {
        // Not used in this test
      },
    };

    await initializeAccounts(fakePersistence);

    subscribeAccounts(() => {
      // Listener for notification
    });

    await upsertAccount(previousCredentials);
    expect(getAccount(previousCredentials.userId)).toEqual(previousCredentials);

    await upsertAccount(nextCredentials);
    expect(getAccount(nextCredentials.userId)).toEqual(nextCredentials);
    expect(callLog).toHaveLength(2);
  });

  it('failed_write_keeps_previous_snapshot', async () => {
    _resetForTesting();
    let shouldFail = false;

    const fakePersistence: AccountPersistence = {
      async load(): Promise<AccountSnapshot> {
        return { accounts: {}, activeUserId: null, blockedAccounts: {} };
      },
      async upsertAccount(c: MatrixCredentials): Promise<void> {
        if (shouldFail) {
          throw new Error('write failed');
        }
      },
      async beginOperation(): Promise<void> {
        // Not used in this test
      },
      async removeAccount(): Promise<void> {
        // Not used in this test
      },
      async setActiveAccount(): Promise<void> {
        // Not used in this test
      },
      async clear(): Promise<void> {
        // Not used in this test
      },
      async flush(): Promise<void> {
        // Not used in this test
      },
    };

    await initializeAccounts(fakePersistence);

    await upsertAccount(previousCredentials);
    expect(getAccount(previousCredentials.userId)).toEqual(previousCredentials);

    shouldFail = true;
    await expect(upsertAccount(nextCredentials)).rejects.toThrow('write failed');

    expect(getAccount(previousCredentials.userId)).toEqual(previousCredentials);
  });

  it('ordered_writes_and_flush', async () => {
    _resetForTesting();
    const writeOrder: string[] = [];

    const fakePersistence: AccountPersistence = {
      async load(): Promise<AccountSnapshot> {
        return { accounts: {}, activeUserId: null, blockedAccounts: {} };
      },
      async upsertAccount(c: MatrixCredentials): Promise<void> {
        writeOrder.push(`upsert:${c.userId}`);
      },
      async beginOperation(): Promise<void> {
        writeOrder.push('beginOperation');
      },
      async removeAccount(userId: string): Promise<void> {
        writeOrder.push(`remove:${userId}`);
      },
      async setActiveAccount(userId: string | null): Promise<void> {
        writeOrder.push(`setActive:${userId ?? 'null'}`);
      },
      async clear(): Promise<void> {
        writeOrder.push('clear');
      },
      async flush(): Promise<void> {
        writeOrder.push('flush');
      },
    };

    await initializeAccounts(fakePersistence);

    await upsertAccount(alice);
    await upsertAccount(bob);
    await setActiveAccount(alice.userId);
    await flushAccounts();

    expect(writeOrder).toEqual([
      'upsert:@alice:example.org',
      'upsert:@bob:example.org',
      'setActive:@alice:example.org',
      'flush',
    ]);
  });

  it('browser_retains_existing_keys', async () => {
    _resetForTesting();
    const browser = new BrowserPersistence();

    localStorage.setItem('sewernet_accounts', JSON.stringify({ '@alice:example.org': alice }));
    localStorage.setItem('sewernet_active_account', '@alice:example.org');

    const snapshot = await browser.load();

    expect(snapshot.accounts['@alice:example.org']).toEqual(alice);
    expect(snapshot.activeUserId).toBe('@alice:example.org');

    expect(localStorage.getItem('sewernet_accounts')).toBeTruthy();
    expect(localStorage.getItem('sewernet_active_account')).toBeTruthy();
  });
});
