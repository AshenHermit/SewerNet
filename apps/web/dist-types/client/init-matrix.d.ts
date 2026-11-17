import { IndexedDBStore, type ICreateClientOpts, type MatrixClient } from 'matrix-js-sdk';
import type { MatrixCredentials, OidcSession } from './accounts';
/** Throws while no authenticated client has been built (see resume()). */
export declare function getMatrixClient(): MatrixClient;
export declare function hasActiveClient(): boolean;
export declare function createStore(userId: string): IndexedDBStore;
/** Warms up the rust crypto wasm module (idempotent). */
export declare function prewarmCrypto(): Promise<void>;
export declare function loginWithPassword(username: string, password: string, homeserverInput: string): Promise<MatrixCredentials>;
export declare function createAuthenticatedClient(opts: {
    baseUrl: string;
    userId: string;
    accessToken: string;
    deviceId: string;
    store?: ICreateClientOpts['store'];
    refreshToken?: string;
    oidc?: OidcSession;
}): MatrixClient;
/**
 * Builds (or re-uses) the authenticated client and starts syncing.
 * A living client for the same user is returned as-is; concurrent
 * resumes of the same build share one promise.
 */
export declare function resume(credentials: MatrixCredentials, onFirstSync?: () => void): Promise<MatrixClient>;
/** Logs out the current client and wipes all persisted state for it. */
export declare function logoutCurrent(): Promise<void>;
//# sourceMappingURL=init-matrix.d.ts.map