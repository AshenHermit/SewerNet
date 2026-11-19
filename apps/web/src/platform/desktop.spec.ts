import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopPersistence, DesktopOidcPlatform } from './desktop';

const { invoke, openUrl } = vi.hoisted(() => ({ invoke: vi.fn(), openUrl: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }));

describe('Desktop platform', () => {
  beforeEach(() => { invoke.mockReset(); openUrl.mockReset(); });

  it('maps account operations to exact native IPC names', async () => {
    const persistence = new DesktopPersistence();
    await persistence.load();
    await persistence.upsertAccount({ userId: '@a:example.org', accessToken: 'test-token', deviceId: 'DEV', homeserverUrl: 'https://example.org' });
    await persistence.beginOperation('@a:example.org', 'DEV', 'refresh');
    await persistence.removeAccount('@a:example.org');
    await persistence.setActiveAccount('@a:example.org');
    await persistence.clear();
    await persistence.flush();
    expect(invoke.mock.calls.map(([name]) => name)).toEqual([
      'accounts_load', 'account_upsert', 'account_begin_operation', 'account_remove',
      'account_set_active', 'accounts_clear', 'storage_flush',
    ]);
  });

  it('uses exact native OIDC registration identifiers and invokes external opener', async () => {
    const platform = new DesktopOidcPlatform();
    expect(platform.redirectUri()).toBe('sewernet://oidc/callback');
    expect(platform.applicationType()).toBe('native');
    expect(platform.clientUri()).toBe('https://github.com/AshenHermit/SewerNet');
    await platform.openAuthorization('https://issuer.example/authorize');
    expect(openUrl).toHaveBeenCalledWith('https://issuer.example/authorize');
  });

  it('saves flow before browser launch and claims callback through native IPC', async () => {
    const platform = new DesktopOidcPlatform();
    const flow = { schema: 1 as const, state: 's', issuer: 'https://issuer.example', redirectUri: 'sewernet://oidc/callback', sdkStateKey: 'key', sdkState: '{}', createdAt: 1, context: { homeserverUrl: 'https://hs.example', nonce: 'n', responseMode: 'query' as const, redirectUri: 'sewernet://oidc/callback' }, status: 'pending' as const };
    await platform.savePending(flow);
    await platform.openAuthorization('https://issuer.example/auth');
    expect(invoke.mock.calls[0]).toEqual(['oidc_pending_save', { flow }]);
    expect(openUrl).toHaveBeenCalledWith('https://issuer.example/auth');
    const result = { flow, callback: { state: 's', code: 'c' } };
    invoke.mockResolvedValueOnce(result);
    expect(await platform.claimCallback('sewernet://oidc/callback?state=s&code=c')).toEqual(result);
    expect(invoke.mock.calls[1]).toEqual(['oidc_callback_claim', { url: 'sewernet://oidc/callback?state=s&code=c' }]);
  });
});
