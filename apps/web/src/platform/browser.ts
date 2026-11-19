import type { AccountPersistence } from './contracts';
import type { AccountSnapshot, MatrixCredentials } from '../client/account-types';

const ACCOUNTS_KEY = 'sewernet_accounts';
const ACTIVE_KEY = 'sewernet_active_account';
const BLOCKED_KEY = 'sewernet_blocked_accounts_v1';

type BlockedReason = 'refresh' | 'delete';
type BlockedMap = Record<string, { deviceId: string; reason: BlockedReason }>;

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

export class BrowserPersistence implements AccountPersistence {
  async load(): Promise<AccountSnapshot> {
    const rawAccounts = localStorage.getItem(ACCOUNTS_KEY);
    const activeUserId = localStorage.getItem(ACTIVE_KEY);

    let accounts: Record<string, MatrixCredentials> = {};
    if (rawAccounts) {
      try {
        accounts = JSON.parse(rawAccounts) as Record<string, MatrixCredentials>;
      } catch (e) {
        throw new Error(`Malformed accounts data: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

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
