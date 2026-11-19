import type { AccountPersistence } from './contracts';
import type { AccountSnapshot, MatrixCredentials } from '../client/account-types';

const ACCOUNTS_KEY = 'sewernet_accounts';
const ACTIVE_KEY = 'sewernet_active_account';

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
    return { accounts, activeUserId, blockedAccounts: {} };
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
  }

  async beginOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void> {
    // Browser persistence doesn't need durable operation tracking
    // This is a no-op for browser (desktop adapter will implement this)
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
  }

  async flush(): Promise<void> {
    // Browser localStorage is synchronous, flush is a no-op
  }
}
