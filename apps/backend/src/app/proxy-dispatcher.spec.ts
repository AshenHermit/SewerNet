import { configureProxy } from './proxy-dispatcher';

type Loader = Parameters<typeof configureProxy>[1];

function makeLoader(result?: unknown, error?: Error) {
  const calls: string[] = [];
  const dispatched: unknown[] = [];
  const loader = (async (specifier: string) => {
    calls.push(specifier);
    if (error) throw error;
    return {
      EnvHttpProxyAgent: class {},
      setGlobalDispatcher: (dispatcher: unknown) => {
        dispatched.push(dispatcher);
      },
      ...(result as object),
    };
  }) as unknown as Loader;
  return { loader, calls, dispatched };
}

describe('configureProxy', () => {
  it('does nothing when no proxy is configured', async () => {
    const { loader, calls } = makeLoader();

    const configured = await configureProxy({}, loader);

    expect(configured).toBe(false);
    expect(calls).toEqual([]);
  });

  it('installs the environment dispatcher when HTTPS_PROXY is set', async () => {
    const { loader, calls, dispatched } = makeLoader();

    const configured = await configureProxy(
      { HTTPS_PROXY: 'http://proxy.local:3128' } as NodeJS.ProcessEnv,
      loader,
    );

    expect(configured).toBe(true);
    expect(calls).toEqual(['undici']);
    expect(dispatched).toHaveLength(1);
  });

  it('keeps the default dispatcher when undici cannot be loaded', async () => {
    const { loader, calls } = makeLoader(undefined, new Error('no undici'));

    const configured = await configureProxy(
      { http_proxy: 'http://proxy.local:3128' } as NodeJS.ProcessEnv,
      loader,
    );

    expect(configured).toBe(false);
    expect(calls).toEqual(['undici']);
  });
});
