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
function mapSyncedRooms(
  response: SlidingSyncRoomListResponse,
): SyncedRoomInfo[] {
  const rooms: SyncedRoomInfo[] = [];
  const rawRooms = response.rooms ?? {};
  for (const [roomId, raw] of Object.entries(rawRooms)) {
    const state = (Array.isArray(raw?.state) ? raw.state : []) as {
      type: string;
      content?: Record<string, unknown>;
    }[];
    const nameEvent = state.find((e) => e.type === 'm.room.name');
    const avatarEvent = state.find((e) => e.type === 'm.room.avatar');
    const topicEvent = state.find((e) => e.type === 'm.room.topic');
    const timeline = raw?.timeline as { events?: unknown } | undefined;
    const events = (Array.isArray(timeline?.events)
      ? timeline.events
      : []) as {
      origin_server_ts?: unknown;
      content?: Record<string, unknown>;
    }[];
    const last = events[0];

    rooms.push({
      room_id: roomId,
      name:
        typeof nameEvent?.content?.name === 'string'
          ? (nameEvent.content.name as string)
          : undefined,
      avatar:
        typeof avatarEvent?.content?.url === 'string'
          ? (avatarEvent.content.url as string)
          : undefined,
      topic:
        typeof topicEvent?.content?.topic === 'string'
          ? (topicEvent.content.topic as string)
          : undefined,
      preview:
        typeof last?.content?.body === 'string'
          ? (last.content.body as string)
          : undefined,
      lastTs:
        typeof last?.origin_server_ts === 'number'
          ? (last.origin_server_ts as number)
          : undefined,
    });
  }
  return rooms.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
}
