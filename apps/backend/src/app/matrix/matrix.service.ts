import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { SlidingSyncRoomListRequest, SlidingSyncRoomListResponse } from '@sewer-net/types';

export interface ProxyOptions {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** Таймаут запроса к homeserver в мс. По умолчанию 15 с. */
  timeoutMs?: number;
  /**
   * Количество повторов при сетевой ошибке (connect timeout / fetch failed).
   * По умолчанию 2 (итого до 3 попыток). Повторы не выполняются, если
   * homeserver ответил (даже ошибкой) — только когда ответа не было вовсе.
   */
  retries?: number;
}

export interface MatrixCredentials {
  user: string;
  password: string;
  deviceName?: string;
}

/** Размер окна списка комнат sliding-sync. */
const ROOM_LIST_PAGE = 20;
/** Предохранитель: максимум 200 комнат за холодную загрузку (10 окон). */
const ROOM_LIST_MAX_PAGES = 10;

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

  /** Преобразует сетевую ошибку fetch в HttpException (504 timeout / 502 failed). */
  private mapProxyError(err: unknown, timeoutMs: number): HttpException {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return new HttpException(
        {
          errcode: 'M_REQUEST_TIMEOUT',
          error: `Homeserver request timed out after ${timeoutMs}ms`,
        },
        504,
      );
    }
    const cause = (err as { cause?: unknown })?.cause;
    return new HttpException(
      {
        errcode: 'M_REQUEST_FAILED',
        error: err instanceof Error ? err.message : String(err),
        ...(cause ? { cause: String(cause) } : {}),
      },
      502,
    );
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

  /**
   * Один запрос sliding-sync (MSC3575) за списком комнат с названиями,
   * аватарами, темами и превью последнего сообщения.
   * Таймаут больше обычного: слабые homeserver'ы могут долго отвечать.
   */
  async syncRoomList(
    homeserver: string,
    token?: string,
  ): Promise<SlidingSyncRoomListResponse> {
    const rooms: SlidingSyncRoomListResponse['rooms'] = {};
    const ops: SlidingSyncRoomListResponse['lists']['all_rooms']['ops'] = [];
    let count = 0;
    let pos = '';
    let extensions: SlidingSyncRoomListResponse['extensions'] = {};

    // Список комнат листается окнами по 20: без этого аккаунты с 20+ комнатами
    // видели бы только первые 20 и не имели способа достать остальные.
    for (let page = 0; page < ROOM_LIST_MAX_PAGES; page += 1) {
      const from = page * ROOM_LIST_PAGE;
      const body: SlidingSyncRoomListRequest = {
        conn_id: 'room-list',
        lists: {
          all_rooms: {
            ranges: [[from, from + ROOM_LIST_PAGE - 1]],
            required_state: [
              ['m.room.name', ''],
              ['m.room.avatar', ''],
              ['m.room.topic', ''],
              ['m.room.canonical_alias', ''],
              ['m.room.member', '$ME'],
              ['m.room.member', '$LAZY'],
            ],
            timeline_limit: 1,
            filters: {},
          },
        },
        extensions: {
          account_data: {},
          receipts: {},
          typing: {},
        },
        ...(pos ? { pos } : {}),
      };

      const response = (await this.proxy(
        homeserver,
        '/_matrix/client/unstable/org.matrix.simplified_msc3575/sync',
        {
          method: 'POST',
          token,
          body,
          timeoutMs: 30_000,
          // Слабый homeserver: один медленный запрос уже стоит 30 секунд.
          // Повторять его 3 раза — гарантированный минутный висяк у клиента.
          retries: 0,
        },
      )) as SlidingSyncRoomListResponse;

      Object.assign(rooms, response.rooms ?? {});
      ops.push(...(response.lists?.all_rooms?.ops ?? []));
      extensions = response.extensions ?? extensions;
      count = response.lists?.all_rooms?.count ?? count;
      pos = response.pos ?? '';

      if (!pos || from + ROOM_LIST_PAGE >= count) break;
    }

    return {
      pos,
      lists: { all_rooms: { count, ops } },
      rooms,
      extensions,
    };
  }

  async getRoomMembers(
    homeserver: string,
    roomId: string,
    token?: string,
  ): Promise<unknown> {
    return this.proxy(
      homeserver,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`,
      { token },
    );
  }

  async getRoomThreads(
    homeserver: string,
    roomId: string,
    token?: string,
  ): Promise<unknown> {
    return this.proxy(
      homeserver,
      `/_matrix/client/v1/rooms/${encodeURIComponent(roomId)}/threads`,
      { token, query: { limit: '30' } },
    );
  }

  async getRoomAliases(
    homeserver: string,
    roomId: string,
    token?: string,
  ): Promise<unknown> {
    return this.proxy(
      homeserver,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/aliases`,
      { token },
    );
  }

  async setReadMarkers(
    homeserver: string,
    roomId: string,
    token?: string,
    body?: Record<string, string>,
  ): Promise<unknown> {
    return this.proxy(
      homeserver,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/read_markers`,
      { method: 'POST', token, body },
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
    const retries = options.retries ?? 2;
    const method =
      options.method ?? (options.body !== undefined ? 'POST' : 'GET');

    let response: Response | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetch(`${base}${path}${qs}`, {
          method,
          headers,
          body:
            options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
          signal: controller.signal,
        });
        break;
      } catch (err) {
        lastError = err;
        const aborted =
          err instanceof DOMException && err.name === 'AbortError';
        if (aborted || attempt === retries) {
          throw this.mapProxyError(err, timeoutMs);
        }
        // Сетевая ошибка (connect timeout, fetch failed): пробуем ещё раз
        // с нарастающей паузой. homeserver не ответил, поэтому повтор безопасен.
        const cause = (err as { cause?: unknown })?.cause;
        this.logger.warn(
          `Retry ${attempt + 1}/${retries} ${method} ${path}: ${
            err instanceof Error ? err.message : String(err)
          }${cause ? ` (${String(cause)})` : ''}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1)),
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!response) {
      throw this.mapProxyError(lastError, timeoutMs);
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
