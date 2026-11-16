import type {
  MasOidcMetadata,
  MatrixLoginRequest,
  MatrixLoginResponse,
  MatrixMessagesResponse,
  MatrixSendResponse,
  MatrixWhoamiResponse,
  OauthTokenRequest,
  OauthTokenResponse,
} from '@sewer-net/types';
import { useAuthStore } from '../app/stores/auth-store';

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
  issuer?: string;
  clientId?: string;
  refreshToken?: string;
  /** Epoch ms when the current access token expires. */
  expiresAt?: number;
}

/** OIDC metadata of the issuer a homeserver delegates authentication to. */
export type MasAuthMetadata = MasOidcMetadata;

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

interface RawWellKnownClient {
  'm.homeserver'?: { base_url?: string };
  authentication?: { type?: string; issuer?: string };
}

interface RawAuthMetadata {
  issuer?: string;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    homeserver?: string;
    body?: unknown;
    /** Enables the transparent 401 → refresh → retry-once flow. */
    session?: AuthSession;
    _retriedAuth?: boolean;
  } = {},
): Promise<T> {
  const token = options.token ?? options.session?.accessToken;
  const homeserver = options.homeserver ?? options.session?.homeserverUrl;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (homeserver) headers['x-matrix-homeserver'] = homeserver;
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
    const error = new MatrixApiError(
      response.status,
      String(payload['errcode'] ?? payload['error'] ?? 'UNKNOWN'),
      String(payload['error'] ?? payload['error_description'] ?? 'Request failed'),
    );
    // MSC2964 session: one transparent refresh + retry, never two.
    if (
      response.status === 401 &&
      options.session?.refreshToken &&
      !options._retriedAuth
    ) {
      try {
        const refreshed = await refreshOauthToken(options.session);
        return await request<T>(path, {
          ...options,
          session: refreshed,
          _retriedAuth: true,
        });
      } catch {
        throw error;
      }
    }
    throw error;
  }

  return payload as T;
}

/** Adds the https scheme and follows `.well-known/matrix/client` when present. */
export async function normalizeHomeserver(input: string): Promise<string> {
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)
    ? input
    : `https://${input}`;
  const base = withScheme.replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/.well-known/matrix/client`);
    if (response.ok) {
      const doc = (await response.json()) as RawWellKnownClient;
      const baseUrl = doc['m.homeserver']?.base_url;
      if (baseUrl) return baseUrl.replace(/\/+$/, '');
    }
  } catch {
    // The well-known document is optional; the input stands.
  }
  return base;
}

/**
 * MSC2965 discovery: direct auth_metadata → well-known `authentication`
 * block → OIDC metadata of the issuer via the backend. `null` means the
 * homeserver offers no MAS and password login applies.
 */
export async function discoverMasAuth(
  homeserverUrl: string,
): Promise<MasAuthMetadata | null> {
  const base = homeserverUrl.replace(/\/+$/, '');
  let issuer: string | undefined;

  try {
    const response = await fetch(`${base}/_matrix/client/v1/auth_metadata`);
    if (response.ok) {
      issuer = ((await response.json()) as RawAuthMetadata).issuer;
    }
  } catch {
    // Fall through to the well-known document.
  }

  if (!issuer) {
    try {
      const response = await fetch(`${base}/.well-known/matrix/client`);
      if (response.ok) {
        const auth = ((await response.json()) as RawWellKnownClient).authentication;
        if (
          auth?.issuer &&
          (auth.type === 'oauth' || auth.type === 'delegated')
        ) {
          issuer = auth.issuer;
        }
      }
    } catch {
      // No MAS announcement at all.
    }
  }

  if (!issuer) return null;
  try {
    return await matrixClient.discoverOauth(issuer);
  } catch {
    return null;
  }
}

/** One in-flight refresh shared by every concurrent 401: MAS rotates refresh
 *  tokens, so two parallel grants would invalidate each other and log the
 *  user out. */
let inflightRefresh: Promise<AuthSession> | null = null;

/** Refresh grant through the backend; persists the updated session. */
export async function refreshOauthToken(session: AuthSession): Promise<AuthSession> {
  if (!inflightRefresh) {
    inflightRefresh = doRefreshOauthToken(session).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function doRefreshOauthToken(session: AuthSession): Promise<AuthSession> {
  const res = await request<OauthTokenResponse>('/oauth/token', {
    method: 'POST',
    body: {
      issuer: session.issuer,
      clientId: session.clientId,
      grantType: 'refresh_token',
      refreshToken: session.refreshToken,
    },
  });
  const updated: AuthSession = {
    ...session,
    accessToken: res.accessToken,
    ...(res.refreshToken !== undefined ? { refreshToken: res.refreshToken } : {}),
    ...(res.expiresIn !== undefined
      ? { expiresAt: Date.now() + res.expiresIn * 1000 }
      : {}),
  };
  useAuthStore.getState().setSession(updated);
  return updated;
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

  /** OIDC discovery document of a MAS issuer, resolved by the backend. */
  async discoverOauth(issuer: string): Promise<MasOidcMetadata> {
    return request<MasOidcMetadata>('/oauth/discover', {
      method: 'POST',
      body: { issuer },
    });
  },

  /** RFC7591 dynamic client registration; returns the fresh client_id. */
  async registerOauthClient(issuer: string, redirectUri: string): Promise<string> {
    const res = await request<{ clientId: string }>('/oauth/register', {
      method: 'POST',
      body: { issuer, redirectUri },
    });
    return res.clientId;
  },

  async exchangeOauthCode(req: OauthTokenRequest): Promise<OauthTokenResponse> {
    return request<OauthTokenResponse>('/oauth/token', {
      method: 'POST',
      body: req,
    });
  },

  whoami(session: AuthSession) {
    return request<MatrixWhoamiResponse>('/whoami', { session });
  },

  getJoinedRooms(session: AuthSession) {
    return request<{ joined_rooms: string[] }>('/rooms', { session });
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
      { session },
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
        method: 'PUT',
        body: content,
        session,
      },
    );
  },
};

export { MatrixApiError };
