/**
 * One durable path for bootstrap/login/refresh/logout.
 *
 * Session epochs tombstone a live session: a late refresh that captured an
 * older epoch can never write tokens back, and the durable account barrier is
 * always written *before* a network refresh.
 */

import type { MatrixCredentials, OidcSession } from './account-types';
import {
  beginAccountOperation,
  getAccount,
  getActiveUserId,
  removeAccount,
  saveAndActivateAccount,
  upsertAccount,
} from './accounts';
import { clearPublishedCredentials, setAuthStorageError } from '../app/stores/auth-store';
import { getPlatformKind } from '../platform/runtime';
import { clearSessionFromSw, postSessionToSw } from '../lib/sw-session';

const NETWORK_LOGOUT_TIMEOUT_MS = 10_000;

export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiry?: Date;
}

export interface SessionCapture {
  userId: string;
  deviceId: string;
  epoch: number;
}

export interface LiveSessionOps {
  stop(userId: string): void;
  getClient(userId: string): SessionClient | null;
  deleteLocalData(userId: string): Promise<void>;
  getActiveUserId(): string | null;
}

export interface SessionClient {
  logout(softLogout: boolean): Promise<unknown>;
}

const _epochs = new Map<string, number>();
let _liveOps: LiveSessionOps | null = null;

/** Registers the Matrix client lifecycle owned by `init-matrix`. */
export function registerLiveSessionOps(ops: LiveSessionOps | null): void {
  _liveOps = ops;
}

export function getSessionEpoch(userId: string): number {
  return _epochs.get(userId) ?? 0;
}

function bumpSessionEpoch(userId: string): number {
  const next = getSessionEpoch(userId) + 1;
  _epochs.set(userId, next);
  return next;
}

export function captureSession(userId: string, deviceId: string): SessionCapture {
  return { userId, deviceId, epoch: getSessionEpoch(userId) };
}

/** A stale capture belongs to a tombstoned session; it must not be revived. */
class StaleSessionError extends Error {
  constructor(message = 'Session is no longer current') {
    super(message);
    this.name = 'StaleSessionError';
  }
}

function assertCurrent(capture: SessionCapture): MatrixCredentials {
  if (getSessionEpoch(capture.userId) !== capture.epoch) {
    throw new StaleSessionError();
  }
  const current = getAccount(capture.userId);
  if (!current) {
    throw new StaleSessionError('Session account is gone');
  }
  if (current.deviceId !== capture.deviceId) {
    throw new StaleSessionError('Session device changed');
  }
  return current;
}

function safeGetAccount(userId: string): MatrixCredentials | null {
  try {
    return getAccount(userId);
  } catch {
    return null;
  }
}

function safeActiveUserId(): string | null {
  try {
    return getActiveUserId();
  } catch {
    return null;
  }
}

function isBrowserRuntime(): boolean {
  try {
    return getPlatformKind() === 'browser';
  } catch {
    return false;
  }
}

/**
 * Posts the rotated token to the media-proxy worker. Browser only: a desktop
 * runtime has no supported worker, and waiting for it would stall refreshes.
 */
export async function publishSessionToSw(
  accessToken: string,
  baseUrl: string,
): Promise<void> {
  if (!isBrowserRuntime()) {
    return;
  }
  try {
    await postSessionToSw(accessToken, baseUrl);
  } catch {
    // media proxying is best-effort, credentials are already committed
  }
}

async function clearBrowserSwSession(): Promise<void> {
  if (!isBrowserRuntime()) {
    return;
  }
  try {
    await clearSessionFromSw();
  } catch {
    // teardown is best-effort; local deletion follows
  }
}

/**
 * A fresh login supersedes every older session for the user. The epoch bump
 * happens before the awaited commit, so an older in-flight refresh can never
 * overwrite the newly committed tokens.
 */
export async function commitLogin(c: MatrixCredentials): Promise<void> {
  bumpSessionEpoch(c.userId);
  await saveAndActivateAccount(c);
}

export interface RefreshFallback {
  baseUrl?: string;
  refreshToken?: string;
  oidc?: OidcSession;
}

/**
 * Durable refresh: barrier -> network -> epoch re-check -> awaited commit.
 * Tokens are returned only after the commit resolved, so SDK callers never act
 * on a token that could not be stored.
 */
