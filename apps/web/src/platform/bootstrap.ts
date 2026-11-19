/**
 * One bootstrap path: select the platform, install desktop callbacks, load the
 * durable account snapshot, then hydrate the in-memory auth store.
 *
 * Nothing here reads storage at import time, and a failure stays retryable:
 * the UI shows an explicit retry and never falls back to a blank account.
 */

import { cleanupLegacyStorage, initializeAccounts } from '../client/accounts';
import {
  hydrateAuthStore,
  setAuthStorageError,
} from '../app/stores/auth-store';
import { getPersistence, getPlatformKind, initializePlatform } from './runtime';

export type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BootstrapSnapshot {
  status: BootstrapStatus;
  error: string | null;
}

/** Desktop Task 4 registers its callback queue/listener here. */
type DesktopInstaller = () => void | Promise<void>;

let _desktopInstaller: DesktopInstaller | null = null;
let _snapshot: BootstrapSnapshot = { status: 'idle', error: null };
let _platformReady = false;
let _accountsReady = false;
let _booting: Promise<void> | null = null;
const _listeners = new Set<() => void>();

export function registerDesktopBootstrap(installer: DesktopInstaller): void {
  _desktopInstaller = installer;
}

function setSnapshot(next: BootstrapSnapshot): void {
  _snapshot = next;
  for (const listener of _listeners) {
    listener();
  }
}

export function getBootstrapSnapshot(): BootstrapSnapshot {
  return _snapshot;
}

export function subscribeBootstrap(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

async function runBootstrap(): Promise<void> {
  setSnapshot({ status: 'loading', error: null });
  try {
    if (!_platformReady) {
      await initializePlatform();
      _platformReady = true;
    }
    if (getPlatformKind() === 'desktop' && _desktopInstaller) {
      await _desktopInstaller();
    }
    if (!_accountsReady) {
      await initializeAccounts(getPersistence());
      _accountsReady = true;
    }
    // The legacy key is browser-only and removed only after the platform was
    // selected and the durable snapshot loaded.
    if (getPlatformKind() === 'browser') {
      cleanupLegacyStorage();
    }
    hydrateAuthStore();
    setSnapshot({ status: 'ready', error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setAuthStorageError(message);
    setSnapshot({ status: 'error', error: message });
    throw e;
  }
}

/** Idempotent and retryable: a failed run can be started again explicitly. */
export function bootstrapSession(): Promise<void> {
  if (_snapshot.status === 'ready') {
    return Promise.resolve();
  }
  if (_booting) {
    return _booting;
  }
  _booting = runBootstrap().finally(() => {
    _booting = null;
  });
  return _booting;
}

/** Test-only reset of module state (successful runs are otherwise sticky). */
export function _resetBootstrapForTesting(): void {
  _snapshot = { status: 'idle', error: null };
  _platformReady = false;
  _accountsReady = false;
  _booting = null;
  _listeners.clear();
  _desktopInstaller = null;
}
