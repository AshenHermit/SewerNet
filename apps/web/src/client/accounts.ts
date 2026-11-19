/**
 * Persisted Matrix account storage — async account repository with
 * platform-agnostic persistence contract.
 */

import type { AccountPersistence, AccountSnapshot } from '../platform/contracts';
import type { MatrixCredentials } from './account-types';

// Re-export for backward compatibility
export type { OidcSession, MatrixCredentials, AccountSnapshot } from './account-types';

let _persistence: AccountPersistence | null = null;
let _snapshot: AccountSnapshot | null = null;
let _operationQueue: Promise<void> = Promise.resolve();
const _listeners = new Set<() => void>();

const LEGACY_AUTH_KEY = 'sewernet:auth';

export async function initializeAccounts(storage: AccountPersistence): Promise<void> {
  if (_persistence) {
    throw new Error('Accounts already initialized');
  }
  _persistence = storage;
  _snapshot = await storage.load();

  // Active account can only reference committed accounts
  if (_snapshot.activeUserId && !_snapshot.accounts[_snapshot.activeUserId]) {
    _snapshot.activeUserId = null;
  }
}

function ensureInitialized(): void {
  if (!_snapshot) {
    throw new Error('Accounts not initialized. Call initializeAccounts() first.');
  }
}

function notifyListeners(): void {
  for (const listener of _listeners) {
    listener();
  }
}

async function queued<T>(fn: () => Promise<T>): Promise<T> {
  const result = _operationQueue.then(fn);
  _operationQueue = result
    .then(() => undefined)
    .catch(() => {
      // Prevent unhandled rejections while preserving the original error.
    });
  return result;
}

export function subscribeAccounts(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function getAccount(userId: string): MatrixCredentials | null {
  ensureInitialized();
  const snapshot = _snapshot;
  if (!snapshot) {
    throw new Error('Accounts not initialized');
  }
  return snapshot.accounts[userId] ?? null;
}

export function listAccounts(): MatrixCredentials[] {
  ensureInitialized();
  const snapshot = _snapshot;
  if (!snapshot) {
    throw new Error('Accounts not initialized');
  }
  return Object.values(snapshot.accounts);
}

export function getActiveUserId(): string | null {
  ensureInitialized();
  const snapshot = _snapshot;
  if (!snapshot) {
    throw new Error('Accounts not initialized');
  }
  return snapshot.activeUserId;
}

export function getActiveAccount(): MatrixCredentials | null {
  const id = getActiveUserId();
  return id ? getAccount(id) : null;
}

export async function upsertAccount(c: MatrixCredentials): Promise<void> {
  return queued(async () => {
    ensureInitialized();
    const persistence = _persistence;
    const snapshot = _snapshot;
    if (!persistence || !snapshot) {
      throw new Error('Accounts not initialized');
    }
    await persistence.upsertAccount(c);
    snapshot.accounts[c.userId] = c;
    notifyListeners();
  });
}

export async function removeAccount(userId: string): Promise<void> {
  return queued(async () => {
    ensureInitialized();
    const persistence = _persistence;
    const snapshot = _snapshot;
    if (!persistence || !snapshot) {
      throw new Error('Accounts not initialized');
    }
    await persistence.removeAccount(userId);
    delete snapshot.accounts[userId];
    if (snapshot.activeUserId === userId) {
      snapshot.activeUserId = null;
      await persistence.setActiveAccount(null);
    }
    notifyListeners();
  });
}

export async function setActiveAccount(userId: string | null): Promise<void> {
  return queued(async () => {
    ensureInitialized();
    const persistence = _persistence;
    const snapshot = _snapshot;
    if (!persistence || !snapshot) {
      throw new Error('Accounts not initialized');
    }
    if (userId && !snapshot.accounts[userId]) {
      throw new Error(`Cannot set active account for unknown user: ${userId}`);
    }
    await persistence.setActiveAccount(userId);
    snapshot.activeUserId = userId;
    notifyListeners();
  });
}

export async function clearAllAccounts(): Promise<void> {
  return queued(async () => {
    ensureInitialized();
    const persistence = _persistence;
    const snapshot = _snapshot;
    if (!persistence || !snapshot) {
      throw new Error('Accounts not initialized');
    }
    await persistence.clear();
    snapshot.accounts = {};
    snapshot.activeUserId = null;
    snapshot.blockedAccounts = {};
    notifyListeners();
  });
}

export async function flushAccounts(): Promise<void> {
  return queued(async () => {
    ensureInitialized();
    const persistence = _persistence;
    if (!persistence) {
      throw new Error('Accounts not initialized');
    }
    await persistence.flush();
  });
}

export async function saveAndActivateAccount(c: MatrixCredentials): Promise<void> {
  return queued(async () => {
    ensureInitialized();
    const persistence = _persistence;
    const snapshot = _snapshot;
    if (!persistence || !snapshot) {
      throw new Error('Accounts not initialized');
    }
    await persistence.upsertAccount(c);
    await persistence.setActiveAccount(c.userId);
    snapshot.accounts[c.userId] = c;
    snapshot.activeUserId = c.userId;
    notifyListeners();
  });
}

export async function beginAccountOperation(
  userId: string,
  deviceId: string,
  reason: 'refresh' | 'delete',
): Promise<void> {
  return queued(async () => {
    ensureInitialized();
    const persistence = _persistence;
    const snapshot = _snapshot;
    if (!persistence || !snapshot) {
      throw new Error('Accounts not initialized');
    }
    snapshot.blockedAccounts[userId] = { deviceId, reason };
    await persistence.beginOperation(userId, deviceId, reason);
  });
}

/** Removes the pre-migration `sewernet:auth` zustand-persist key. */
export function cleanupLegacyStorage(): void {
  localStorage.removeItem(LEGACY_AUTH_KEY);
}

/** Reset internal state for testing only. */
export function _resetForTesting(): void {
  _persistence = null;
  _snapshot = null;
  _operationQueue = Promise.resolve();
  _listeners.clear();
}