export async function refreshSessionTokens(
  capture: SessionCapture,
  requestTokens: () => Promise<RefreshedTokens>,
  fallback: RefreshFallback = {},
): Promise<RefreshedTokens> {
  // A live session that was already tombstoned must not even start a barrier.
  assertCurrent(capture);

  try {
    await beginAccountOperation(capture.userId, capture.deviceId, 'refresh');
  } catch (err) {
    // Without a durable barrier the token endpoint must never be called.
    quarantineAccount(capture.userId, 'refresh-save');
    throw err;
  }

  // The barrier write is awaited: a logout/new login may have tombstoned the
  // session while it was in flight. Do not touch the token endpoint then.
  assertCurrent(capture);

  let tokens: RefreshedTokens;
  try {
    tokens = await requestTokens();
  } catch (err) {
    // An indeterminate result may have consumed the rotating token: keep the
    // barrier and require a new login instead of replaying it.
    quarantineAccount(capture.userId, 'refresh-save');
    throw err;
  }

  try {
    const previous = assertCurrent(capture);
    const next: MatrixCredentials = {
      userId: capture.userId,
      deviceId: capture.deviceId,
      homeserverUrl: previous.homeserverUrl || fallback.baseUrl || '',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? previous.refreshToken ?? fallback.refreshToken,
      expiresInMs: tokens.expiry
        ? tokens.expiry.getTime() - Date.now()
        : previous.expiresInMs,
      oidc: previous.oidc ?? fallback.oidc,
    };
    await upsertAccount(next);
    await publishSessionToSw(next.accessToken, next.homeserverUrl);
    return tokens;
  } catch (err) {
    if (err instanceof StaleSessionError) {
      // The session was logged out or replaced: its owner already handles the
      // state, quarantining here would kill the *new* session.
      throw err;
    }
    quarantineAccount(capture.userId, 'refresh-save');
    throw err;
  }
}

/**
 * Immediately blocks a live session after a failed durable operation: the SDK
 * client is stopped, no UI credentials remain, and the barrier is recorded so
 * the next start warns instead of auto-resuming.
 */
export function quarantineAccount(
  userId: string,
  reason: 'refresh-save' | 'delete-failed',
): void {
  bumpSessionEpoch(userId);
  const account = safeGetAccount(userId);
  try {
    _liveOps?.stop(userId);
  } catch {
    // stopping is best-effort; the epoch + barrier still guard writes
  }
  clearPublishedCredentials(userId);
  // Browser media proxying must not keep serving a quarantined token.
  void clearBrowserSwSession();
  setAuthStorageError(
    reason === 'refresh-save'
      ? 'refresh-failed: sign in again'
      : 'delete-failed: local session data could not be removed',
  );
  if (account) {
    void beginAccountOperation(
      userId,
      account.deviceId,
      reason === 'refresh-save' ? 'refresh' : 'delete',
    ).catch(() => {
      // Storage is already failing; the live session is stopped regardless.
    });
  }
}

async function bestEffortNetworkLogout(client: SessionClient | null): Promise<void> {
  if (!client) {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.logout(true),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, NETWORK_LOGOUT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // network revocation is best-effort; local deletion is authoritative
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Logout order: tombstone the epoch, remove the live client/UI from reach,
 * then await local deletion and treat network logout as best-effort. A failed
 * deletion is reported (and quarantined), never presented as success.
 */
export async function logoutAccount(userId: string): Promise<void> {
  bumpSessionEpoch(userId);
  const account = safeGetAccount(userId);
  const client = _liveOps?.getClient(userId) ?? null;

  try {
    _liveOps?.stop(userId);
  } catch {
    // the client is excluded from every map even if stop() throws
  }
  clearPublishedCredentials(userId);
  await clearBrowserSwSession();

  try {
    if (account) {
      await beginAccountOperation(userId, account.deviceId, 'delete');
    }
    await _liveOps?.deleteLocalData(userId);
    await removeAccount(userId);
  } catch (err) {
    quarantineAccount(userId, 'delete-failed');
    throw err;
  } finally {
    // Local credentials are authoritative; token revocation is best-effort and
    // must never delay or mask the local deletion above.
    void bestEffortNetworkLogout(client);
  }
}

/** Session facade kept for UI callers: logs out the active account. */
export async function logoutCurrent(): Promise<void> {
  const userId = safeActiveUserId() ?? _liveOps?.getActiveUserId() ?? null;
  if (!userId) {
    return;
  }
  await logoutAccount(userId);
}

/** Test-only reset of epochs and registered live-session operations. */
export function _resetSessionForTesting(): void {
  _epochs.clear();
  _liveOps = null;
}
