import type { AccountPersistence, OidcPlatform } from './contracts';
import type { ClaimedOidcCallback, StoredOidcFlow } from './oidc-contract';
import type { AccountSnapshot, MatrixCredentials, OidcSession } from '../client/account-types';

const ACCOUNTS_KEY = 'sewernet_accounts';
const ACTIVE_KEY = 'sewernet_active_account';
const BLOCKED_KEY = 'sewernet_blocked_accounts_v1';

type BlockedReason = 'refresh' | 'delete';
type BlockedMap = Record<string, { deviceId: string; reason: BlockedReason }>;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function assertValidHomeserverUrl(homeserverUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(homeserverUrl);
  } catch {
    throw new Error('invalid homeserverUrl');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('homeserverUrl must not include credentials, query, or fragment');
  }
  if (parsed.protocol === 'https:') {
    return;
  }
  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return;
  }
  throw new Error('homeserverUrl must be https (http only for loopback)');
}

function assertValidOidc(oidc: unknown): OidcSession {
  if (!oidc || typeof oidc !== 'object' || Array.isArray(oidc)) {
    throw new Error('invalid oidc session');
  }
  const value = oidc as Record<string, unknown>;
  if (
    !isNonEmptyString(value['issuer']) ||
    !isNonEmptyString(value['clientId']) ||
    !isNonEmptyString(value['redirectUri']) ||
    (value['responseMode'] !== 'query' && value['responseMode'] !== 'fragment') ||
    !value['idTokenClaims'] ||
    typeof value['idTokenClaims'] !== 'object' ||
    Array.isArray(value['idTokenClaims'])
  ) {
    throw new Error('invalid oidc session fields');
  }
  if (value['revocationEndpoint'] !== undefined && !isNonEmptyString(value['revocationEndpoint'])) {
    throw new Error('invalid oidc revocationEndpoint');
  }
  return {
    issuer: value['issuer'],
    clientId: value['clientId'],
    redirectUri: value['redirectUri'],
    responseMode: value['responseMode'],
    ...(value['revocationEndpoint'] !== undefined
      ? { revocationEndpoint: value['revocationEndpoint'] }
      : {}),
    idTokenClaims: value['idTokenClaims'] as Record<string, unknown>,
  };
}

function parseAccounts(rawAccounts: string): Record<string, MatrixCredentials> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAccounts);
  } catch (e) {
    throw new Error(`Malformed accounts data: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Malformed accounts data: not an object');
  }

  const accounts: Record<string, MatrixCredentials> = {};
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Malformed accounts data: invalid entry for ${key}`);
    }
    const value = entry as Record<string, unknown>;
    if (
      !isNonEmptyString(value['userId']) ||
      !isNonEmptyString(value['accessToken']) ||
      !isNonEmptyString(value['deviceId']) ||
      !isNonEmptyString(value['homeserverUrl'])
    ) {
      throw new Error(`Malformed accounts data: missing required fields for ${key}`);
    }
    if (value['userId'] !== key) {
      throw new Error(`Malformed accounts data: map key/userId mismatch for ${key}`);
    }
    try {
      assertValidHomeserverUrl(value['homeserverUrl']);
    } catch (e) {
      throw new Error(
        `Malformed accounts data: ${e instanceof Error ? e.message : String(e)} for ${key}`,
      );
    }

    const credentials: MatrixCredentials = {
      userId: value['userId'],
      accessToken: value['accessToken'],
      deviceId: value['deviceId'],
      homeserverUrl: value['homeserverUrl'],
    };

    if (value['refreshToken'] !== undefined) {
      if (!isNonEmptyString(value['refreshToken'])) {
        throw new Error(`Malformed accounts data: invalid refreshToken for ${key}`);
      }
      credentials.refreshToken = value['refreshToken'];
    }
    if (value['expiresInMs'] !== undefined) {
      if (
        typeof value['expiresInMs'] !== 'number' ||
        !Number.isFinite(value['expiresInMs']) ||
        value['expiresInMs'] < 0
      ) {
        throw new Error(`Malformed accounts data: invalid expiresInMs for ${key}`);
      }
      credentials.expiresInMs = value['expiresInMs'];
    }
    if (value['oidc'] !== undefined) {
      try {
        credentials.oidc = assertValidOidc(value['oidc']);
      } catch (e) {
        throw new Error(
          `Malformed accounts data: ${e instanceof Error ? e.message : String(e)} for ${key}`,
        );
      }
    }

    accounts[key] = credentials;
  }
  return accounts;
}

