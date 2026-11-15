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
