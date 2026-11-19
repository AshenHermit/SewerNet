import { invoke } from '@tauri-apps/api/core';
import type { AccountPersistence, OidcPlatform } from './contracts';
import type { AccountSnapshot, MatrixCredentials } from '../client/account-types';
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

export const desktopOidcPlatform = new DesktopOidcPlatform();
export const desktopPersistence = new DesktopPersistence();
export const desktopAdapter: PlatformAdapter = {
  kind: 'desktop',
  persistence: desktopPersistence,
  oidc: desktopOidcPlatform,
};

// Register before bootstrap's platform detection so desktop never falls back to browser storage.
registerPlatformAdapter(desktopAdapter);
