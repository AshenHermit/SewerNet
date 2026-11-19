import { AutoDiscovery, AutoDiscoveryAction, createClient } from 'matrix-js-sdk';
import {
  completeAuthorizationCodeGrant,
  generateOidcAuthorizationUrl,
  registerOidcClient,
  type OidcClientConfig,
  type OidcRegistrationClientMetadata,
} from 'matrix-js-sdk/lib/oidc';
import type { MatrixCredentials, OidcSession } from '../../../client/account-types';
import { commitLogin } from '../../../client/session';

export type OidcAction = 'login' | 'register';
export type OidcResponseMode = 'query' | 'fragment';

const OIDC_RESPONSE_MODE: OidcResponseMode = 'query';
const PENDING_KEY = 'sewernet:oidc_pending';
const CLIENT_ID_KEY_PREFIX = 'sewernet_oidc_client_id_';
const REVOKE_TIMEOUT_MS = 10_000;
const DEVICE_SCOPE_RE = /urn:matrix:org\.matrix\.msc2967\.client:device:([^\s]+)/;

export interface PendingOidcFlow {
  homeserverUrl: string;
  nonce: string;
  responseMode: OidcResponseMode;
  action: OidcAction;
  revocationEndpoint?: string;
}

export interface AuthCapabilities {
  resolvedBaseUrl: string;
  hasPasswordLogin: boolean;
  ssoFlow: boolean;
  registerAvailable: boolean | null;
  delegatedAuth: boolean;
  authMetadata: OidcClientConfig | null;
}

export function getOidcRedirectUri(): string {
  return new URL('/oidc/callback', window.location.origin).toString();
}

/** Resolves a homeserver input (domain or URL) via .well-known discovery. */
export async function resolveBaseUrl(input: string): Promise<string> {
  let domain = input;
  try {
    domain = new URL(input).host;
  } catch {
    // plain domain input — use as-is
  }
  try {
    const config = await AutoDiscovery.findClientConfig(domain);
    const hs = config['m.homeserver'];
    if (hs.state === AutoDiscoveryAction.SUCCESS && hs.base_url) {
      return hs.base_url;
    }
  } catch {
    // discovery is best-effort
  }
  return /^https?:\/\//.test(input) ? input : `https://${input}`;
}

export async function discoverAuthCapabilities(baseUrl: string): Promise<AuthCapabilities> {
  const client = createClient({ baseUrl });
  const [loginResult, registerResult, authMetadataResult] = await Promise.allSettled([
    client.loginFlows(),
    client.registerRequest({}),
    client.getAuthMetadata(),
  ]);

  const result: AuthCapabilities = {
    resolvedBaseUrl: baseUrl,
    hasPasswordLogin: false,
    ssoFlow: false,
    registerAvailable: null,
    delegatedAuth: false,
    authMetadata: null,
  };

  if (loginResult.status === 'fulfilled') {
    result.hasPasswordLogin = loginResult.value.flows.some((f) => f.type === 'm.login.password');
    result.ssoFlow = loginResult.value.flows.some((f) => f.type === 'm.login.sso');
  }

  if (registerResult.status === 'fulfilled') {
    result.registerAvailable = true;
  } else {
    const status = (registerResult.reason as { httpStatus?: number } | null)?.httpStatus;
    if (status === 401) {
      result.registerAvailable = true;
    } else if (status === 403) {
      result.registerAvailable = false;
    }
  }

  if (authMetadataResult.status === 'fulfilled' && authMetadataResult.value) {
    result.delegatedAuth = true;
    result.authMetadata = authMetadataResult.value as OidcClientConfig;
  }

  return result;
}

function clientIdStorageKey(issuer: string, redirectUri: string): string {
  return `${CLIENT_ID_KEY_PREFIX}${issuer}|${redirectUri}`;
}

function loopbackWithoutPort(uri: string): string | null {
  try {
    const url = new URL(uri);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'http:' || !loopback || !url.port) return null;
    url.port = '';
    return url.toString();
  } catch {
    return null;
  }
}

/** Mirror wizardchat: web app requires HTTPS; HTTP localhost must register as native. */
function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

export interface OidcClientRegistration {
  clientId: string;
  redirectUri: string;
}

