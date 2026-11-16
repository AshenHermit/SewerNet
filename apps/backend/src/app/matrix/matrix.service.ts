import { HttpException, Injectable, Logger } from '@nestjs/common';

export interface ProxyOptions {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
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

    const response = await fetch(`${base}${path}${qs}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

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
