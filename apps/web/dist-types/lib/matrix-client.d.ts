import type { MasOidcMetadata, MatrixLoginRequest, MatrixMessagesResponse, MatrixSendResponse, MatrixWhoamiResponse, OauthTokenRequest, OauthTokenResponse, SyncedRoomInfo } from '@sewer-net/types';
export interface AuthSession {
    homeserverUrl: string;
    accessToken: string;
    userId: string;
    deviceId: string;
    issuer?: string;
    clientId?: string;
    refreshToken?: string;
    /** Epoch ms when the current access token expires. */
    expiresAt?: number;
}
/** OIDC metadata of the issuer a homeserver delegates authentication to. */
export type MasAuthMetadata = MasOidcMetadata;
declare class MatrixApiError extends Error {
    status: number;
    errcode: string;
    constructor(status: number, errcode: string, message: string);
}
/** Adds the https scheme and follows `.well-known/matrix/client` when present. */
export declare function normalizeHomeserver(input: string): Promise<string>;
/**
 * MSC2965 discovery: direct auth_metadata → well-known `authentication`
 * block → OIDC metadata of the issuer via the backend. `null` means the
 * homeserver offers no MAS and password login applies.
 */
export declare function discoverMasAuth(homeserverUrl: string): Promise<MasAuthMetadata | null>;
/** Refresh grant through the backend; persists the updated session. */
export declare function refreshOauthToken(session: AuthSession): Promise<AuthSession>;
export declare const matrixClient: {
    login(req: MatrixLoginRequest): Promise<AuthSession>;
    /** OIDC discovery document of a MAS issuer, resolved by the backend. */
    discoverOauth(issuer: string): Promise<MasOidcMetadata>;
    /** RFC7591 dynamic client registration; returns the fresh client_id. */
    registerOauthClient(issuer: string, redirectUri: string): Promise<string>;
    exchangeOauthCode(req: OauthTokenRequest): Promise<OauthTokenResponse>;
    whoami(session: AuthSession): Promise<MatrixWhoamiResponse>;
    getJoinedRooms(session: AuthSession): Promise<{
        joined_rooms: string[];
    }>;
    /** Содержание события состояния комнаты (например { name } для m.room.name). */
    getRoomState(session: AuthSession, roomId: string, eventType: string): Promise<Record<string, unknown>>;
    getMessages(session: AuthSession, roomId: string, opts?: {
        limit?: number;
        from?: string;
    }): Promise<MatrixMessagesResponse>;
    /** Один запрос sliding-sync за списком комнат с названиями/превью. */
    getSyncedRooms(session: AuthSession): Promise<SyncedRoomInfo[]>;
    getRoomMembers(session: AuthSession, roomId: string): Promise<unknown>;
    getRoomThreads(session: AuthSession, roomId: string): Promise<unknown>;
    getRoomAliases(session: AuthSession, roomId: string): Promise<unknown>;
    setReadMarkers(session: AuthSession, roomId: string, body: Record<string, string>): Promise<unknown>;
    sendMessage(session: AuthSession, roomId: string, body: string, formattedBody?: string): Promise<MatrixSendResponse>;
    /** Long-poll /sync for one or all rooms. Returns a cleanup function. */
    subscribeToSync(session: AuthSession, onEvents: (events: import("@sewer-net/types").MatrixRoomEvent[]) => void): () => void;
};
export { MatrixApiError };
//# sourceMappingURL=matrix-client.d.ts.map