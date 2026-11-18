import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAccount,
  getActiveAccount,
  setActiveAccount,
  upsertAccount,
  type MatrixCredentials,
} from '../../client/accounts';

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

beforeEach(() => {
  localStorage.clear();
});

describe('auth-store on accounts map', () => {
  it('setCredentials writes to the accounts map and sets the active user', async () => {
    const { useAuthStore } = await import('./auth-store');

    useAuthStore.getState().setCredentials(alice);

    expect(useAuthStore.getState().credentials).toEqual(alice);
    expect(getActiveAccount()).toEqual(alice);
  });

  it('setCredentials(null) removes the active account', async () => {
    const { useAuthStore } = await import('./auth-store');

    useAuthStore.getState().setCredentials(alice);
    useAuthStore.getState().setCredentials(null);

    expect(useAuthStore.getState().credentials).toBeNull();
    expect(getActiveAccount()).toBeNull();
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
    upsertAccount(bob);

    useAuthStore.getState().setCredentials(alice);
    useAuthStore.getState().setCredentials(null);

    expect(getActiveAccount()).toBeNull();
    expect(getAccount(alice.userId)).toBeNull();
    expect(getAccount(bob.userId)).toEqual(bob);
  });

  it('hydrates credentials from the accounts map when the store loads', async () => {
    upsertAccount(alice);
    setActiveAccount(alice.userId);
    vi.resetModules();

    const fresh = await import('./auth-store');

    expect(fresh.useAuthStore.getState().credentials).toEqual(alice);
  });
});
