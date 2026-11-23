import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopOidcPlatform } from '../../../platform/desktop';
import { handleDesktopOidcCallback, resetDesktopOidcForTesting } from './desktop-oidc';
import { DESKTOP_OIDC_REDIRECT_URI } from './desktop-oidc-consts';

const { grant, commitLogin, invoke, openUrl, whoami } = vi.hoisted(() => ({
  grant: vi.fn(),
  commitLogin: vi.fn(),
  invoke: vi.fn(),
  openUrl: vi.fn(),
  whoami: vi.fn(),
}));

vi.mock('matrix-js-sdk/lib/oidc', () => ({ completeAuthorizationCodeGrant: grant }));
vi.mock('../../../client/session', () => ({ commitLogin }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }));
vi.mock('matrix-js-sdk', () => ({ createClient: () => ({ whoami }) }));

const callback = `${DESKTOP_OIDC_REDIRECT_URI}?state=oauth-state&code=secret-code`;
const flow = {
  schema: 1 as const,
  state: 'oauth-state',
  issuer: 'https://issuer.example',
  redirectUri: DESKTOP_OIDC_REDIRECT_URI as typeof DESKTOP_OIDC_REDIRECT_URI,
  sdkStateKey: 'sdk-state-key',
  sdkState: JSON.stringify({ request_type: 'si:c', state: { homeserverUrl: 'https://hs.example', nonce: 'n' } }),
  createdAt: Date.now(),
  context: { homeserverUrl: 'https://hs.example', nonce: 'n', responseMode: 'query' as const, redirectUri: DESKTOP_OIDC_REDIRECT_URI as typeof DESKTOP_OIDC_REDIRECT_URI },
  status: 'processing' as const,
};

describe('desktop OIDC orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resetDesktopOidcForTesting();
    invoke.mockImplementation(async (command: string) => {
      if (command === 'oidc_callback_claim') return { flow, callback: { state: 'oauth-state', code: 'secret-code' } };
      return undefined;
    });
    grant.mockResolvedValue({ homeserverUrl: 'https://hs.example', tokenResponse: { access_token: 'token' }, idTokenClaims: {}, oidcClientSettings: { issuer: 'https://issuer.example', clientId: 'cid' } });
    whoami.mockResolvedValue({ user_id: '@a:hs.example', device_id: 'DEVICE' });
    commitLogin.mockResolvedValue(undefined);
  });

  it('uses exact native registration metadata and external opener capability', async () => {
    const platform = new DesktopOidcPlatform();
    expect(platform.redirectUri()).toBe(DESKTOP_OIDC_REDIRECT_URI);
    expect(platform.applicationType()).toBe('native');
    expect(platform.clientUri()).toBe('https://github.com/AshenHermit/SewerNet');
    await platform.openAuthorization('https://issuer.example/authorize');
    expect(openUrl).toHaveBeenCalledWith('https://issuer.example/authorize');
  });

  it('restores SDK state, grants once, commits before clearing, and ignores duplicate callback', async () => {
    const platform = new DesktopOidcPlatform();
    const grantOrder: string[] = [];
    grant.mockImplementation(async () => {
      expect(sessionStorage.getItem('mx_oidc_sdk-state-key')).toBe(flow.sdkState);
      grantOrder.push('grant');
      return { homeserverUrl: 'https://hs.example', tokenResponse: { access_token: 'token' }, idTokenClaims: {}, oidcClientSettings: { issuer: 'https://issuer.example', clientId: 'cid' } };
    });
    commitLogin.mockImplementation(async () => { grantOrder.push('commit'); });

    await handleDesktopOidcCallback(callback, platform);
    await handleDesktopOidcCallback(callback, platform);

    expect(sessionStorage.getItem('mx_oidc_sdk-state-key')).toBeNull();
    expect(grant).toHaveBeenCalledTimes(1);
    expect(commitLogin).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(['oidc_callback_claim', 'oidc_pending_clear', 'oidc_callback_claim']);
    expect(grantOrder).toEqual(['grant', 'commit']);
  });

  it('does not clear pending credentials when SDK exchange fails', async () => {
    grant.mockRejectedValue(new Error('exchange failed'));
    await expect(handleDesktopOidcCallback(callback, new DesktopOidcPlatform())).rejects.toThrow('exchange failed');
    expect(commitLogin).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
