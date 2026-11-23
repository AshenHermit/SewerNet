/**
 * Node's global fetch ignores HTTP(S)_PROXY, so homeserver requests from the
 * backend would bypass the system proxy that the browser/app uses. On networks
 * where Cloudflare (matrix.org) is only reachable through the proxy, those
 * requests then intermittently fail with "fetch failed" (connect timeout).
 * Route through undici's EnvHttpProxyAgent when a proxy is configured
 * (NO_PROXY is honored, so localhost/LAN homeservers stay direct).
 */

interface UndiciModule {
  EnvHttpProxyAgent: new () => unknown;
  setGlobalDispatcher: (dispatcher: unknown) => void;
}

type ModuleLoader = (specifier: string) => Promise<UndiciModule>;

/** Динамический импорт без статических ссылок: undici может отсутствовать. */
const defaultLoader = ((specifier: string) =>
  // Function keeps TypeScript and bundlers from rewriting or bundling the import
  new Function('s', 'return import(s)')(specifier)) as ModuleLoader;

function proxyUrl(env: NodeJS.ProcessEnv): string | undefined {
  return (
    env.HTTPS_PROXY ||
    env.HTTP_PROXY ||
    env.https_proxy ||
    env.http_proxy ||
    undefined
  );
}

/**
 * Ставит глобальный dispatcher undici, если в окружении задан прокси.
 * Возвращает true, когда dispatcher действительно заменён.
 */
export async function configureProxy(
  env: NodeJS.ProcessEnv = process.env,
  load: ModuleLoader = defaultLoader,
): Promise<boolean> {
  if (!proxyUrl(env)) return false;
  try {
    const undici = await load('undici');
    undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent());
    return true;
  } catch {
    // undici unavailable: keep Node's default direct dispatcher.
    return false;
  }
}
