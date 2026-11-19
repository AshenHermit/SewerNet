import { beforeEach, describe, expect, it } from 'vitest';
import { BrowserPersistence } from './browser';

const USER = '@alice:example.org';
const alice = {
  userId: USER,
  accessToken: 'tok-1',
  deviceId: 'DEV-A',
  homeserverUrl: 'https://matrix.example.org',
  refreshToken: 'rt-1',
  expiresInMs: 60_000,
  oidc: {
    issuer: 'https://issuer.example.org',
    clientId: 'client-123',
    redirectUri: 'http://localhost:4200/oidc/callback',
    responseMode: 'query' as const,
    idTokenClaims: {},
  },
};

describe('BrowserPersistence.load', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('accepts a valid current snapshot including blocked accounts', async () => {
    localStorage.setItem('sewernet_accounts', JSON.stringify({ [USER]: alice }));
    localStorage.setItem('sewernet_active_account', USER);
    localStorage.setItem(
      'sewernet_blocked_accounts_v1',
      JSON.stringify({ '@bob:example.org': { deviceId: 'DEV-B', reason: 'refresh' } }),
    );

    const snapshot = await new BrowserPersistence().load();

    expect(snapshot.accounts[USER]).toEqual(alice);
    expect(snapshot.activeUserId).toBe(USER);
    expect(snapshot.blockedAccounts).toEqual({
      '@bob:example.org': { deviceId: 'DEV-B', reason: 'refresh' },
    });
  });

  it('accepts a valid legacy snapshot without blockedAccounts storage', async () => {
    localStorage.setItem('sewernet_accounts', JSON.stringify({ [USER]: {
      userId: USER,
      accessToken: 'tok-legacy',
      deviceId: 'DEV-LEGACY',
      homeserverUrl: 'https://matrix.example.org/',
    } }));
    localStorage.setItem('sewernet_active_account', USER);

    const snapshot = await new BrowserPersistence().load();

    expect(snapshot.accounts[USER]?.deviceId).toBe('DEV-LEGACY');
    expect(snapshot.activeUserId).toBe(USER);
    expect(snapshot.blockedAccounts).toEqual({});
  });

  it('accepts http loopback homeserver URLs for local development', async () => {
    localStorage.setItem('sewernet_accounts', JSON.stringify({
      [USER]: { ...alice, homeserverUrl: 'http://127.0.0.1:8008' },
    }));

    const snapshot = await new BrowserPersistence().load();
    expect(snapshot.accounts[USER]?.homeserverUrl).toBe('http://127.0.0.1:8008');
  });

  it('rejects malformed account maps and unusable homeserver URLs', async () => {
    const persistence = new BrowserPersistence();

    localStorage.setItem('sewernet_accounts', JSON.stringify([alice]));
    await expect(persistence.load()).rejects.toThrow(/Malformed accounts data/);

    localStorage.setItem(
      'sewernet_accounts',
      JSON.stringify({ [USER]: { ...alice, userId: '@other:example.org' } }),
    );
    await expect(persistence.load()).rejects.toThrow(/Malformed accounts data/);

    localStorage.setItem(
      'sewernet_accounts',
      JSON.stringify({ [USER]: { ...alice, homeserverUrl: 'http://evil.example' } }),
    );
    await expect(persistence.load()).rejects.toThrow(/Malformed accounts data/);

    localStorage.setItem(
      'sewernet_accounts',
      JSON.stringify({ [USER]: { ...alice, homeserverUrl: 'https://user:pass@matrix.example.org' } }),
    );
    await expect(persistence.load()).rejects.toThrow(/Malformed accounts data/);

    localStorage.setItem(
      'sewernet_accounts',
      JSON.stringify({ [USER]: { ...alice, homeserverUrl: 'https://matrix.example.org?x=1' } }),
    );
    await expect(persistence.load()).rejects.toThrow(/Malformed accounts data/);

    localStorage.setItem(
      'sewernet_accounts',
      JSON.stringify({ [USER]: { ...alice, homeserverUrl: 'https://matrix.example.org#frag' } }),
    );
    await expect(persistence.load()).rejects.toThrow(/Malformed accounts data/);

    localStorage.setItem(
      'sewernet_accounts',
      JSON.stringify({ [USER]: { ...alice, accessToken: '' } }),
    );
    await expect(persistence.load()).rejects.toThrow(/Malformed accounts data/);
  });
});
