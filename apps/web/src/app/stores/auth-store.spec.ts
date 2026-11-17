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

  it('exposes the legacy session shape derived from credentials', async () => {
    const { useAuthStore } = await import('./auth-store');

    useAuthStore.getState().setCredentials(alice);

    const session = useAuthStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.issuer).toBe('https://issuer.example.org');
    expect(session?.clientId).toBe('client-123');
  });

  it('setSession persists credentials through the legacy compat path', async () => {
    const { useAuthStore } = await import('./auth-store');

    useAuthStore.getState().setSession({
      homeserverUrl: 'https://matrix.example.org',
      accessToken: 'tok-a',
      userId: '@alice:example.org',
      deviceId: 'DEV-A',
      refreshToken: 'rt-a',
    });

    expect(getActiveAccount()?.accessToken).toBe('tok-a');
    expect(useAuthStore.getState().credentials?.refreshToken).toBe('rt-a');
  });

  it('hydrates credentials from the accounts map when the store loads', async () => {
    upsertAccount(alice);
    setActiveAccount(alice.userId);

    vi.resetModules();
    const fresh = await import('./auth-store');

    expect(fresh.useAuthStore.getState().credentials).toEqual(alice);
    expect(fresh.useAuthStore.getState().session?.accessToken).toBe('tok-a');
  });
});