function readBlocked(): BlockedMap {
  const raw = localStorage.getItem(BLOCKED_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    const result: BlockedMap = {};
    for (const [userId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      const e = entry as Record<string, unknown> | null;
      if (
        !e ||
        typeof e !== 'object' ||
        typeof e['deviceId'] !== 'string' ||
        (e['reason'] !== 'refresh' && e['reason'] !== 'delete')
      ) {
        throw new Error(`invalid entry for ${userId}`);
      }
      result[userId] = { deviceId: e['deviceId'], reason: e['reason'] };
    }
    return result;
  } catch (e) {
    throw new Error(`Malformed blocked accounts data: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function writeBlocked(map: BlockedMap): void {
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(map));
  } catch (e) {
    throw new Error(`Failed to write blocked accounts: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function removeBlockedEntry(userId: string): void {
  const blocked = readBlocked();
  if (userId in blocked) {
    delete blocked[userId];
    writeBlocked(blocked);
  }
}

export class BrowserOidcPlatform implements OidcPlatform {
  redirectUri(): string { return new URL('/oidc/callback', window.location.origin).toString(); }
  applicationType(): 'web' | 'native' { return window.location.protocol === 'https:' ? 'web' : 'native'; }
  clientUri(): string {
    if (window.location.protocol === 'https:') {
      return window.location.origin;
    }
    // OIDC providers (e.g. matrix.org MAS) require client_uri to be HTTPS.
    // In dev (HTTP localhost) use a valid HTTPS placeholder so registration succeeds.
    return 'https://github.com/AshenHermit/SewerNet';
  }
  async savePending(flow: StoredOidcFlow): Promise<void> {
    sessionStorage.setItem('sewernet:desktop_oidc_pending', JSON.stringify(flow));
  }
  async claimCallback(url: string): Promise<ClaimedOidcCallback> {
    const parsed = new URL(url);
    const state = parsed.searchParams.get('state');
    const code = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');
    const flow = await this.loadPending();
    if (!flow || flow.state !== state) throw new Error('oidc_invalid_state');
    await this.clearPending(state ?? undefined);
    return { flow, callback: { state: state!, code: code ?? undefined, error: error ?? undefined } };
  }
  async clearPending(state?: string): Promise<void> {
    const flow = await this.loadPending();
    if (!state || flow?.state === state) sessionStorage.removeItem('sewernet:desktop_oidc_pending');
  }
  async openAuthorization(url: string): Promise<void> { window.location.assign(url); }
  async listenCallbacks(handler: (url: string) => void): Promise<() => void> {
    const callback = () => handler(window.location.href);
    window.addEventListener('popstate', callback);
    return () => window.removeEventListener('popstate', callback);
  }
  private async loadPending(): Promise<StoredOidcFlow | null> {
    try { return JSON.parse(sessionStorage.getItem('sewernet:desktop_oidc_pending') ?? 'null') as StoredOidcFlow | null; }
    catch { return null; }
  }
}

export class BrowserPersistence implements AccountPersistence {
  async load(): Promise<AccountSnapshot> {
    const rawAccounts = localStorage.getItem(ACCOUNTS_KEY);
    const activeUserId = localStorage.getItem(ACTIVE_KEY);

    const accounts = rawAccounts ? parseAccounts(rawAccounts) : {};

    // Legacy snapshots without blockedAccounts default to {}
    return { accounts, activeUserId, blockedAccounts: readBlocked() };
  }

  async upsertAccount(c: MatrixCredentials): Promise<void> {
    const rawAccounts = localStorage.getItem(ACCOUNTS_KEY);
    let accounts: Record<string, MatrixCredentials> = {};
    if (rawAccounts) {
      try {
        accounts = JSON.parse(rawAccounts) as Record<string, MatrixCredentials>;
      } catch (e) {
        throw new Error(`Malformed accounts data: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    accounts[c.userId] = c;
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (e) {
      // Surface quota/security errors as failures
      throw new Error(`Failed to write accounts: ${e instanceof Error ? e.message : String(e)}`);
    }
    removeBlockedEntry(c.userId);
  }

  async beginOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void> {
    const blocked = readBlocked();
    blocked[userId] = { deviceId, reason };
    writeBlocked(blocked);
  }

  async removeAccount(userId: string): Promise<void> {
    const rawAccounts = localStorage.getItem(ACCOUNTS_KEY);
    let accounts: Record<string, MatrixCredentials> = {};
    if (rawAccounts) {
      try {
        accounts = JSON.parse(rawAccounts) as Record<string, MatrixCredentials>;
      } catch (e) {
        throw new Error(`Malformed accounts data: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    delete accounts[userId];
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (e) {
      throw new Error(`Failed to write accounts: ${e instanceof Error ? e.message : String(e)}`);
    }
    removeBlockedEntry(userId);

    if (localStorage.getItem(ACTIVE_KEY) === userId) {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }

  async setActiveAccount(userId: string | null): Promise<void> {
    if (userId === null) {
      localStorage.removeItem(ACTIVE_KEY);
    } else {
      localStorage.setItem(ACTIVE_KEY, userId);
    }
  }

  async clear(): Promise<void> {
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(BLOCKED_KEY);
  }

  async flush(): Promise<void> {
    // Browser localStorage is synchronous, flush is a no-op
  }
}
