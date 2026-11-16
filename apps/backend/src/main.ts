/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

/**
 * Node's global fetch ignores HTTP(S)_PROXY, so homeserver requests from the
 * backend would bypass the system proxy that the browser/app uses. On networks
 * where Cloudflare (matrix.org) is only reachable through the proxy, those
 * requests then intermittently fail with "fetch failed" (connect timeout).
 * Route through undici's EnvHttpProxyAgent when a proxy is configured
 * (NO_PROXY is honored, so localhost/LAN homeservers stay direct).
 */
async function configureProxy(): Promise<void> {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  if (!proxy) return;
  try {
    const load = new Function('s', 'return import(s)') as (
      s: string,
    ) => Promise<{
      EnvHttpProxyAgent: new () => unknown;
      setGlobalDispatcher: (dispatcher: unknown) => void;
    }>;
    const undici = await load('undici');
    undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent());
    Logger.log('Routing homeserver requests through the environment proxy');
  } catch {
    // undici unavailable: keep Node's default direct dispatcher.
  }
}

async function bootstrap() {
  await configureProxy();
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
