import type { AccountPersistence, PlatformAdapter } from './contracts';
import { BrowserOidcPlatform, BrowserPersistence } from './browser';
import type { MediaSession, MediaTransport } from './contracts';
import { getActiveAccount } from '../client/accounts';
import { getSessionEpoch } from '../client/session';

let _mediaTransport: MediaTransport | null = null;

let _oidc: import('./contracts').OidcPlatform | null = null;
let _adapter: PlatformAdapter | null = null;
let _platformKind: 'browser' | 'desktop' | null = null;
let _persistence: AccountPersistence | null = null;

export function registerPlatformAdapter(adapter: PlatformAdapter): void {
  _adapter = adapter;
  _persistence = adapter.persistence;
  _oidc = adapter.oidc;
  _mediaTransport = adapter.mediaTransport ?? null;
}

export function getPlatformAdapter(): PlatformAdapter | null { return _adapter; }

export async function initializePlatform(): Promise<void> {
  let isNative = false;

  try {
    // Lazy import Tauri API to avoid native modules in browser runtime
    const tauriModule = await import('@tauri-apps/api/core');
    isNative = tauriModule.isTauri?.() ?? false;
  } catch {
    // Tauri API not available, assume browser
    isNative = false;
  }

  if (isNative) {
    _platformKind = 'desktop';
    if (!_adapter || _adapter.kind !== 'desktop') throw new Error('desktop adapter unavailable');
    _oidc = _adapter.oidc;
    _persistence = _adapter.persistence;
    _mediaTransport = _adapter.mediaTransport ?? null;
    return;
  }
  // Browser: always use localStorage-backed persistence, never the desktop
  // adapter registered by './platform/desktop'. Importing desktop module is
  // harmless on the web only if initializePlatform() forces browser storage.
  const persistence = new BrowserPersistence();
  const oidc = new BrowserOidcPlatform();
  const mediaTransport: MediaTransport = {
    async fetchBlob(url, session, signal) {
      const validated = new URL(url);
      if (validated.origin !== new URL(session.baseUrl).origin) throw new Error('Media origin changed');
      const response = await fetch(validated.href, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        redirect: 'error',
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`Media fetch failed (${response.status})`);
      return await response.blob();
    },
    async upload(file, contentType, filename, session, signal) {
      const base = new URL(session.baseUrl);
      const uploadUrl = new URL('/_matrix/client/v3/media/upload', base.origin);
      uploadUrl.pathname = base.pathname.replace(/\/+$/, '') + uploadUrl.pathname;
      const form = new FormData();
      form.append('file', file, filename);
      const response = await fetch(uploadUrl.href, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: form,
        signal,
      });
      if (!response.ok) throw new Error(`Media upload failed (${response.status})`);
      const json = await response.json();
      if (!json.content_uri) throw new Error('Media upload failed: no content_uri');
      return json.content_uri;
    },
  };
  const browserAdapter: PlatformAdapter = { kind: 'browser', persistence, oidc, mediaTransport };
  registerPlatformAdapter(browserAdapter);
  _adapter = browserAdapter;
  _persistence = persistence;
  _oidc = oidc;
  _mediaTransport = mediaTransport;
  _platformKind = 'browser';
  if (_platformKind === 'browser') {
    _persistence = _adapter.persistence;
    _oidc = _adapter.oidc;
    _mediaTransport = _adapter.mediaTransport ?? {
      async fetchBlob(url, session, signal) {
        const validated = new URL(url);
        if (validated.origin !== new URL(session.baseUrl).origin) throw new Error('Media origin changed');
        const response = await fetch(validated.href, {
          method: 'GET',
          headers: { Authorization: `Bearer ${session.accessToken}` },
          redirect: 'error',
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error(`Media fetch failed (${response.status})`);
        return await response.blob();
      },
      async upload(file, contentType, filename, session, signal) {
        const base = new URL(session.baseUrl);
        const uploadUrl = new URL('/_matrix/client/v3/media/upload', base.origin);
        uploadUrl.pathname = base.pathname.replace(/\/+$/, '') + uploadUrl.pathname;
        const form = new FormData();
        form.append('file', file, filename);
        const response = await fetch(uploadUrl.href, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
          body: form,
          signal,
        });
        if (!response.ok) throw new Error(`Media upload failed (${response.status})`);
        const json = await response.json();
        if (!json.content_uri) throw new Error('Media upload failed: no content_uri');
        return json.content_uri;
      },
    };
  }
}

export function getPlatformKind(): 'browser' | 'desktop' {
  if (_platformKind === null) {
    throw new Error('Platform not initialized. Call initializePlatform() first.');
  }
  return _platformKind;
}

export function setAccountPersistence(storage: AccountPersistence): void {
  _persistence = storage;
}

export function setOidcPlatform(oidc: import('./contracts').OidcPlatform): void {
  _oidc = oidc;
}

export function getOidcPlatform(): import('./contracts').OidcPlatform {
  if (!_oidc) throw new Error('OIDC platform not initialized');
  return _oidc;
}

export function setMediaTransport(transport: MediaTransport): void {
  _mediaTransport = transport;
}

export function getMediaTransport(): MediaTransport | null {
  return _mediaTransport;
}

export function getMediaSession(): MediaSession | null {
  try {
    const account = getActiveAccount();
    if (!account) return null;
    return {
      userId: account.userId,
      deviceId: account.deviceId,
      baseUrl: account.homeserverUrl,
      accessToken: account.accessToken,
      epoch: getSessionEpoch(account.userId),
    };
  } catch {
    return null;
  }
}

export function getPersistence(): AccountPersistence {
  if (!_persistence) {
    throw new Error('Persistence not initialized. Call initializePlatform() first.');
  }
  return _persistence;
}

export function _resetRuntimeForTesting(): void {
  _platformKind = null;
  _persistence = null;
  _mediaTransport = null;
  _oidc = null;
  _adapter = null;
}
