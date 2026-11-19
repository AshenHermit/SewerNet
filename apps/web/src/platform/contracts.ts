import type { AccountSnapshot, MatrixCredentials } from '../client/account-types';

export interface AccountPersistence {
  load(): Promise<AccountSnapshot>;
  upsertAccount(c: MatrixCredentials): Promise<void>;
  beginOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void>;
  removeAccount(userId: string): Promise<void>;
  setActiveAccount(userId: string | null): Promise<void>;
  clear(): Promise<void>;
  flush(): Promise<void>;
}

export type { AccountSnapshot };
