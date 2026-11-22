import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { configureProxy } from './app/proxy-dispatcher';

async function bootstrap() {
  if (await configureProxy()) {
    Logger.log('Routing homeserver requests through the environment proxy');
  }
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      const load = new Function('s', 'return import(s)') as (
        specifier: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed in production.
    }
  }
  Logger.log(`🚀 Application is running on: http://${host}:${port}/${globalPrefix}`);
}

bootstrap();
