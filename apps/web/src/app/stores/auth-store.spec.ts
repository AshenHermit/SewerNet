import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginAccountOperation,
  getAccount,
  getActiveAccount,
  initializeAccounts,
  saveAndActivateAccount,
  upsertAccount,
  _resetForTesting,
  type MatrixCredentials,
} from '../../client/accounts';
import { BrowserPersistence } from '../../platform/browser';
import {
  hydrateAuthStore,
  useAuthStore,
  _resetAuthStoreForTesting,
} from './auth-store';

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
  _resetAuthStoreForTesting();
  await initializeAccounts(new BrowserPersistence());
});

describe('auth-store on the durable account snapshot', () => {
  it('does not expose a credential write path', () => {
    const state = useAuthStore.getState();

    expect(state).not.toHaveProperty('setCredentials');
    expect(state).not.toHaveProperty('session');
    expect(state).not.toHaveProperty('setSession');
    expect(state).not.toHaveProperty('clearSession');
  });

  it('starts loading with no credentials before hydration', () => {
    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('loading');
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('hydrateAuthStore publishes the committed active account only', async () => {
    await saveAndActivateAccount(alice);
    await upsertAccount(bob);

    hydrateAuthStore();

    expect(useAuthStore.getState().credentials).toEqual(alice);
    expect(useAuthStore.getState().status).toBe('ready');
    // Hydration never writes to the account repository.
    expect(getActiveAccount()).toEqual(alice);
    expect(getAccount(bob.userId)).toEqual(bob);
  });

  it('hydrateAuthStore follows account changes without a direct write path', async () => {
    await saveAndActivateAccount(alice);
    hydrateAuthStore();
    expect(useAuthStore.getState().credentials).toEqual(alice);

    await saveAndActivateAccount({ ...bob });
    expect(useAuthStore.getState().credentials).toEqual(bob);

    await upsertAccount({ ...bob, accessToken: 'tok-b2' });
    expect(useAuthStore.getState().credentials?.accessToken).toBe('tok-b2');
  });

  it('does not publish a blocked active account after restart', async () => {
    await saveAndActivateAccount(alice);
    await beginAccountOperation(alice.userId, alice.deviceId, 'refresh');

    // Restart: the barrier is part of the durable snapshot.
    _resetForTesting();
    _resetAuthStoreForTesting();
    await initializeAccounts(new BrowserPersistence());

    hydrateAuthStore();

    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('storage-error');
    expect(useAuthStore.getState().error).toBeTruthy();
  });

  it('reports a storage error instead of throwing when accounts are not initialized', () => {
    _resetForTesting();
    _resetAuthStoreForTesting();

    expect(() => hydrateAuthStore()).not.toThrow();
    expect(useAuthStore.getState().credentials).toBeNull();
    expect(useAuthStore.getState().status).toBe('storage-error');
  });
});
