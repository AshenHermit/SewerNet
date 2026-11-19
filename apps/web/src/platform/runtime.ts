import type { AccountPersistence } from './contracts';
import { BrowserPersistence } from './browser';
import type { MediaSession, MediaTransport } from './contracts';
import { getActiveAccount } from '../client/accounts';
import { getSessionEpoch } from '../client/session';

let _mediaTransport: MediaTransport | null = null;

let _platformKind: 'browser' | 'desktop' | null = null;
let _persistence: AccountPersistence | null = null;

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

  _platformKind = isNative ? 'desktop' : 'browser';

  if (_platformKind === 'desktop') {
    if (!_persistence) {
      throw new Error('desktop adapter unavailable');
    }
    // Desktop adapter will be installed via setAccountPersistence before initialization
  } else {
    _persistence = new BrowserPersistence();
    _mediaTransport = {
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
}
