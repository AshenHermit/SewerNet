/**
 * Persisted Matrix account storage — the single write point for
 * localStorage credentials. Keys: `sewernet_accounts` (Record by userId)
 * and `sewernet_active_account` (active userId).
 */
export interface OidcSession {
    issuer: string;
    clientId: string;
    redirectUri: string;
    responseMode: 'query' | 'fragment';
    revocationEndpoint?: string;
    idTokenClaims: Record<string, unknown>;
}
export interface MatrixCredentials {
    userId: string;
    accessToken: string;
    deviceId: string;
    homeserverUrl: string;
    refreshToken?: string;
    /** ms until the access token expires (relative). */
    expiresInMs?: number;
    oidc?: OidcSession;
}
export declare function upsertAccount(c: MatrixCredentials): void;
export declare function removeAccount(userId: string): void;
export declare function getAccount(userId: string): MatrixCredentials | null;
export declare function listAccounts(): MatrixCredentials[];
export declare function setActiveAccount(userId: string): void;
export declare function getActiveUserId(): string | null;
export declare function getActiveAccount(): MatrixCredentials | null;
export declare function clearAllAccounts(): void;
/** Removes the pre-migration `sewernet:auth` zustand-persist key. */
export declare function cleanupLegacyStorage(): void;
//# sourceMappingURL=accounts.d.ts.map