import {
  ClientEvent,
  createClient,
  IndexedDBStore,
  Method,
  type ICreateClientOpts,
  type MatrixClient,
} from 'matrix-js-sdk';
import { OidcTokenRefresher } from 'matrix-js-sdk/lib/oidc';
import type { AccessTokens, TokenRefreshFunction } from 'matrix-js-sdk/lib/http-api';
import type { MatrixCredentials, OidcSession } from './account-types';
import { getAccount, removeAccount, setActiveAccount, upsertAccount } from './accounts';
import { clearSessionFromSw, postSessionToSw } from '../lib/sw-session';
import { useAuthStore } from '../app/stores/auth-store';

let _client: MatrixClient | null = null;
/**
 * Every live client, keyed by userId. `_client` is only the *active* account's
 * client; the map keeps per-account clients apart so one account's build or
 * logout can never reach into another account's client (blocker #1).
 */
const clients = new Map<string, MatrixClient>();
/** userId whose client is allowed to occupy the `_client` slot. */
let activeUserId: string | null = null;

const resumePromises = new Map<string, Promise<MatrixClient>>();
const firstSyncDone = new Set<string>();
const firstSyncWaiters = new Map<string, Array<() => void>>();

function notifyFirstSync(userId: string): void {
  firstSyncDone.add(userId);
  const waiters = firstSyncWaiters.get(userId) || [];
  firstSyncWaiters.delete(userId);
  for (const waiter of waiters) {
    waiter();
  }
}

/** Throws while no authenticated client has been built (see resume()). */
export function getMatrixClient(): MatrixClient {
  if (!_client) {
    throw new Error('Matrix client is not initialized');
  }
  return _client;
}

export function hasActiveClient(): boolean {
  return _client !== null;
}

export function createStore(userId: string): IndexedDBStore {
  return new IndexedDBStore({
    dbName: `sewernet-store-${userId}`,
    indexedDB: typeof window !== 'undefined' ? window.indexedDB : undefined,
  });
}

let cryptoInitPromise: Promise<void> | null = null;

async function ensureCryptoWasm(): Promise<void> {
  if (!cryptoInitPromise) {
    cryptoInitPromise = import('@matrix-org/matrix-sdk-crypto-wasm').then((m) =>
      m.initAsync(),
    );
  }
  return cryptoInitPromise;
}

/** Warms up the rust crypto wasm module (idempotent). */
export function prewarmCrypto(): Promise<void> {
  return ensureCryptoWasm();
}

async function requestPersistentStorage(): Promise<void> {
  try {
    const storage = navigator.storage;
    if (!storage?.persist) {
      return;
    }
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return;
    }
    await storage.persist();
  } catch {
    // storage persistence is best-effort
  }
}

type LoginPasswordResponse = {
  user_id: string;
  access_token: string;
  device_id: string;
  refresh_token?: string;
  expires_in_ms?: number;
  well_known?: { 'm.homeserver'?: { base_url?: string } };
};

export async function loginWithPassword(
  username: string,
  password: string,
  homeserverInput: string,
): Promise<MatrixCredentials> {
  const tempClient = createClient({ baseUrl: homeserverInput });
  const response = (await tempClient.loginRequest({
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: username },
    password,
    device_id: crypto.randomUUID(),
    refresh_token: true,
    initial_device_display_name: 'SewerNet Web',
  })) as LoginPasswordResponse;

  const homeserverUrl = response.well_known?.['m.homeserver']?.base_url ?? homeserverInput;
  const credentials: MatrixCredentials = {
    userId: response.user_id,
    accessToken: response.access_token,
    deviceId: response.device_id,
    homeserverUrl,
    refreshToken: response.refresh_token,
    expiresInMs: typeof response.expires_in_ms === 'number' ? response.expires_in_ms : undefined,
  };
  await upsertAccount(credentials);
  await setActiveAccount(credentials.userId);
  useAuthStore.getState().setCredentials(credentials);
  await requestPersistentStorage();
  return credentials;
}

type NativeRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in_ms?: number;
};

async function nativeRefresh(
  client: MatrixClient,
  refreshToken: string,
): Promise<NativeRefreshResponse> {
  try {
    return (await client.http.request(
      Method.Post,
      '/refresh',
      undefined,
      { refresh_token: refreshToken },
      { prefix: '/_matrix/client/v3' },
    )) as NativeRefreshResponse;
  } catch (err) {
    if ((err as { errcode?: string } | null)?.errcode === 'M_UNRECOGNIZED') {
      return (await client.http.request(
        Method.Post,
        '/refresh',
        undefined,
        { refresh_token: refreshToken },
        { prefix: '/_matrix/client/v1' },
      )) as NativeRefreshResponse;
    }
    throw err;
  }
}

