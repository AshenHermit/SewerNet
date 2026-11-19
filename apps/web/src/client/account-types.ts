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

export interface AccountSnapshot {
  accounts: Record<string, MatrixCredentials>;
  activeUserId: string | null;
  blockedAccounts: Record<string, { deviceId: string; reason: 'refresh' | 'delete' }>;
}
