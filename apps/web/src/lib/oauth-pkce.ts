import type { MasOidcMetadata } from '@sewer-net/types';

/** MSC2966/2967 stable scopes: basic identity + full client API.
 *  The device scope is appended per flow with a concrete device id. */
export const OAUTH_SCOPE = 'openid urn:matrix:client:api:*';

const PENDING_KEY = 'sewernet:oauth';

/** Everything the /callback screen needs to finish the flow. */
export interface OAuthSessionState {
  homeserverUrl: string;
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  /** Device id requested in the scope, kept so /callback can recover it if
   *  whoami does not return one. */
  deviceId?: string;
  prompt?: 'create';
}

export interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function sessionStorage(): SessionStorageLike | null {
  return (globalThis as { sessionStorage?: SessionStorageLike | undefined })
    .sessionStorage ?? null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomBase64Url(size: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

/** 24 random bytes → 32 base64url characters. */
export function generateState(): string {
  return randomBase64Url(24);
}

/** 32 random bytes → 43 base64url characters (RFC 7636 verifier minimum). */
export function generateCodeVerifier(): string {
  return randomBase64Url(32);
}

/** 9 random bytes → 12 base64url characters: a device id that satisfies the
 *  MAS device-scope policy (≥10 chars from the base64url-compatible charset). */
export function generateDeviceId(): string {
  return randomBase64Url(9);
}

/** MSC2967 stable scopes: full client API + registration of OUR device. */
export function oauthScope(deviceId: string): string {
  return `${OAUTH_SCOPE} urn:matrix:client:device:${deviceId}`;
}

/** Recover the device id granted in a token response's scope. MAS may not
 *  return device_id from whoami, but the stable MSC2967 scope always carries
 *  it. Matches both the stable and the legacy org.matrix.msc2967 spelling. */
export function deviceIdFromScope(scope?: string): string | null {
  if (!scope) return null;
  const match = scope.match(
    /urn:matrix:(?:org\.matrix\.msc2967\.)?client:device:([^\s]+)/,
  );
  return match?.[1] ?? null;
}

/** RFC 7636 S256: base64url(SHA-256(verifier)), no padding. */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

/** MSC2964: query works for plain-http loopback URIs, https needs fragment. */
function responseMode(redirectUri: string): 'query' | 'fragment' {
  const url = new URL(redirectUri);
  const loopbackHttp =
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  return loopbackHttp ? 'query' : 'fragment';
}

export function buildAuthorizationUrl(
  metadata: Pick<MasOidcMetadata, 'authorizationEndpoint'>,
  opts: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    deviceId: string;
    prompt?: 'create';
  },
): string {
  const url = new URL(metadata.authorizationEndpoint);
  const params = url.searchParams;
  params.set('response_type', 'code');
  params.set('client_id', opts.clientId);
  params.set('redirect_uri', opts.redirectUri);
  params.set('scope', oauthScope(opts.deviceId));
  params.set('state', opts.state);
  params.set('code_challenge', opts.codeChallenge);
  params.set('code_challenge_method', 'S256');
  params.set('response_mode', responseMode(opts.redirectUri));
  if (opts.prompt) params.set('prompt', opts.prompt);
  return url.toString();
}

/** Callback values can arrive in the query or the fragment; the fragment wins. */
export function parseCallbackParams(
  search: string,
  hash: string,
): CallbackParams {
  const read = (raw: string): CallbackParams => {
    const params = new URLSearchParams(raw.startsWith('#') ? raw.slice(1) : raw);
    return {
      code: params.get('code') ?? undefined,
      state: params.get('state') ?? undefined,
      error: params.get('error') ?? undefined,
      errorDescription: params.get('error_description') ?? undefined,
    };
  };
  const merged: CallbackParams = { ...read(search) };
  for (const [key, value] of Object.entries(read(hash))) {
    if (value !== undefined) {
      (merged as Record<string, string | undefined>)[key] = value;
    }
  }
  return merged;
}

export function savePendingOAuth(state: OAuthSessionState): void {
  sessionStorage()?.setItem(PENDING_KEY, JSON.stringify(state));
}

export function getPendingOAuth(): OAuthSessionState | null {
  const raw = sessionStorage()?.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthSessionState;
  } catch {
    return null;
  }
}

export function clearPendingOAuth(): void {
  sessionStorage()?.removeItem(PENDING_KEY);
}
