/** Minimal Matrix types shared between the client and the REST proxy. */

export const SUPPORTED_LOCALES = {
  en: 'English',
  ru: 'Русский',
} as const;
export type AppLocale = keyof typeof SUPPORTED_LOCALES;

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
  /** Токен для загрузки более старых сообщений (prev). */
  prev?: string;
  /** Токен для загрузки более новых сообщений (next); на практике не используется. */
  next?: string;
}

/** Пачка событий из одного long-poll /sync для одной комнаты. */
export interface MatrixSyncRoomTimeline {
  events: MatrixRoomEvent[];
  limited?: boolean;
  prev_batch?: string;
}

export interface MatrixSyncResponse {
  rooms: {
    join: Record<string, MatrixSyncRoomTimeline>;
    invite?: Record<string, unknown>;
    leave?: Record<string, unknown>;
  };
  account_data: { events: MatrixRoomEvent[] };
  presence?: { events: MatrixRoomEvent[] };
  to_device?: { events: MatrixRoomEvent[] };
  org_matrix_msc3773_call_events?: { events: MatrixRoomEvent[] };
  pos: string;
  filters?: unknown;
  unused?: unknown;
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

/** Тело запроса списка комнат sliding-sync (MSC3575, комната "все комнаты"). */
export interface SlidingSyncRoomListRequest {
  conn_id: string;
  lists: {
    all_rooms: {
      ranges: [number, number][];
      /** Каждое событие как строка (type, пустой state_key) или пара [type, state_key]. */
      required_state: (string | [string, string])[];
      timeline_limit: number;
      filters: Record<string, unknown>;
    };
  };
  extensions: Record<string, unknown>;
  /** Позиция из предыдущего ответа: продолжение окна списка комнат. */
  pos?: string;
}

/** Ответ эндпоинта sliding-sync /sync для списка комнат. */
export interface SlidingSyncRoomListResponse {
  pos: string;
  lists: {
    all_rooms: {
      count: number;
      ops: Array<{
        op: string;
        range: [number, number];
        room_ids: string[];
      }>;
    };
  };
  rooms: Record<string, any>;
  extensions: any;
}

/** Комната, приведённая из sliding-sync к клиентскому виду. */
export interface SyncedRoomInfo {
  room_id: string;
  name?: string;
  avatar?: string;
  topic?: string;
  preview?: string;
  lastTs?: number;
}
