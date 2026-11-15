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
import type { MatrixLoginRequest } from '@sewer-net/types';
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

  @Post('whoami')
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
