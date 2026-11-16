import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  MatrixLoginRequest,
  SlidingSyncRoomListResponse,
  SyncedRoomInfo,
} from '@sewer-net/types';
import { MatrixService } from './matrix.service';

const HS = 'x-matrix-homeserver';

function requireHomeserver(homeserver?: string): string {
  if (!homeserver) {
    throw new BadRequestException('Missing x-matrix-homeserver header');
  }
  return homeserver;
}

/** REST proxy routes. Frontend calls live under the global `/api` prefix. */
@Controller('matrix')
export class MatrixController {
  constructor(private readonly matrix: MatrixService) {}

  @Post('login')
  @HttpCode(200)
  login(
    @Headers(HS) homeserver: string | undefined,
    @Body() body: MatrixLoginRequest,
  ) {
    // The body's homeserverUrl wins if the header is absent.
    const hs = homeserver ?? body?.homeserverUrl;
    return this.matrix.login(requireHomeserver(hs), {
      user: body?.user,
      password: body?.password,
      deviceName: body?.deviceName,
    });
  }

  @Get('whoami')
  @HttpCode(200)
  whoami(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.matrix.proxy(requireHomeserver(homeserver), '/_matrix/client/v3/account/whoami', {
      token: extractToken(authorization),
    });
  }

  @Get('rooms')
  joinedRooms(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.matrix.proxy(
      requireHomeserver(homeserver),
      '/_matrix/client/v3/joined_rooms',
      { token: extractToken(authorization) },
    );
  }

  @Post('sync/room-list')
  @HttpCode(200)
  async getSyncedRoomList(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<SyncedRoomInfo[]> {
    const response = await this.matrix.syncRoomList(
      requireHomeserver(homeserver),
      extractToken(authorization),
    );
    return mapSyncedRooms(response as SlidingSyncRoomListResponse);
  }

  @Get('rooms/:roomId/members')
  roomMembers(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('roomId') roomId: string,
  ) {
    return this.matrix.getRoomMembers(
      requireHomeserver(homeserver),
      roomId,
      extractToken(authorization),
    );
  }

  @Get('rooms/:roomId/threads')
  roomThreads(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('roomId') roomId: string,
  ) {
    return this.matrix.getRoomThreads(
      requireHomeserver(homeserver),
      roomId,
      extractToken(authorization),
    );
  }

  @Get('rooms/:roomId/aliases')
  roomAliases(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('roomId') roomId: string,
  ) {
    return this.matrix.getRoomAliases(
      requireHomeserver(homeserver),
      roomId,
      extractToken(authorization),
    );
  }

  @Post('rooms/:roomId/read_markers')
  @HttpCode(200)
  setReadMarkers(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('roomId') roomId: string,
    @Body() body: Record<string, string>,
  ) {
    return this.matrix.setReadMarkers(
      requireHomeserver(homeserver),
      roomId,
      extractToken(authorization),
      body,
    );
  }

  @Get('rooms/:roomId/state/:eventType')
  roomState(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('roomId') roomId: string,
    @Param('eventType') eventType: string,
  ) {
    return this.matrix.getRoomState(
      requireHomeserver(homeserver),
      roomId,
      eventType,
      extractToken(authorization),
    );
  }

  @Get('rooms/:roomId/messages')
  messages(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('roomId') roomId: string,
    @Query('dir') dir = 'b',
    @Query('limit') limit?: string,
    @Query('from') from?: string,
  ) {
    return this.matrix.proxy(
      requireHomeserver(homeserver),
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        token: extractToken(authorization),
        query: { dir, limit, from },
      },
    );
  }

  @Put('rooms/:roomId/send/:txnId')
  sendMessage(
    @Headers(HS) homeserver: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('roomId') roomId: string,
    @Param('txnId') txnId: string,
    @Body() content: unknown,
  ) {
    return this.matrix.proxy(
      requireHomeserver(homeserver),
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
      {
        method: 'PUT',
        token: extractToken(authorization),
        body: content,
      },
    );
  }
}

function extractToken(authorization?: string): string | undefined {
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
}

/** Превращает ответ sliding-sync в массив SyncedRoomInfo. */
export function mapSyncedRooms(
  response: SlidingSyncRoomListResponse,
): SyncedRoomInfo[] {
  const rawRooms = (response.rooms ?? {}) as Record<
    string,
    {
      name?: unknown;
      avatar?: unknown;
      required_state?: unknown;
      timeline?: unknown;
    }
  >;

  // `ops` — авторитетный (и упорядоченный) список комнат. `rooms` может быть
  // пустым, если состояние уже в кэше homeserver'а: ориентироваться только на
  // ключи `rooms` значит показать пустой список вместо комнат.
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const op of response.lists?.all_rooms?.ops ?? []) {
    for (const roomId of op.room_ids ?? []) {
      if (!seen.has(roomId)) {
        seen.add(roomId);
        orderedIds.push(roomId);
      }
    }
  }
  for (const roomId of Object.keys(rawRooms)) {
    if (!seen.has(roomId)) {
      seen.add(roomId);
      orderedIds.push(roomId);
    }
  }

  const directCounterparts = directRoomCounterparts(response.extensions);
  const rooms: SyncedRoomInfo[] = [];

  for (const roomId of orderedIds) {
    const raw = rawRooms[roomId] ?? {};
    const state = (Array.isArray(raw.required_state) ? raw.required_state : []) as {
      type?: string;
      state_key?: string;
      content?: Record<string, unknown>;
    }[];

    const nameEvent = state.find((e) => e.type === 'm.room.name');
    const avatarEvent = state.find((e) => e.type === 'm.room.avatar');
    const topicEvent = state.find((e) => e.type === 'm.room.topic');
    const aliasEvent = state.find((e) => e.type === 'm.room.canonical_alias');

    // matrix.org liefert timeline direkt als Array (nicht { events: [...] }).
    const timeline = Array.isArray(raw.timeline) ? raw.timeline : [];
    const last = timeline[0] as {
      origin_server_ts?: unknown;
      content?: Record<string, unknown>;
    } | undefined;

    const counterpartId = directCounterparts.get(roomId);
    const counterpartName = counterpartId
      ? state.find(
          (e) => e.type === 'm.room.member' && e.state_key === counterpartId,
        )?.content?.displayname
      : undefined;

    rooms.push({
      room_id: roomId,
      name: firstString(
        nameEvent?.content?.name,
        raw.name,
        aliasEvent?.content?.alias,
        counterpartName,
      ),
      avatar: firstString(avatarEvent?.content?.url, raw.avatar),
      topic: firstString(topicEvent?.content?.topic),
      preview: firstString(last?.content?.body),
      lastTs:
        typeof last?.origin_server_ts === 'number'
          ? (last.origin_server_ts as number)
          : undefined,
    });
  }

  return rooms.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Карта `roomId → userId` из account data `m.direct`: без неё DM-комнаты
 * остались бы без имени (у них нет `m.room.name`).
 */
function directRoomCounterparts(extensions: unknown): Map<string, string> {
  const result = new Map<string, string>();
  const events = (
    extensions as { account_data?: { events?: unknown } } | undefined
  )?.account_data?.events;
  if (!Array.isArray(events)) return result;

  const direct = events.find(
    (event) => (event as { type?: string })?.type === 'm.direct',
  ) as { content?: Record<string, unknown> } | undefined;
  for (const [userId, roomIds] of Object.entries(direct?.content ?? {})) {
    if (!Array.isArray(roomIds)) continue;
    for (const roomId of roomIds) {
      if (typeof roomId === 'string') result.set(roomId, userId);
    }
  }
  return result;
}
