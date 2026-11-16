/** Minimal Matrix types shared between the client and the REST proxy. */

export interface MatrixLoginRequest {
  homeserverUrl: string;
  user: string;
  password: string;
  deviceName?: string;
}

export interface MatrixLoginResponse {
  user_id: string;
  access_token: string;
  device_id: string;
  home_server?: string;
}

export interface MatrixWhoamiResponse {
  user_id: string;
  device_id?: string;
  is_guest?: boolean;
}

export interface MatrixJoinedRoomsResponse {
  joined_rooms: string[];
}

export interface MatrixRoomEvent {
  event_id: string;
  type: string;
  sender: string;
  origin_server_ts: number;
  room_id?: string;
  content: Record<string, unknown>;
  unsigned?: Record<string, unknown>;
  state_key?: string;
}

export interface MatrixMessagesResponse {
  chunk: MatrixRoomEvent[];
  start: string;
  end?: string;
}

export interface MatrixSendResponse {
  event_id: string;
}

export interface MatrixErrorBody {
  errcode: string;
  error: string;
}

/** OIDC discovery document of a Matrix Authentication Service, camelCased. */
export interface MasOidcMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  responseModesSupported: string[];
  promptValuesSupported?: string[];
}

export interface OauthDiscoverRequest {
  issuer: string;
}

export interface OauthRegisterRequest {
  issuer: string;
  redirectUri: string;
}

export interface OauthRegisterResponse {
  clientId: string;
}

export interface OauthTokenRequest {
  issuer: string;
  clientId: string;
  redirectUri?: string;
  code?: string;
  codeVerifier?: string;
  grantType: 'authorization_code' | 'refresh_token';
  refreshToken?: string;
}

export interface OauthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}
