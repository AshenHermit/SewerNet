import { Module } from '@nestjs/common';
import { MatrixModule } from './matrix/matrix.module';
import { OauthModule } from './oauth/oauth.module';

@Module({
  imports: [MatrixModule, OauthModule],
})
export class AppModule {}
