// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAuthorizationUrl,
  clearPendingOAuth,
  codeChallengeS256,
  generateCodeVerifier,
  generateDeviceId,
  generateState,
  getPendingOAuth,
  oauthScope,
  parseCallbackParams,
  savePendingOAuth,
  type OAuthSessionState,
} from './oauth-pkce';

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function installSessionStorage(): void {
  const map = new Map<string, string>();
  const stub: SessionStorageLike = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
  (globalThis as { sessionStorage?: SessionStorageLike }).sessionStorage = stub;
}

describe('oauth-pkce', () => {
  afterEach(() => {
    delete (globalThis as { sessionStorage?: SessionStorageLike }).sessionStorage;
  });

  describe('generateState', () => {
    it('returns a fresh base64url state of at least 16 characters', () => {
      const first = generateState();
      const second = generateState();
      expect(first.length).toBeGreaterThanOrEqual(16);
      expect(first).not.toBe(second);
      expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('generateCodeVerifier', () => {
    it('returns a fresh verifier of at least 43 characters', () => {
      const first = generateCodeVerifier();
      const second = generateCodeVerifier();
      expect(first.length).toBeGreaterThanOrEqual(43);
      expect(first).not.toBe(second);
      expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('codeChallengeS256', () => {
    it('matches an independently computed base64url SHA-256 digest', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await codeChallengeS256(verifier);
      const expected = createHash('sha256').update(verifier, 'ascii').digest('base64url');
      expect(challenge).toBe(expected);
      expect(challenge).not.toContain('=');
      expect(challenge).not.toMatch(/[+/]/);
    });
  });

  describe('generateDeviceId', () => {
    it('returns a fresh device id of at least 10 base64url characters', () => {
      const first = generateDeviceId();
      const second = generateDeviceId();
      expect(first.length).toBeGreaterThanOrEqual(10);
      expect(first).not.toBe(second);
      expect(first).toMatch(/^[A-Za-z0-9_-]{10,}$/);
    });
  });

  describe('oauthScope', () => {
    it('builds the stable MSC2966/2967 scope with a concrete device id', () => {
      expect(oauthScope('device1234567890')).toBe(
        'openid urn:matrix:client:api:* urn:matrix:client:device:device1234567890',
      );
    });

    it('never mixes unstable scopes into the request', () => {
      expect(oauthScope(generateDeviceId())).not.toContain('urn:matrix:org.matrix.msc2967');
    });
  });

  describe('buildAuthorizationUrl', () => {
    const metadata = { authorizationEndpoint: 'https://account.matrix.org/authorize' };
    const deviceId = 'device1234567';

    it('includes every authorization-code+PKCE parameter', () => {
      const url = new URL(
        buildAuthorizationUrl(metadata, {
          clientId: 'cid',
          redirectUri: 'http://localhost:4200/callback',
          state: 'st',
          codeChallenge: 'cc',
          deviceId,
        }),
      );
      expect(url.origin).toBe('https://account.matrix.org');
      expect(url.pathname).toBe('/authorize');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('cid');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4200/callback');
      expect(url.searchParams.get('scope')).toBe(
        'openid urn:matrix:client:api:* urn:matrix:client:device:device1234567',
      );
      expect(url.searchParams.get('state')).toBe('st');
      expect(url.searchParams.get('code_challenge')).toBe('cc');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('prompt')).toBeNull();
    });

    it('uses query response_mode for a localhost http redirect URI', () => {
      const url = new URL(
        buildAuthorizationUrl(metadata, {
          clientId: 'cid',
          redirectUri: 'http://localhost:4200/callback',
          state: 'st',
          codeChallenge: 'cc',
          deviceId,
        }),
      );
      expect(url.searchParams.get('response_mode')).toBe('query');
    });

    it('uses query response_mode for a 127.0.0.1 http redirect URI', () => {
      const url = new URL(
        buildAuthorizationUrl(metadata, {
          clientId: 'cid',
          redirectUri: 'http://127.0.0.1:4200/callback',
          state: 'st',
          codeChallenge: 'cc',
          deviceId,
        }),
      );
      expect(url.searchParams.get('response_mode')).toBe('query');
    });

    it('uses fragment response_mode for an https redirect URI', () => {
      const url = new URL(
        buildAuthorizationUrl(metadata, {
          clientId: 'cid',
          redirectUri: 'https://app.example/callback',
          state: 'st',
          codeChallenge: 'cc',
          deviceId,
        }),
      );
      expect(url.searchParams.get('response_mode')).toBe('fragment');
    });

    it('appends prompt only when it is provided', () => {
      const url = new URL(
        buildAuthorizationUrl(metadata, {
          clientId: 'cid',
          redirectUri: 'https://app.example/callback',
          state: 'st',
          codeChallenge: 'cc',
          deviceId,
          prompt: 'create',
        }),
      );
      expect(url.searchParams.get('prompt')).toBe('create');
    });
  });

  describe('parseCallbackParams', () => {
    it('prefers the fragment over the query', () => {
      expect(parseCallbackParams('?code=a&state=s', '#code=b&state=t')).toEqual({
        code: 'b',
        state: 't',
      });
    });

    it('reads the query when the fragment is empty', () => {
      expect(parseCallbackParams('?code=a&state=s', '')).toEqual({
        code: 'a',
        state: 's',
      });
    });

    it('exposes error and error_description', () => {
      expect(
        parseCallbackParams('?error=access_denied&error_description=nope', ''),
      ).toEqual({
        error: 'access_denied',
        errorDescription: 'nope',
      });
    });
  });

  describe('pending OAuth state', () => {
    const pending: OAuthSessionState = {
      homeserverUrl: 'https://matrix-client.matrix.org',
      issuer: 'https://account.matrix.org/',
      clientId: 'cid',
      redirectUri: 'http://localhost:4200/callback',
      state: 'st',
      codeVerifier: 'cv',
    };

    it('round-trips the pending state through sessionStorage', () => {
      installSessionStorage();
      savePendingOAuth(pending);
      expect(getPendingOAuth()).toEqual(pending);
      clearPendingOAuth();
      expect(getPendingOAuth()).toBeNull();
    });

    it('returns null when nothing is stored or the value is corrupt', () => {
      installSessionStorage();
      expect(getPendingOAuth()).toBeNull();
      savePendingOAuth(pending);
      sessionStorage.setItem('sewernet:oauth', 'not-json');
      expect(getPendingOAuth()).toBeNull();
    });
  });
});
