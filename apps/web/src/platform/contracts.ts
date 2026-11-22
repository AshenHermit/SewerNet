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
  // File size in bytes. Used for cache keying / validation only; NOT thumbnail dimensions.
  size?: number;
  // Requested thumbnail side length in pixels. Set only for avatars/thumbnails; messages omit it.
  thumbnail?: number;
  encryptedFile?: MatrixEncryptedFile;
}

export interface MediaTransport {
  fetchBlob(url: string, session: MediaSession, signal: AbortSignal): Promise<Blob>;
  upload(file: Blob, contentType: string, filename: string, session: MediaSession, signal: AbortSignal): Promise<string>;
}

export interface OidcPlatform {
  redirectUri(): string;
  applicationType(): 'web' | 'native';
  clientUri(): string;
  savePending(flow: import('./oidc-contract').StoredOidcFlow): Promise<void>;
  claimCallback(url: string): Promise<import('./oidc-contract').ClaimedOidcCallback>;
  clearPending(state?: string): Promise<void>;
  openAuthorization(url: string): Promise<void>;
  listenCallbacks(handler: (url: string) => void): Promise<() => void>;
}

export interface PlatformAdapter {
  readonly kind: 'browser' | 'desktop';
  readonly persistence: AccountPersistence;
  readonly oidc: OidcPlatform;
  readonly mediaTransport?: MediaTransport;
  migrateLegacyStorage?(): Promise<void>;
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
