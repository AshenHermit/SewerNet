import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findClientConfigMock, createClientMock, registerClientMock, generateUrlMock, completeGrantMock, fetchMock } =
  vi.hoisted(() => ({
    findClientConfigMock: vi.fn(),
    createClientMock: vi.fn(),
    registerClientMock: vi.fn(),
    generateUrlMock: vi.fn(),
    completeGrantMock: vi.fn(),
    fetchMock: vi.fn(),
  }));

vi.mock('matrix-js-sdk', () => ({
  AutoDiscovery: { findClientConfig: (domain: string) => findClientConfigMock(domain) },
  AutoDiscoveryAction: { SUCCESS: 'SUCCESS', FAIL_PROMPT: 'FAIL_PROMPT', FAIL_ERROR: 'FAIL_ERROR' },
  createClient: (opts: unknown) => createClientMock(opts),
  Method: { Post: 'POST' },
}));

vi.mock('matrix-js-sdk/lib/oidc', () => ({
  registerOidcClient: (metadata: unknown, clientMetadata: unknown) => registerClientMock(metadata, clientMetadata),
  generateOidcAuthorizationUrl: (opts: unknown) => generateUrlMock(opts),
  completeAuthorizationCodeGrant: (code: string, state: string, mode: unknown) =>
    completeGrantMock(code, state, mode),
}));

import {
  clearPendingOidcFlow,
  completeOidcLogin,
  discoverAuthCapabilities,
  getOrRegisterClientId,
  getOidcRedirectUri,
  getPendingOidcFlow,
  resolveBaseUrl,
  revokeOidcSession,
  startOidcLogin,
} from './oidc';
import type { OidcClientConfig } from 'matrix-js-sdk/lib/oidc';

const HS = 'https://matrix.example';
const ISSUER = 'https://issuer.example';

const metadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/auth`,
  token_endpoint: `${ISSUER}/token`,
  revocation_endpoint: `${ISSUER}/revoke`,
  response_modes_supported: ['query', 'fragment'],
  prompt_values_supported: ['create'],
  signingKeys: null,
} as unknown as OidcClientConfig;

function readAccounts(): Record<string, Record<string, unknown>> {
  return JSON.parse(localStorage.getItem('sewernet_accounts') ?? '{}');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  findClientConfigMock.mockReset();
  createClientMock.mockReset();
  registerClientMock.mockReset();
  generateUrlMock.mockReset();
  completeGrantMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost:4200/welcome', origin: 'http://localhost:4200' },
    writable: true,
  });
});

describe('resolveBaseUrl', () => {
  it('uses the well-known homeserver base_url', async () => {
    findClientConfigMock.mockResolvedValue({ 'm.homeserver': { state: 'SUCCESS', base_url: HS } });
    await expect(resolveBaseUrl('matrix.example')).resolves.toBe(HS);
  });

  it('falls back to https://<input> for plain domains on discovery failure', async () => {
    findClientConfigMock.mockRejectedValue(new Error('offline'));
    await expect(resolveBaseUrl('matrix.example')).resolves.toBe('https://matrix.example');
  });

  it('keeps an already-absolute input on discovery failure', async () => {
    findClientConfigMock.mockResolvedValue({ 'm.homeserver': { state: 'FAIL_PROMPT' } });
    await expect(resolveBaseUrl(HS)).resolves.toBe(HS);
  });
});

describe('discoverAuthCapabilities', () => {
  it('reports password, sso, delegated auth and metadata when all succeed', async () => {
    createClientMock.mockReturnValue({
      loginFlows: vi.fn().mockResolvedValue({ flows: [{ type: 'm.login.password' }, { type: 'm.login.sso' }] }),
      registerRequest: vi.fn().mockResolvedValue({}),
      getAuthMetadata: vi.fn().mockResolvedValue(metadata),
    });
    const caps = await discoverAuthCapabilities(HS);
    expect(caps).toEqual({
      resolvedBaseUrl: HS,
      hasPasswordLogin: true,
      ssoFlow: true,
      registerAvailable: true,
      delegatedAuth: true,
      authMetadata: metadata,
    });
  });

  it('treats register probe 401 as available and 403 as disabled', async () => {
    createClientMock.mockReturnValue({
      loginFlows: vi.fn().mockResolvedValue({ flows: [] }),
      registerRequest: vi.fn().mockRejectedValue({ httpStatus: 401 }),
      getAuthMetadata: vi.fn().mockRejectedValue(new Error('none')),
    });
    const caps = await discoverAuthCapabilities(HS);
    expect(caps.registerAvailable).toBe(true);

    createClientMock.mockReturnValue({
      loginFlows: vi.fn().mockResolvedValue({ flows: [] }),
      registerRequest: vi.fn().mockRejectedValue({ httpStatus: 403 }),
      getAuthMetadata: vi.fn().mockRejectedValue(new Error('none')),
    });
    expect((await discoverAuthCapabilities(HS)).registerAvailable).toBe(false);
  });

  it('resolves to a safe baseline without throwing when everything fails', async () => {
    createClientMock.mockReturnValue({
      loginFlows: vi.fn().mockRejectedValue(new Error('down')),
      registerRequest: vi.fn().mockRejectedValue(new Error('down')),
      getAuthMetadata: vi.fn().mockRejectedValue(new Error('down')),
    });
    const caps = await discoverAuthCapabilities(HS);
    expect(caps.hasPasswordLogin).toBe(false);
    expect(caps.delegatedAuth).toBe(false);
    expect(caps.authMetadata).toBeNull();
  });
});

describe('getOrRegisterClientId', () => {
  it('registers and caches the client id', async () => {
    registerClientMock.mockResolvedValue('cid123');
    const id = await getOrRegisterClientId(metadata, 'http://localhost:4200/oidc/callback');
    expect(id).toBe('cid123');
    expect(registerClientMock).toHaveBeenCalledWith(metadata, {
      clientName: 'SewerNet',
      clientUri: 'http://localhost:4200',
      applicationType: 'web',
      redirectUris: ['http://localhost:4200/oidc/callback'],
      contacts: [],
      tosUri: undefined,
      policyUri: undefined,
    });
    expect(localStorage.getItem(`sewernet_oidc_client_id_${ISSUER}|http://localhost:4200/oidc/callback`)).toBe('cid123');
  });

  it('reuses the cached client id without re-registering', async () => {
    localStorage.setItem(`sewernet_oidc_client_id_${ISSUER}|http://localhost:4200/oidc/callback`, 'cached');
    const id = await getOrRegisterClientId(metadata, 'http://localhost:4200/oidc/callback');
    expect(id).toBe('cached');
    expect(registerClientMock).not.toHaveBeenCalled();
  });
});

describe('getOidcRedirectUri', () => {
  it('points at <origin>/oidc/callback', () => {
    expect(getOidcRedirectUri()).toBe('http://localhost:4200/oidc/callback');
  });
});

describe('startOidcLogin', () => {
  it('builds the authorization url, stores the pending flow and redirects', async () => {
    generateUrlMock.mockResolvedValue('https://issuer.example/auth?state=abc');
    await startOidcLogin(metadata, 'cid', 'http://localhost:4200/oidc/callback', HS, 'login');

    expect(generateUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata,
        clientId: 'cid',
        redirectUri: 'http://localhost:4200/oidc/callback',
        homeserverUrl: HS,
        nonce: expect.any(String),
        responseMode: 'query',
        prompt: undefined,
      }),
    );
    const pending = JSON.parse(sessionStorage.getItem('sewernet:oidc_pending') ?? 'null');
    expect(pending).toMatchObject({
      homeserverUrl: HS,
      responseMode: 'query',
      action: 'login',
      revocationEndpoint: `${ISSUER}/revoke`,
    });
    expect(window.location.href).toBe('https://issuer.example/auth?state=abc');
  });

  it('uses prompt=create only for register when supported', async () => {
    generateUrlMock.mockResolvedValue('https://issuer.example/auth?x=1');
    await startOidcLogin(metadata, 'cid', 'http://localhost:4200/oidc/callback', HS, 'register');
    expect(generateUrlMock).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: 'create' }));

    const noPrompt = { ...metadata, prompt_values_supported: undefined } as unknown as OidcClientConfig;
    await startOidcLogin(noPrompt, 'cid', 'http://localhost:4200/oidc/callback', HS, 'register');
    expect(generateUrlMock).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: undefined }));
  });
});

