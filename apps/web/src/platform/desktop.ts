import { invoke } from '@tauri-apps/api/core';
import type { AccountPersistence, OidcPlatform } from './contracts';
import type { AccountSnapshot, MatrixCredentials } from '../client/account-types';
import type { MediaSession, MediaTransport } from './contracts';
import { getMediaSession } from './runtime';
import type { PlatformAdapter } from './contracts';
import { registerPlatformAdapter } from './runtime';
import type { ClaimedOidcCallback, StoredOidcFlow } from './oidc-contract';
import { clearPendingOidcFlow, savePendingOidcFlow } from './desktop-oidc';

const NATIVE_REDIRECT_URI = 'sewernet://oidc/callback';
const NATIVE_CLIENT_URI = 'https://github.com/AshenHermit/SewerNet';

export class DesktopOidcPlatform implements OidcPlatform {
  redirectUri(): string { return NATIVE_REDIRECT_URI; }
  applicationType(): 'native' { return 'native'; }
  clientUri(): string { return NATIVE_CLIENT_URI; }
  savePending(flow: StoredOidcFlow): Promise<void> { return savePendingOidcFlow(flow); }
  claimCallback(url: string): Promise<ClaimedOidcCallback> {
    return invoke<ClaimedOidcCallback>('oidc_callback_claim', { url });
  }
  clearPending(state?: string): Promise<void> { return clearPendingOidcFlow(state); }
  async openAuthorization(url: string): Promise<void> {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  }
  async listenCallbacks(handler: (url: string) => void): Promise<() => void> {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<string>('sewernet://oidc-callback', (event) => handler(event.payload));
    const deepLink = await import('@tauri-apps/plugin-deep-link');
    await deepLink.onOpenUrl((urls) => { for (const url of urls) handler(url); });
    const initialUrls = await deepLink.getCurrent();
    for (const url of initialUrls ?? []) handler(url);
    return unlisten;
  }
}

export class DesktopPersistence implements AccountPersistence {
  async load(): Promise<AccountSnapshot> {
    return await invoke<AccountSnapshot>('accounts_load');
  }
  async upsertAccount(credentials: MatrixCredentials): Promise<void> {
    await invoke('account_upsert', { credentials });
  }
  async beginOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void> {
    await invoke('account_begin_operation', { userId, deviceId, reason });
  }
  async removeAccount(userId: string): Promise<void> {
    await invoke('account_remove', { userId });
  }
  async setActiveAccount(userId: string | null): Promise<void> {
    await invoke('account_set_active', { userId });
  }
  async clear(): Promise<void> {
    await invoke('accounts_clear');
  }
  async flush(): Promise<void> {
    await invoke('storage_flush');
  }
  async migrateLegacyStorage(): Promise<void> {
    const raw = localStorage.getItem('sewernet:auth');
    if (!raw) return;
    let persisted: { state?: { credentials?: MatrixCredentials | null; user?: MatrixCredentials | null }; credentials?: MatrixCredentials | null };
    try { persisted = JSON.parse(raw) as typeof persisted; }
    catch { throw new Error('legacy credential migration refused'); }
    const credential = persisted.state?.credentials ?? persisted.state?.user ?? persisted.credentials ?? null;
    if (!credential) return;
    await invoke('accounts_migrate_legacy', { snapshot: { accounts: { [credential.userId]: credential }, activeUserId: credential.userId, blockedAccounts: {} } });
    await invoke('storage_flush');
  }
}

export class DesktopMediaTransport implements MediaTransport {
  async fetchBlob(url: string, session: MediaSession, signal: AbortSignal): Promise<Blob> {
    const current = getMediaSession();
    if (!current || current.userId !== session.userId || current.deviceId !== session.deviceId || current.epoch !== session.epoch || current.accessToken !== session.accessToken) {
      throw new Error('Media account session changed');
    }
    const base = new URL(session.baseUrl);
    const parsed = new URL(url);
    if (base.protocol !== 'https:' || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.searchParams.has('allow_redirect')) {
      throw new Error('Invalid Matrix media URL');
    }
    if (parsed.origin !== base.origin) throw new Error('Matrix media URL crosses homeserver origin');
    const basePath = base.pathname.replace(/\/+$/, '') || '';
    if (basePath && (!parsed.pathname.startsWith(`${basePath}/`) && parsed.pathname !== basePath)) throw new Error('Matrix media URL crosses homeserver base path');
    const relative = basePath ? parsed.pathname.slice(basePath.length) : parsed.pathname;
    if (!/^\/_matrix\/client\/v1\/media\/(?:download|thumbnail)\/[^/]+\/[^/]+$/u.test(relative)) throw new Error('Invalid Matrix media path');
    for (const segment of parsed.pathname.split('/')) {
      let decoded: string;
      try { decoded = decodeURIComponent(segment); } catch { throw new Error('Invalid Matrix media traversal'); }
      if (decoded === '..' || decoded === '.' || decoded.includes('/') || decoded.includes('\\')) throw new Error('Invalid Matrix media traversal');
    }
    for (const key of ['width', 'height']) {
      const value = parsed.searchParams.get(key);
      if (value !== null && (!/^\d{1,4}$/u.test(value) || Number(value) < 1 || Number(value) > 4096)) throw new Error('Invalid media dimensions');
    }
    try {
      const response = await fetch(parsed.href, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        redirect: 'error',
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`Media fetch failed (${response.status})`);
      return await response.blob();
    } catch (error) {
      if (signal.aborted) throw error;
      const segments = parsed.pathname.split('/').filter(Boolean);
      const mediaIndex = segments.indexOf('media');
      if (mediaIndex < 0 || segments[mediaIndex - 1] !== 'v1') throw error;
      const kindSegment = segments[mediaIndex + 1];
      const mxcServer = segments[mediaIndex + 2];
      const mxcId = segments[mediaIndex + 3];
      if (!mxcServer || !mxcId || segments.length !== mediaIndex + 4) throw error;
      const kind = kindSegment === 'thumbnail' ? 'thumbnail' : 'download';
      const size = kind === 'thumbnail' ? parsed.searchParams.get('width') : null;
      const bytes = await invoke<number[]>('media_download', {
        mxc: `mxc://${mxcServer}/${mxcId}`,
        kind,
        size: size ? Number(size) : undefined,
        userId: session.userId,
      });
      return new Blob([new Uint8Array(bytes)]);
    }
  }
}

export const desktopMediaTransport = new DesktopMediaTransport();
export const desktopOidcPlatform = new DesktopOidcPlatform();
export const desktopPersistence = new DesktopPersistence();
export const desktopAdapter: PlatformAdapter = {
  kind: 'desktop',
  persistence: desktopPersistence,
  oidc: desktopOidcPlatform,
  mediaTransport: desktopMediaTransport,
};

// Register before bootstrap's platform detection so desktop never falls back to browser storage.
registerPlatformAdapter(desktopAdapter);
