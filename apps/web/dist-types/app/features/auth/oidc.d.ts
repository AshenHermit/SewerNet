import { type OidcClientConfig } from 'matrix-js-sdk/lib/oidc';
import type { MatrixCredentials, OidcSession } from '../../../client/accounts';
export type OidcAction = 'login' | 'register';
export type OidcResponseMode = 'query' | 'fragment';
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
export declare function getOidcRedirectUri(): string;
/** Resolves a homeserver input (domain or URL) via .well-known discovery. */
export declare function resolveBaseUrl(input: string): Promise<string>;
export declare function discoverAuthCapabilities(baseUrl: string): Promise<AuthCapabilities>;
export declare function getOrRegisterClientId(metadata: OidcClientConfig, redirectUri: string): Promise<string>;
export declare function getPendingOidcFlow(): PendingOidcFlow | null;
export declare function clearPendingOidcFlow(): void;
export declare function startOidcLogin(metadata: OidcClientConfig, clientId: string, redirectUri: string, homeserverUrl: string, action?: OidcAction): Promise<void>;
export declare function completeOidcLogin(code: string, state: string): Promise<MatrixCredentials>;
export declare function revokeOidcSession(oidc: OidcSession, accessToken: string): Promise<void>;
//# sourceMappingURL=oidc.d.ts.map