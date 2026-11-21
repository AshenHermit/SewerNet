import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopPersistence, DesktopOidcPlatform } from './desktop';

const { invoke, openUrl, currentMediaSession } = vi.hoisted(() => ({ invoke: vi.fn(), openUrl: vi.fn(), currentMediaSession: { value: null as unknown } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }));
vi.mock('./runtime', () => ({
  registerPlatformAdapter: vi.fn(),
  getMediaSession: () => currentMediaSession.value,
}));

describe('Desktop platform', () => {
  beforeEach(() => { invoke.mockReset(); openUrl.mockReset(); vi.unstubAllGlobals(); currentMediaSession.value = null; });

  it('native_media_same_origin_path_only_no_redirect', async () => {
    const transport = new (await import('./desktop')).DesktopMediaTransport();
    const fetchSpy = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2]), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const session = { userId: '@a:example.org', deviceId: 'DEV', baseUrl: 'https://home.test/matrix', accessToken: 'secret', epoch: 1 };
    currentMediaSession.value = session;
    await expect(transport.fetchBlob('https://home.test/matrix/_matrix/client/v1/media/download/media.example/id', session, new AbortController().signal)).resolves.toBeInstanceOf(Blob);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://home.test/matrix/_matrix/client/v1/media/download/media.example/id',
      expect.objectContaining({ redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer secret' } }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')));
    await expect(transport.fetchBlob('https://evil.test/media', session, new AbortController().signal)).rejects.toThrow();
  });

  it('falls back to native media_download when webview fetch is blocked', async () => {
    const transport = new (await import('./desktop')).DesktopMediaTransport();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const session = { userId: '@a:example.org', deviceId: 'DEV', baseUrl: 'https://home.test/matrix', accessToken: 'secret', epoch: 1 };
    currentMediaSession.value = session;
    invoke.mockResolvedValueOnce([9, 8, 7]);

    const blob = await transport.fetchBlob(
      'https://home.test/matrix/_matrix/client/v1/media/thumbnail/media.example/id?width=48&height=48&method=scale',
      session,
      new AbortController().signal,
    );

    expect(invoke).toHaveBeenCalledWith('media_download', {
      mxc: 'mxc://media.example/id',
      kind: 'thumbnail',
      size: 48,
      userId: '@a:example.org',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(3);
  });

  it('no_token_for_cross_origin_or_stale_account', async () => {
    const transport = new (await import('./desktop')).DesktopMediaTransport();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const session = { userId: '@a:example.org', deviceId: 'DEV', baseUrl: 'https://home.test/matrix', accessToken: 'secret', epoch: 1 };
    await expect(transport.fetchBlob('https://evil.test/_matrix/client/v1/media/download/x/y', session, new AbortController().signal)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

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

  it('uses loopback OIDC redirect URI and invokes external opener', async () => {
    const platform = new DesktopOidcPlatform();
    expect(platform.redirectUri()).toBe('http://127.0.0.1:4201/oidc/callback');
    expect(platform.applicationType()).toBe('native');
    expect(platform.clientUri()).toBe('https://github.com/AshenHermit/SewerNet');
    await platform.openAuthorization('https://issuer.example/authorize');
    expect(openUrl).toHaveBeenCalledWith('https://issuer.example/authorize');
  });

  it('saves flow before browser launch and claims callback through native IPC', async () => {
    const platform = new DesktopOidcPlatform();
    const flow = { schema: 1 as const, state: 's', issuer: 'https://issuer.example', redirectUri: 'http://127.0.0.1:4201/oidc/callback', sdkStateKey: 'key', sdkState: '{}', createdAt: 1, context: { homeserverUrl: 'https://hs.example', nonce: 'n', responseMode: 'query' as const, redirectUri: 'http://127.0.0.1:4201/oidc/callback' }, status: 'pending' as const };
    await platform.savePending(flow);
    await platform.openAuthorization('https://issuer.example/auth');
    expect(invoke.mock.calls[0]).toEqual(['oidc_pending_save', { flow }]);
    expect(openUrl).toHaveBeenCalledWith('https://issuer.example/auth');
    const result = { flow, callback: { state: 's', code: 'c' } };
    invoke.mockResolvedValueOnce(result);
    expect(await platform.claimCallback('http://127.0.0.1:4201/oidc/callback?state=s&code=c')).toEqual(result);
    expect(invoke.mock.calls[1]).toEqual(['oidc_callback_claim', { url: 'http://127.0.0.1:4201/oidc/callback?state=s&code=c' }]);
  });
});
