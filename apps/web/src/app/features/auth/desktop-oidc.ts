import { completeAuthorizationCodeGrant } from 'matrix-js-sdk/lib/oidc';
import { createClient } from 'matrix-js-sdk';
import type { MatrixCredentials } from '../../../client/account-types';
import { commitLogin } from '../../../client/session';
import type { ClaimedOidcCallback, StoredOidcFlow } from '../../../platform/oidc-contract';
import { getOidcPlatform } from '../../../platform/runtime';

interface GrantResult {
  tokenResponse: { access_token: string; refresh_token?: string; scope?: string; expires_in?: number };
  idTokenClaims: Record<string, unknown>;
  homeserverUrl: string;
  oidcClientSettings: { clientId: string; issuer: string };
}

const DEVICE_SCOPE_RE = /urn:matrix:org\.matrix\.msc2967\.client:device:([^\s]+)/;
const inFlight = new Set<string>();
const completed = new Set<string>();

function sdkStateStorageKey(key: string): string {
  return key.startsWith('mx_oidc_') ? key : `mx_oidc_${key}`;
}

function restoreSdkState(flow: StoredOidcFlow): void {
  const expectedRedirect = getOidcPlatform().redirectUri();
  if (flow.schema !== 1 || flow.redirectUri !== expectedRedirect || flow.context.redirectUri !== expectedRedirect || flow.status !== 'processing') {
    throw new Error('oidc_invalid_flow');
  }
  if (!flow.state || flow.state.length > 512 || !flow.sdkStateKey || flow.sdkState.length > 64 * 1024) {
    throw new Error('oidc_invalid_flow');
  }
  sessionStorage.setItem(sdkStateStorageKey(flow.sdkStateKey), flow.sdkState);
}

async function whoami(homeserverUrl: string, accessToken: string): Promise<{ user_id: string; device_id?: string }> {
  return createClient({ baseUrl: homeserverUrl, accessToken }).whoami();
}

export async function exchangeClaimedDesktopCallback(claimed: ClaimedOidcCallback): Promise<MatrixCredentials> {
  const { flow, callback } = claimed;
  if (!callback.state || callback.state !== flow.state) throw new Error('oidc_invalid_state');
  if (callback.error) throw new Error('oidc_authorization_denied');
  if (!callback.code) throw new Error('oidc_missing_code');
  restoreSdkState(flow);

  const grant = (await completeAuthorizationCodeGrant(callback.code, callback.state, flow.context.responseMode)) as unknown as GrantResult;
  const homeserverUrl = grant.homeserverUrl || flow.context.homeserverUrl;
  if (!homeserverUrl) throw new Error('oidc_missing_homeserver_url');
  const who = await whoami(homeserverUrl, grant.tokenResponse.access_token);
  const deviceId = who.device_id ?? grant.tokenResponse.scope?.match(DEVICE_SCOPE_RE)?.[1];
  if (!deviceId) throw new Error('oidc_missing_device_id');
  const credentials: MatrixCredentials = {
    userId: who.user_id,
    accessToken: grant.tokenResponse.access_token,
    refreshToken: grant.tokenResponse.refresh_token,
    deviceId,
    homeserverUrl,
    expiresInMs: typeof grant.tokenResponse.expires_in === 'number' ? grant.tokenResponse.expires_in * 1000 : undefined,
    oidc: {
      issuer: grant.oidcClientSettings.issuer,
      clientId: grant.oidcClientSettings.clientId,
      redirectUri: flow.redirectUri,
      responseMode: flow.context.responseMode,
      revocationEndpoint: flow.context.revocationEndpoint,
      idTokenClaims: grant.idTokenClaims ?? {},
    },
  };
  await commitLogin(credentials);
  sessionStorage.removeItem(sdkStateStorageKey(flow.sdkStateKey));
  return credentials;
}

export async function handleDesktopOidcCallback(url: string, platform = getOidcPlatform()): Promise<void> {
  let claimed: ClaimedOidcCallback;
  try {
    claimed = await platform.claimCallback(url);
  } catch (error) {
    if (error instanceof Error && /processing|already|pending/i.test(error.message)) return;
    throw error;
  }
  const state = claimed.callback.state;
  if (!state || inFlight.has(state) || completed.has(state)) return;
  inFlight.add(state);
  try {
    await exchangeClaimedDesktopCallback(claimed);
    completed.add(state);
    await platform.clearPending(state);
  } finally {
    inFlight.delete(state);
  }
}

export function resetDesktopOidcForTesting(): void {
  inFlight.clear();
  completed.clear();
}
