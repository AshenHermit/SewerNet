import { HttpException, Injectable, Logger } from '@nestjs/common';

export interface ProxyOptions {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** Таймаут запроса к homeserver в мс. По умолчанию 15 с. */
  timeoutMs?: number;
}

export interface MatrixCredentials {
  user: string;
  password: string;
  deviceName?: string;
}

/**
 * Stateless HTTP proxy to a Matrix homeserver (Client-Server API v3).
 * The client supplies the homeserver base URL with each request via the
 * `x-matrix-homeserver` header; the backend never stores credentials.
 */
@Injectable()
export class MatrixService {
  private readonly logger = new Logger(MatrixService.name);

  private homeserverUrl(homeserver: string): string {
    const url = homeserver?.replace(/\/+$/, '');
    if (!url || !/^https?:\/\//.test(url)) {
      throw new HttpException(
        { errcode: 'M_INVALID_HOMESERVER', error: 'Invalid homeserver URL' },
        400,
      );
    }
    return url;
  }

  async login(homeserver: string, credentials: MatrixCredentials) {
    return this.proxy(homeserver, '/_matrix/client/v3/login', {
      method: 'POST',
      body: {
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: credentials.user },
        password: credentials.password,
        initial_device_display_name: credentials.deviceName ?? 'SewerNet',
      },
    });
  }

  /** Содержание события состояния комнаты, например { name } для m.room.name. */
  async getRoomState(
    homeserver: string,
    roomId: string,
    eventType: string,
    token?: string,
  ): Promise<unknown> {
    return this.proxy(
      homeserver,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}`,
      { token },
    );
  }

  async proxy(
    homeserver: string,
    path: string,
    options: ProxyOptions = {},
  ): Promise<unknown> {
    const base = this.homeserverUrl(homeserver);
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) search.set(key, value);
    }
    const qs = search.toString() ? `?${search}` : '';

    const headers: Record<string, string> = {};
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const timeoutMs = options.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${base}${path}${qs}`, {
        method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new HttpException(
          {
            errcode: 'M_REQUEST_TIMEOUT',
            error: `Homeserver request timed out after ${timeoutMs}ms`,
          },
          504,
        );
      }
      throw new HttpException(
        {
          errcode: 'M_REQUEST_FAILED',
          error: err instanceof Error ? err.message : String(err),
        },
        502,
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      this.logger.warn(
        `${options.method ?? 'GET'} ${path} -> ${response.status} ${
          payload['errcode'] ?? ''
        }`,
      );
      throw new HttpException(payload, response.status);
    }

    return payload;
  }
}
