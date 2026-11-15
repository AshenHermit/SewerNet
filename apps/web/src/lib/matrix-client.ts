import type {
  MatrixLoginRequest,
  MatrixLoginResponse,
  MatrixMessagesResponse,
  MatrixSendResponse,
  MatrixWhoamiResponse,
} from '@sewer-net/types';

/**
 * Thin client for the SewerNet backend REST proxy.
 * All calls go to `/api/matrix/*` and are forwarded by the dev server
 * (or reverse proxy in production) to the NestJS backend.
 */
const BASE = '/api/matrix';

export interface AuthSession {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
}

class MatrixApiError extends Error {
  constructor(
    public status: number,
    public errcode: string,
    message: string,
  ) {
    super(message);
    this.name = 'MatrixApiError';
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    homeserver?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.homeserver) headers['x-matrix-homeserver'] = options.homeserver;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new MatrixApiError(
      response.status,
      String(payload['errcode'] ?? 'UNKNOWN'),
      String(payload['error'] ?? 'Request failed'),
    );
  }

  return payload as T;
}

export const matrixClient = {
  async login(req: MatrixLoginRequest): Promise<AuthSession> {
    const res = await request<MatrixLoginResponse>('/login', {
      body: req,
      homeserver: req.homeserverUrl,
    });
    return {
      homeserverUrl: req.homeserverUrl,
      accessToken: res.access_token,
      userId: res.user_id,
      deviceId: res.device_id,
    };
  },

  whoami(session: AuthSession) {
    return request<MatrixWhoamiResponse>('/whoami', {
      token: session.accessToken,
      homeserver: session.homeserverUrl,
    });
  },

  getJoinedRooms(session: AuthSession) {
    return request<{ joined_rooms: string[] }>('/rooms', {
      token: session.accessToken,
      homeserver: session.homeserverUrl,
    });
  },

  getMessages(
    session: AuthSession,
    roomId: string,
    opts: { limit?: number; from?: string } = {},
  ) {
    const params = new URLSearchParams({ dir: 'b', limit: String(opts.limit ?? 50) });
    if (opts.from) params.set('from', opts.from);
    return request<MatrixMessagesResponse>(
      `/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
      {
        token: session.accessToken,
        homeserver: session.homeserverUrl,
      },
    );
  },

  sendMessage(
    session: AuthSession,
    roomId: string,
    body: string,
    formattedBody?: string,
  ) {
    const txnId = `m${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const content: Record<string, unknown> = { msgtype: 'm.text', body };
    if (formattedBody !== undefined && formattedBody !== body) {
      content['formatted_body'] = formattedBody;
      content['format'] = 'org.matrix.custom.html';
    }
    return request<MatrixSendResponse>(
      `/rooms/${encodeURIComponent(roomId)}/send/${txnId}`,
      {
        token: session.accessToken,
        homeserver: session.homeserverUrl,
        method: 'PUT',
        body: content,
      },
    );
  },
};

export { MatrixApiError };
