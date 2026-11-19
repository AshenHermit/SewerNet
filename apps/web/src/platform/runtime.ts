import type { AccountPersistence } from './contracts';
import { BrowserPersistence } from './browser';

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

export function getPersistence(): AccountPersistence {
  if (!_persistence) {
    throw new Error('Persistence not initialized. Call initializePlatform() first.');
  }
  return _persistence;
}

export function _resetRuntimeForTesting(): void {
  _platformKind = null;
  _persistence = null;
}
