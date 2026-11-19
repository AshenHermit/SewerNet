import { invoke } from '@tauri-apps/api/core';
import type { AccountPersistence } from './contracts';
import type { AccountSnapshot, MatrixCredentials } from '../client/account-types';

export class DesktopPersistence implements AccountPersistence {
  async load(): Promise<AccountSnapshot> {
    return await invoke<AccountSnapshot>('accounts_load');
  }
  async upsertAccount(credentials: MatrixCredentials): Promise<void> {
    await invoke('account_upsert', { credentials });
  }
  async beginOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void> {
    await invoke('account_begin_operation', { userId, deviceId, reason });
  }
  async removeAccount(userId: string): Promise<void> {
    await invoke('account_remove', { userId });
  }
  async setActiveAccount(userId: string | null): Promise<void> {
    await invoke('account_set_active', { userId });
  }
  async clear(): Promise<void> {
    await invoke('accounts_clear');
  }
  async flush(): Promise<void> {
    await invoke('storage_flush');
  }
}
