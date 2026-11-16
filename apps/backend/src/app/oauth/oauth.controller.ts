import { Body, Controller, Post } from '@nestjs/common';
import type {
  OauthDiscoverRequest,
  OauthRegisterRequest,
  OauthTokenRequest,
} from '@sewer-net/types';
import { OauthService } from './oauth.service';

/** Stateless MAS proxy routes. Live under the global `/api` prefix. */
@Controller('matrix/oauth')
export class OauthController {
  constructor(private readonly oauth: OauthService) {}

  @Post('discover')
  discover(@Body() body: OauthDiscoverRequest) {
    return this.oauth.discoverOidc(body?.issuer ?? '');
  }

  @Post('register')
  register(@Body() body: OauthRegisterRequest) {
    return this.oauth.register(body?.issuer ?? '', body?.redirectUri ?? '');
  }

  @Post('token')
  token(@Body() body: OauthTokenRequest) {
    return this.oauth.token(body);
  }
}