export async function getOrRegisterClientId(
  metadata: OidcClientConfig,
  redirectUri: string,
): Promise<OidcClientRegistration> {
  const cacheKey = clientIdStorageKey(metadata.issuer, redirectUri);
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    return { clientId: cached, redirectUri };
  }

  const applicationType = isSecureContext() ? 'web' : 'native';
  const clientMetadata: OidcRegistrationClientMetadata = {
    clientName: 'SewerNet',
    clientUri: resolveClientUri(),
    applicationType,
    redirectUris: [redirectUri],
    contacts: [],
    tosUri: undefined,
    policyUri: undefined,
  };

  let clientId: string;
  let finalRedirectUri = redirectUri;
  try {
    clientId = await registerOidcClient(metadata, clientMetadata);
  } catch (err) {
    const portless = loopbackWithoutPort(redirectUri);
    if (!portless) throw err;
    clientId = await registerOidcClient(metadata, { ...clientMetadata, redirectUris: [portless] });
    finalRedirectUri = portless;
  }
  localStorage.setItem(clientIdStorageKey(metadata.issuer, finalRedirectUri), clientId);
  return { clientId, redirectUri: finalRedirectUri };
}

function resolveClientUri(): string {
  return isSecureContext() ? window.location.origin : new URL('/', window.location.origin).toString();
}

function resolvePrompt(metadata: OidcClientConfig, action: OidcAction): string | undefined {
  if (action !== 'register') return undefined;
  return metadata.prompt_values_supported?.includes('create') ? 'create' : undefined;
}

export function getPendingOidcFlow(): PendingOidcFlow | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingOidcFlow;
  } catch {
    return null;
  }
}

export function clearPendingOidcFlow(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

export async function startOidcLogin(
  metadata: OidcClientConfig,
  clientId: string,
  redirectUri: string,
  homeserverUrl: string,
  action: OidcAction = 'login',
): Promise<void> {
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const url = await generateOidcAuthorizationUrl({
    metadata,
    clientId,
    redirectUri,
    homeserverUrl,
    nonce,
    prompt: resolvePrompt(metadata, action),
    responseMode: OIDC_RESPONSE_MODE,
  });

  const pending: PendingOidcFlow = {
    homeserverUrl,
    nonce,
    responseMode: OIDC_RESPONSE_MODE,
    action,
    revocationEndpoint: metadata.revocation_endpoint,
  };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  window.location.href = url;
}

interface WhoamiResponse {
  user_id: string;
  device_id?: string;
  is_guest?: boolean;
}

async function whoami(homeserverUrl: string, accessToken: string): Promise<WhoamiResponse> {
  const client = createClient({ baseUrl: homeserverUrl, accessToken });
  return client.whoami();
}

function deviceIdFromScope(scope: string | undefined): string | undefined {
  return scope?.match(DEVICE_SCOPE_RE)?.[1];
}

interface TokenGrantResult {
  oidcClientSettings: { clientId: string; issuer: string };
  tokenResponse: { access_token: string; refresh_token?: string; scope?: string; expires_in?: number };
  homeserverUrl: string;
  idTokenClaims: Record<string, unknown>;
}

export async function completeOidcLogin(code: string, state: string): Promise<MatrixCredentials> {
  const pending = getPendingOidcFlow();
  const responseMode = pending?.responseMode ?? OIDC_RESPONSE_MODE;

  const { tokenResponse, idTokenClaims, homeserverUrl, oidcClientSettings } = (await completeAuthorizationCodeGrant(
    code,
    state,
    responseMode,
  )) as unknown as TokenGrantResult;

  const resolvedHomeserverUrl = homeserverUrl ?? pending?.homeserverUrl;
  if (!resolvedHomeserverUrl) {
    throw new Error('oidc_missing_homeserver_url');
  }

  const whoamiResponse = await whoami(resolvedHomeserverUrl, tokenResponse.access_token);
  const deviceId = whoamiResponse.device_id ?? deviceIdFromScope(tokenResponse.scope);
  if (!deviceId) {
    throw new Error('oidc_missing_device_id');
  }

  const credentials: MatrixCredentials = {
    userId: whoamiResponse.user_id,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    deviceId,
    homeserverUrl: resolvedHomeserverUrl,
    expiresInMs: typeof tokenResponse.expires_in === 'number' ? tokenResponse.expires_in * 1000 : undefined,
    oidc: {
      issuer: oidcClientSettings.issuer,
      clientId: oidcClientSettings.clientId,
      redirectUri: getOidcRedirectUri(),
      responseMode,
      revocationEndpoint: pending?.revocationEndpoint,
      idTokenClaims: idTokenClaims ?? {},
    },
  };
  await commitLogin(credentials);
  return credentials;
}

export async function revokeOidcSession(oidc: OidcSession, accessToken: string): Promise<void> {
  const endpoint = oidc.revocationEndpoint;
  if (!endpoint) return;

  const body = new URLSearchParams({
    token: accessToken,
    token_type_hint: 'access_token',
    client_id: oidc.clientId,
  });

  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
  });
}
