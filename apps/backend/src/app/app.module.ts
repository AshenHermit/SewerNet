import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MatrixModule } from './matrix/matrix.module';
import { OauthModule } from './oauth/oauth.module';

@Module({
  controllers: [HealthController],
  imports: [MatrixModule, OauthModule],
})
export class AppModule {}