describe('completeOidcLogin', () => {
  const tokenResponse = {
    token_type: 'Bearer',
    access_token: 'at-oidc',
    refresh_token: 'rt-oidc',
    scope: 'openid urn:matrix:org.matrix.msc2967.client:device:devX',
    expires_in: 300,
    id_token: 'idt',
  };

  it('exchanges the code, resolves identity via whoami and persists credentials', async () => {
    sessionStorage.setItem(
      'sewernet:oidc_pending',
      JSON.stringify({ homeserverUrl: HS, nonce: 'n', responseMode: 'query', action: 'login', revocationEndpoint: `${ISSUER}/revoke` }),
    );
    completeGrantMock.mockResolvedValue({
      oidcClientSettings: { clientId: 'cid', issuer: ISSUER },
      tokenResponse,
      homeserverUrl: HS,
      idTokenClaims: { sub: 'sub1' },
    });
    createClientMock.mockReturnValue({ whoami: vi.fn().mockResolvedValue({ user_id: '@u:h.example', is_guest: false }) });

    const creds = await completeOidcLogin('code-1', 'state-1');

    expect(completeGrantMock).toHaveBeenCalledWith('code-1', 'state-1', 'query');
    expect(creds).toMatchObject({
      userId: '@u:h.example',
      accessToken: 'at-oidc',
      refreshToken: 'rt-oidc',
      deviceId: 'devX',
      homeserverUrl: HS,
      expiresInMs: 300_000,
    });
    expect(creds.oidc).toMatchObject({ issuer: ISSUER, clientId: 'cid', responseMode: 'query', revocationEndpoint: `${ISSUER}/revoke` });
    expect(readAccounts()['@u:h.example']).toMatchObject({ accessToken: 'at-oidc' });
    expect(localStorage.getItem('sewernet_active_account')).toBe('@u:h.example');
  });

  it('falls back to the device id from the token scope', async () => {
    sessionStorage.setItem(
      'sewernet:oidc_pending',
      JSON.stringify({ homeserverUrl: HS, nonce: 'n', responseMode: 'query', action: 'login' }),
    );
    completeGrantMock.mockResolvedValue({
      oidcClientSettings: { clientId: 'cid', issuer: ISSUER },
      tokenResponse,
      homeserverUrl: HS,
      idTokenClaims: {},
    });
    createClientMock.mockReturnValue({ whoami: vi.fn().mockResolvedValue({ user_id: '@u:h.example' }) });

    const creds = await completeOidcLogin('code-1', 'state-1');
    expect(creds.deviceId).toBe('devX');
  });
});

describe('pending flow helpers', () => {
  it('reads and clears the pending flow', () => {
    sessionStorage.setItem(
      'sewernet:oidc_pending',
      JSON.stringify({ homeserverUrl: HS, nonce: 'n', responseMode: 'query', action: 'login' }),
    );
    expect(getPendingOidcFlow()).toMatchObject({ homeserverUrl: HS, nonce: 'n' });
    clearPendingOidcFlow();
    expect(getPendingOidcFlow()).toBeNull();
  });
});

describe('revokeOidcSession', () => {
  it('posts a form-encoded revocation request', async () => {
    await revokeOidcSession(
      { issuer: ISSUER, clientId: 'cid', redirectUri: 'http://localhost:4200/oidc/callback', responseMode: 'query', revocationEndpoint: `${ISSUER}/revoke`, idTokenClaims: {} },
      'at-oidc',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${ISSUER}/revoke`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: 'at-oidc', token_type_hint: 'access_token', client_id: 'cid' }).toString(),
        signal: expect.anything(),
      }),
    );
  });

  it('does nothing when no revocation endpoint is known', async () => {
    await revokeOidcSession(
      { issuer: ISSUER, clientId: 'cid', redirectUri: 'http://localhost:4200/oidc/callback', responseMode: 'query', idTokenClaims: {} },
      'at-oidc',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
