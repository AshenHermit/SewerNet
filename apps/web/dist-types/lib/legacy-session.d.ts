/**
 * Compatibility adapter between the new MatrixCredentials shape and the
 * legacy AuthSession used by the REST-proxy client. The old chat path
 * consumes this until it migrates to the SDK (removed in the cleanup task).
 */
import type { MatrixCredentials } from '../client/accounts';
import type { AuthSession } from './matrix-client';
/** Flattens credentials into the legacy AuthSession shape. */
export declare function credentialsToAuthSession(c: MatrixCredentials): AuthSession;
/** Maps a legacy AuthSession back to credentials (legacy compat path). */
export declare function authSessionToCredentials(s: AuthSession): MatrixCredentials;
//# sourceMappingURL=legacy-session.d.ts.map