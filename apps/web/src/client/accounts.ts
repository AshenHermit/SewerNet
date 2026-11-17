/**
 * Persisted Matrix account storage — the single write point for
 * localStorage credentials. Keys: `sewernet_accounts` (Record by userId)
 * and `sewernet_active_account` (active userId).
 */

export interface OidcSession {
  issuer: string;
  clientId: string;
  redirectUri: string;
  responseMode: 'query' | 'fragment';
  revocationEndpoint?: string;
  idTokenClaims: Record<string, unknown>;
}

export interface MatrixCredentials {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeserverUrl: string;
  refreshToken?: string;
  /** ms until the access token expires (relative). */
  expiresInMs?: number;
  oidc?: OidcSession;
}

const ACCOUNTS_KEY = 'sewernet_accounts';
const ACTIVE_KEY = 'sewernet_active_account';
const LEGACY_AUTH_KEY = 'sewernet:auth';

function readAccounts(): Record<string, MatrixCredentials> {
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, MatrixCredentials>;
  } catch {
    return {};
  }
}

function writeAccounts(map: Record<string, MatrixCredentials>): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(map));
}

export function upsertAccount(c: MatrixCredentials): void {
  const map = readAccounts();
  map[c.userId] = c;
  writeAccounts(map);
}

export function removeAccount(userId: string): void {
  const map = readAccounts();
  delete map[userId];
  writeAccounts(map);
  if (getActiveUserId() === userId) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function getAccount(userId: string): MatrixCredentials | null {
  return readAccounts()[userId] ?? null;
}

export function listAccounts(): MatrixCredentials[] {
  return Object.values(readAccounts());
}

export function setActiveAccount(userId: string): void {
  localStorage.setItem(ACTIVE_KEY, userId);
}

export function getActiveUserId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function getActiveAccount(): MatrixCredentials | null {
  const id = getActiveUserId();
  return id ? getAccount(id) : null;
}

export function clearAllAccounts(): void {
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(ACTIVE_KEY);
}

/** Removes the pre-migration `sewernet:auth` zustand-persist key. */
export function cleanupLegacyStorage(): void {
  localStorage.removeItem(LEGACY_AUTH_KEY);
}
