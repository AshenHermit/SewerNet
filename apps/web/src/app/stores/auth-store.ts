import { create } from 'zustand';
import {
  getActiveAccount,
  getBlockedAccounts,
  subscribeAccounts,
} from '../../client/accounts';
import type { MatrixCredentials } from '../../client/account-types';

/**
 * Memory-only auth state. The durable account repository is the source of
 * truth: this store never persists credentials and exposes no write path other
 * than hydration from committed snapshots.
 */
export type AuthStatus = 'loading' | 'ready' | 'storage-error';

export interface AuthState {
  credentials: MatrixCredentials | null;
  status: AuthStatus;
  error: string | null;
}

export const useAuthStore = create<AuthState>()(() => ({
  credentials: null,
  status: 'loading',
  error: null,
}));

let subscribed = false;
let unsubscribe: (() => void) | null = null;

function publish(): void {
  if (!subscribed) {
    return;
  }
  try {
    const active = getActiveAccount();
    const blocked = active ? getBlockedAccounts()[active.userId] : undefined;
    if (active && blocked) {
      // A crash/failed rotation left a barrier: never auto-resume it, require
      // an explicit new login instead.
      useAuthStore.setState({
        credentials: null,
        status: 'storage-error',
        error: `blocked-${blocked.reason}`,
      });
      return;
    }
    useAuthStore.setState({ credentials: active, status: 'ready', error: null });
  } catch (e) {
    useAuthStore.setState({
      credentials: null,
      status: 'storage-error',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Reads the initialized account snapshot and subscribes to committed changes.
 * Must only run after `initializeAccounts`; storage errors are reported through
 * `status`, never thrown into the render path.
 */
export function hydrateAuthStore(): void {
  subscribed = true;
  publish();
  if (!unsubscribe) {
    unsubscribe = subscribeAccounts(publish);
  }
}

/** Removes the live credentials from the UI before a logout/teardown. */
export function clearPublishedCredentials(userId?: string): void {
  const current = useAuthStore.getState().credentials;
  if (userId && current && current.userId !== userId) {
    return;
  }
  useAuthStore.setState({ credentials: null });
}

/** Surfaces a durable-storage failure without pretending the session is valid. */
export function setAuthStorageError(error: string): void {
  useAuthStore.setState({ credentials: null, status: 'storage-error', error });
}

/** Test-only reset of the store and its subscription. */
export function _resetAuthStoreForTesting(): void {
  subscribed = false;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  useAuthStore.setState({ credentials: null, status: 'loading', error: null });
}
