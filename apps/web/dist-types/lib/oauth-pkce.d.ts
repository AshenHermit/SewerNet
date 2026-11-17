import type { MasOidcMetadata } from '@sewer-net/types';
/** MSC2966/2967 stable scopes: basic identity + full client API.
 *  The device scope is appended per flow with a concrete device id. */
export declare const OAUTH_SCOPE = "openid urn:matrix:client:api:*";
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
/** 24 random bytes → 32 base64url characters. */
export declare function generateState(): string;
/** 32 random bytes → 43 base64url characters (RFC 7636 verifier minimum). */
export declare function generateCodeVerifier(): string;
/** 9 random bytes → 12 base64url characters: a device id that satisfies the
 *  MAS device-scope policy (≥10 chars from the base64url-compatible charset). */
export declare function generateDeviceId(): string;
/** MSC2967 stable scopes: full client API + registration of OUR device. */
export declare function oauthScope(deviceId: string): string;
/** Recover the device id granted in a token response's scope. MAS may not
 *  return device_id from whoami, but the stable MSC2967 scope always carries
 *  it. Matches both the stable and the legacy org.matrix.msc2967 spelling. */
export declare function deviceIdFromScope(scope?: string): string | null;
/** RFC 7636 S256: base64url(SHA-256(verifier)), no padding. */
export declare function codeChallengeS256(verifier: string): Promise<string>;
export declare function buildAuthorizationUrl(metadata: Pick<MasOidcMetadata, 'authorizationEndpoint'>, opts: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    deviceId: string;
    prompt?: 'create';
}): string;
/** Callback values can arrive in the query or the fragment; the fragment wins. */
export declare function parseCallbackParams(search: string, hash: string): CallbackParams;
export declare function savePendingOAuth(state: OAuthSessionState): void;
export declare function getPendingOAuth(): OAuthSessionState | null;
export declare function clearPendingOAuth(): void;
//# sourceMappingURL=oauth-pkce.d.ts.map