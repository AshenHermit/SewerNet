import { beforeEach, describe, expect, it } from 'vitest';
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
  type MatrixCredentials,
} from './accounts';

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
});

describe('accounts map', () => {
  it('upsertAccount stores credentials keyed by userId', () => {
    upsertAccount(alice);

    expect(getAccount('@alice:example.org')).toEqual(alice);
    expect(
      JSON.parse(localStorage.getItem('sewernet_accounts') ?? '{}'),
    ).toEqual({ '@alice:example.org': alice });
  });

  it('upsertAccount replaces an existing account with the same userId', () => {
    upsertAccount(alice);
    const rotated = { ...alice, accessToken: 'tok-a2' };
    upsertAccount(rotated);

    expect(getAccount('@alice:example.org')).toEqual(rotated);
    expect(listAccounts()).toHaveLength(1);
  });

  it('getAccount returns null for an unknown user', () => {
    expect(getAccount('@ghost:example.org')).toBeNull();
  });

  it('listAccounts returns every stored account', () => {
    upsertAccount(alice);
    upsertAccount(bob);

    expect(listAccounts()).toEqual(expect.arrayContaining([alice, bob]));
  });

  it('removeAccount deletes the account', () => {
    upsertAccount(alice);
    removeAccount('@alice:example.org');

    expect(getAccount('@alice:example.org')).toBeNull();
    expect(listAccounts()).toEqual([]);
  });

  it('removeAccount clears the active pointer when removing the active user', () => {
    upsertAccount(alice);
    setActiveAccount(alice.userId);
    removeAccount(alice.userId);

    expect(getActiveUserId()).toBeNull();
  });

  it('setActiveAccount/getActiveUserId/getActiveAccount follow the active pointer', () => {
    upsertAccount(alice);
    upsertAccount(bob);
    setActiveAccount(bob.userId);

    expect(getActiveUserId()).toBe('@bob:example.org');
    expect(getActiveAccount()).toEqual(bob);

    setActiveAccount(alice.userId);
    expect(getActiveAccount()).toEqual(alice);
  });

  it('getActiveAccount returns null when no active user is set', () => {
    upsertAccount(alice);

    expect(getActiveAccount()).toBeNull();
  });

  it('clearAllAccounts wipes accounts and the active pointer', () => {
    upsertAccount(alice);
    setActiveAccount(alice.userId);
    clearAllAccounts();

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
