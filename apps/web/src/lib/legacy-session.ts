/**
 * Compatibility adapter between the new MatrixCredentials shape and the
 * legacy AuthSession used by the REST-proxy client. The old chat path
 * consumes this until it migrates to the SDK (removed in the cleanup task).
 */
import type { MatrixCredentials } from '../client/accounts';
import type { AuthSession } from './matrix-client';

/** Flattens credentials into the legacy AuthSession shape. */
export function credentialsToAuthSession(c: MatrixCredentials): AuthSession {
  const session: AuthSession = {
    homeserverUrl: c.homeserverUrl,
    accessToken: c.accessToken,
    userId: c.userId,
    deviceId: c.deviceId,
    refreshToken: c.refreshToken,
  };
  if (c.expiresInMs !== undefined) {
    session.expiresAt = Date.now() + c.expiresInMs;
  }
  if (c.oidc) {
    session.issuer = c.oidc.issuer;
    session.clientId = c.oidc.clientId;
  }
  return session;
}

/** Maps a legacy AuthSession back to credentials (legacy compat path). */
export function authSessionToCredentials(s: AuthSession): MatrixCredentials {
  const creds: MatrixCredentials = {
    userId: s.userId,
    accessToken: s.accessToken,
    deviceId: s.deviceId,
    homeserverUrl: s.homeserverUrl,
    refreshToken: s.refreshToken,
  };
  if (s.expiresAt !== undefined) {
    creds.expiresInMs = Math.max(0, s.expiresAt - Date.now());
  }
  return creds;
}
