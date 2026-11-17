import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixCredentials } from '../client/accounts';
import { authSessionToCredentials, credentialsToAuthSession } from './legacy-session';

const full: MatrixCredentials = {
  userId: '@alice:example.org',
  accessToken: 'tok-a',
  deviceId: 'DEV-A',
  homeserverUrl: 'https://matrix.example.org',
  refreshToken: 'rt-a',
  expiresInMs: 60_000,
  oidc: {
    issuer: 'https://issuer.example.org',
    clientId: 'client-123',
    redirectUri: 'http://localhost:4200/oidc/callback',
    responseMode: 'query',
    idTokenClaims: { sub: '@alice:example.org' },
  },
};

const plain: MatrixCredentials = {
  userId: '@bob:example.org',
  accessToken: 'tok-b',
  deviceId: 'DEV-B',
  homeserverUrl: 'https://matrix.example.org',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('credentialsToAuthSession', () => {
  it('flattens the oidc block into issuer/clientId and computes expiresAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const session = credentialsToAuthSession(full);

    expect(session.userId).toBe('@alice:example.org');
    expect(session.accessToken).toBe('tok-a');
    expect(session.deviceId).toBe('DEV-A');
    expect(session.homeserverUrl).toBe('https://matrix.example.org');
    expect(session.issuer).toBe('https://issuer.example.org');
    expect(session.clientId).toBe('client-123');
    expect(session.refreshToken).toBe('rt-a');
    expect(session.expiresAt).toBe(1_060_000);
  });

  it('omits issuer/clientId/expiresAt when credentials carry none', () => {
    const session = credentialsToAuthSession(plain);

    expect(session.issuer).toBeUndefined();
    expect(session.clientId).toBeUndefined();
    expect(session.expiresAt).toBeUndefined();
    expect(session.refreshToken).toBeUndefined();
  });
});

describe('authSessionToCredentials (legacy compat)', () => {
  it('maps core fields back without an oidc block', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);

    const creds = authSessionToCredentials({
      homeserverUrl: 'https://matrix.example.org',
      accessToken: 'tok-a',
      userId: '@alice:example.org',
      deviceId: 'DEV-A',
      refreshToken: 'rt-a',
      expiresAt: 2_060_000,
    });

    expect(creds.userId).toBe('@alice:example.org');
    expect(creds.accessToken).toBe('tok-a');
    expect(creds.deviceId).toBe('DEV-A');
    expect(creds.homeserverUrl).toBe('https://matrix.example.org');
    expect(creds.refreshToken).toBe('rt-a');
    expect(creds.expiresInMs).toBe(60_000);
    expect(creds.oidc).toBeUndefined();
  });
});