export function createAuthenticatedClient(opts: {
  baseUrl: string;
  userId: string;
  accessToken: string;
  deviceId: string;
  store?: ICreateClientOpts['store'];
  refreshToken?: string;
  oidc?: OidcSession;
}): MatrixClient {
  const { baseUrl, userId, accessToken, deviceId, store, refreshToken, oidc } = opts;
  const oidcRefresher = oidc
    ? new OidcTokenRefresher(
        oidc.issuer,
        oidc.clientId,
        oidc.redirectUri,
        deviceId,
        oidc.idTokenClaims as unknown as ConstructorParameters<typeof OidcTokenRefresher>[4],
      )
    : null;

  const persistRefreshed = async (tokens: AccessTokens): Promise<void> => {
    const prev = getAccount(userId);
    const homeserverUrl = prev?.homeserverUrl ?? baseUrl;
    await upsertAccount({
      userId,
      deviceId: prev?.deviceId ?? deviceId,
      homeserverUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? prev?.refreshToken ?? refreshToken,
      expiresInMs: tokens.expiry ? tokens.expiry.getTime() - Date.now() : prev?.expiresInMs,
      oidc: prev?.oidc ?? oidc,
    });
    // Keep the media proxy in sync with the rotated token.
    void postSessionToSw(tokens.accessToken, homeserverUrl);
  };

  let tokenRefreshFunction: TokenRefreshFunction | undefined;
  if (oidcRefresher) {
    tokenRefreshFunction = async (refreshToken: string) => {
      const tokens = await oidcRefresher.doRefreshAccessToken(refreshToken);
      await persistRefreshed(tokens);
      return tokens;
    };
  } else if (refreshToken) {
    tokenRefreshFunction = async (token: string) => {
      const response = await nativeRefresh(client, token);
      const tokens: AccessTokens = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiry:
          typeof response.expires_in_ms === 'number'
            ? new Date(Date.now() + response.expires_in_ms)
            : undefined,
      };
      await persistRefreshed(tokens);
      return tokens;
    };
  }

  const client = createClient({
    baseUrl,
    userId,
    accessToken,
    deviceId,
    store,
    cryptoCallbacks: {},
    timelineSupport: true,
    fallbackICEServerAllowed: true,
    refreshToken,
    tokenRefreshFunction,
  });
  return client;
}

/**
 * Builds (or re-uses) the authenticated client and starts syncing.
 * A living client for the same user is returned as-is; concurrent
 * resumes of the same build share one promise. Every onFirstSync
 * callback is registered, never dropped.
 */
export async function resume(
  credentials: MatrixCredentials,
  onFirstSync?: () => void,
): Promise<MatrixClient> {
  const { userId } = credentials;
  activeUserId = userId;
  if (onFirstSync) {
    if (firstSyncDone.has(userId)) {
      onFirstSync();
    } else {
      let waiters = firstSyncWaiters.get(userId);
      if (!waiters) {
        waiters = [];
        firstSyncWaiters.set(userId, waiters);
      }
      waiters.push(onFirstSync);
    }
  }
  if (
    _client &&
    _client.getSyncState() !== 'STOPPED' &&
    _client.getUserId() === userId
  ) {
    return _client;
  }
  const existing = clients.get(userId);
  if (existing && existing.getSyncState() !== 'STOPPED') {
    _client = existing;
    return existing;
  }
  let promise = resumePromises.get(userId);
  if (!promise) {
    promise = buildClient(credentials).finally(() => {
      resumePromises.delete(userId);
    });
    resumePromises.set(userId, promise);
  }
  return promise;
}

async function buildClient(
  credentials: MatrixCredentials,
): Promise<MatrixClient> {
  const { userId } = credentials;
  const store = createStore(userId);
  const client = createAuthenticatedClient({
    baseUrl: credentials.homeserverUrl,
    userId,
    accessToken: credentials.accessToken,
    deviceId: credentials.deviceId,
    store,
    refreshToken: credentials.refreshToken,
    oidc: credentials.oidc,
  });
  await Promise.all([store.startup(), prewarmCrypto()]);
  await client.initRustCrypto({
    cryptoDatabasePrefix: `sewernet-js-sdk-${userId}`,
  });
  const onSyncState = (state: string): void => {
    if (state === 'PREPARED' || state === 'CATCHUP') {
      client.off(ClientEvent.Sync, onSyncState);
      notifyFirstSync(userId);
    }
  };
  client.on(ClientEvent.Sync, onSyncState);

  // Fix #2: register before startClient so logoutCurrent can stop the client
  // even when it is still in its start sequence.
  clients.set(userId, client);
  // Fix #1: only the most recent account may occupy the active slot, so a
  // slow build of an old account cannot hijack the singleton afterwards.
  if (activeUserId === userId) {
    _client = client;
  }

  try {
    await client.startClient({
      initialSyncLimit: 20,
      lazyLoadMembers: true,
      clientWellKnownPollPeriod: 86_400,
    });
  } catch (err) {
    if (clients.get(userId) === client) {
      clients.delete(userId);
    }
    if (_client === client) {
      _client = null;
    }
    throw err;
  }

  // Authenticated media (avatars) needs the bearer token inside the worker.
  void postSessionToSw(credentials.accessToken, credentials.homeserverUrl);
  return client;
}

async function deletePersistedDatabases(userId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }
  const names = [`sewernet-store-${userId}`];
  try {
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name?.startsWith(`sewernet-js-sdk-${userId}`)) {
          names.push(db.name);
        }
      }
    }
  } catch {
    // enumeration is optional; the timeline db is always deleted
  }
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.addEventListener('success', () => resolve());
          request.addEventListener('error', () => resolve());
          request.addEventListener('blocked', () => resolve());
        }),
    ),
  );
}

/** Logs out the current client and wipes all persisted state for it. */
export async function logoutCurrent(): Promise<void> {
  const client = _client;
  if (!client) {
    return;
  }
  const userId = client.getUserId?.();

  _client = null;
  if (userId) {
    if (clients.get(userId) === client) {
      clients.delete(userId);
    }
    firstSyncDone.delete(userId);
    firstSyncWaiters.delete(userId);
  } else {
    for (const [id, c] of clients) {
      if (c === client) clients.delete(id);
    }
  }

  client.stopClient();
  try {
    await Promise.race([
      client.logout(true),
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);
  } catch {
    // network errors must not block local cleanup
  }
  await clearSessionFromSw();
  if (userId) {
    await deletePersistedDatabases(userId);
    await removeAccount(userId);
  }
}
