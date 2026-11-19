import type { AccountSnapshot, MatrixCredentials } from '../client/account-types';
import type { MatrixEncryptedFile } from '../lib/attachment-crypto';

export interface MediaSession {
  userId: string;
  deviceId: string;
  baseUrl: string;
  accessToken: string;
  epoch: number;
}

export interface MediaSource {
  mxc: string;
  size?: number;
  encryptedFile?: MatrixEncryptedFile;
}

export interface MediaTransport {
  fetchBlob(url: string, session: MediaSession, signal: AbortSignal): Promise<Blob>;
}

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
