import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAccount,
  getActiveAccount,
  setActiveAccount,
  upsertAccount,
  _resetForTesting,
  initializeAccounts,
  type MatrixCredentials,
} from '../../client/accounts';
import { BrowserPersistence } from '../../platform/browser';

const alice: MatrixCredentials = {
  userId: '@alice:example.org',
  accessToken: 'tok-a',
  deviceId: 'DEV-A',
  homeserverUrl: 'https://matrix.example.org',
  refreshToken: 'rt-a',
  oidc: {
    issuer: 'https://issuer.example.org',
    clientId: 'client-123',
    redirectUri: 'http://localhost:4200/oidc/callback',
    responseMode: 'query',
    idTokenClaims: {},
  },
};

const bob: MatrixCredentials = {
  userId: '@bob:example.org',
  accessToken: 'tok-b',
  deviceId: 'DEV-B',
  homeserverUrl: 'https://matrix.example.org',
};

beforeEach(async () => {
  localStorage.clear();
  _resetForTesting();
  await initializeAccounts(new BrowserPersistence());
});

describe('auth-store on accounts map', () => {
  it('setCredentials does not write to accounts map (accounts are source of truth)', async () => {
    const { useAuthStore } = await import('./auth-store');

    useAuthStore.getState().setCredentials(alice);

    expect(useAuthStore.getState().credentials).toEqual(alice);
    // Accounts map is not written by setCredentials anymore
    expect(getActiveAccount()).toBeNull();
  });

  it('setCredentials(null) does not remove from accounts map', async () => {
    const { useAuthStore } = await import('./auth-store');

    useAuthStore.getState().setCredentials(alice);
    useAuthStore.getState().setCredentials(null);

    expect(useAuthStore.getState().credentials).toBeNull();
    // Accounts map is not managed by auth-store anymore
    expect(getAccount(alice.userId)).toBeNull();
  });

  it('does not expose the removed legacy session surface', async () => {
    const { useAuthStore } = await import('./auth-store');

    useAuthStore.getState().setCredentials(alice);
    const state = useAuthStore.getState();

    expect(state).not.toHaveProperty('session');
    expect(state).not.toHaveProperty('setSession');
    expect(state).not.toHaveProperty('clearSession');
  });

  it('setCredentials(null) keeps the other stored accounts', async () => {
    const { useAuthStore } = await import('./auth-store');
    await upsertAccount(bob);

    useAuthStore.getState().setCredentials(alice);
    useAuthStore.getState().setCredentials(null);

    expect(getAccount(bob.userId)).toEqual(bob);
  });

  it('hydrates credentials from the accounts map when the store loads', async () => {
    await upsertAccount(alice);
    await setActiveAccount(alice.userId);

    const active = getActiveAccount();
    expect(active).toEqual(alice);
  });
});
