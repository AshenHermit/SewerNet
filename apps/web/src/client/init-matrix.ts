import {
  createClient,
  IndexedDBStore,
  Method,
  type ICreateClientOpts,
  type MatrixClient,
} from 'matrix-js-sdk';
import { OidcTokenRefresher } from 'matrix-js-sdk/lib/oidc';
import type { AccessTokens, TokenRefreshFunction } from 'matrix-js-sdk/lib/http-api';
import type { MatrixCredentials, OidcSession } from './accounts';
import { getAccount, setActiveAccount, upsertAccount } from './accounts';

let _client: MatrixClient | null = null;

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
  return new IndexedDBStore({ dbName: `sewernet-store-${userId}` });
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
  upsertAccount(credentials);
  setActiveAccount(credentials.userId);
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
    ? new OidcTokenRefresher(oidc.issuer, oidc.clientId, oidc.redirectUri, deviceId, oidc.idTokenClaims)
    : null;

  const persistRefreshed = (tokens: AccessTokens): void => {
    const prev = getAccount(userId);
    upsertAccount({
      userId,
      deviceId: prev?.deviceId ?? deviceId,
      homeserverUrl: prev?.homeserverUrl ?? baseUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? prev?.refreshToken ?? refreshToken,
      expiresInMs: tokens.expiry ? tokens.expiry.getTime() - Date.now() : prev?.expiresInMs,
      oidc: prev?.oidc ?? oidc,
    });
  };

  let tokenRefreshFunction: TokenRefreshFunction | undefined;
  if (oidcRefresher) {
    tokenRefreshFunction = async (refreshToken: string) => {
      const tokens = await oidcRefresher.doRefreshAccessToken(refreshToken);
      persistRefreshed(tokens);
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
      persistRefreshed(tokens);
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
