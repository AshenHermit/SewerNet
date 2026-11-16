import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useAuthStore } from '../stores/auth-store';
import { CallbackScreen } from './callback-screen';
import type { OAuthSessionState } from '../../lib/oauth-pkce';

const PENDING: OAuthSessionState = {
  homeserverUrl: 'https://matrix-client.matrix.org',
  issuer: 'https://account.matrix.org/',
  clientId: 'cid',
  redirectUri: 'http://localhost:4200/callback',
  state: 'st_ok',
  codeVerifier: 'cv',
};

type FetchHandler = (url: string, init: RequestInit) => Response;

function installFetch(handler: FetchHandler): { url: string; init: RequestInit }[] {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = global.fetch;
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  void original;
  return calls;
}

function renderScreen(entry: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/callback" element={<CallbackScreen />} />
              <Route path="/" element={<div>chat-root</div>} />
            </Routes>
          </MemoryRouter>
        </IconSetProvider>
      </UiKitProvider>
    </I18nProvider>,
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => {
  localStorage.removeItem('sewernet:auth');
  sessionStorage.removeItem('sewernet:oauth');
  useAuthStore.setState({ session: null });
});

describe('CallbackScreen', () => {
  it('rejects a state mismatch without any network call', () => {
    sessionStorage.setItem('sewernet:oauth', JSON.stringify(PENDING));
    const calls = installFetch(() => new Response('{}', { status: 200 }));
    renderScreen('/callback?code=c&state=st_wrong');

    expect(screen.getByText(/Security check failed/)).toBeTruthy();
    expect(calls.filter((call) => call.url === '/api/matrix/oauth/token')).toHaveLength(0);
  });

  it('shows a cancelled message for access_denied without any network call', () => {
    sessionStorage.setItem('sewernet:oauth', JSON.stringify(PENDING));
    const calls = installFetch(() => new Response('{}', { status: 200 }));
    renderScreen('/callback?error=access_denied&error_description=no');

    expect(screen.getByText(/Sign-in was cancelled/)).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('shows an error when no pending flow is stored', () => {
    installFetch(() => new Response('{}', { status: 200 }));
    renderScreen('/callback?code=c&state=st_ok');

    expect(screen.getByText(/Sign-in session expired/)).toBeTruthy();
  });

  it('exchanges the fragment code, calls whoami and lands on the root route', async () => {
    sessionStorage.setItem('sewernet:oauth', JSON.stringify(PENDING));
    const calls = installFetch((url) => {
      if (url === '/api/matrix/oauth/token') {
        return new Response(
          JSON.stringify({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 }),
          { status: 200 },
        );
      }
      if (url === '/api/matrix/whoami') {
        return new Response(
          JSON.stringify({ user_id: '@alice:matrix.org', device_id: 'DEV' }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    renderScreen('/callback#code=c&state=st_ok');

    await waitFor(() => expect(screen.getByText('chat-root')).toBeTruthy());

    const session = useAuthStore.getState().session;
    expect(session?.userId).toBe('@alice:matrix.org');
    expect(session?.accessToken).toBe('at');
    expect(session?.refreshToken).toBe('rt');
    expect(session?.issuer).toBe(PENDING.issuer);
    expect(session?.clientId).toBe('cid');
    expect(session?.homeserverUrl).toBe(PENDING.homeserverUrl);
    expect(session?.deviceId).toBe('DEV');
    expect(session?.expiresAt).toBeGreaterThan(Date.now());
    expect(sessionStorage.getItem('sewernet:oauth')).toBeNull();

    const tokenCall = calls.find((call) => call.url === '/api/matrix/oauth/token');
    expect(JSON.parse(String(tokenCall?.init.body))).toMatchObject({
      grantType: 'authorization_code',
      code: 'c',
      codeVerifier: 'cv',
      clientId: 'cid',
      redirectUri: PENDING.redirectUri,
    });
    const whoamiCall = calls.find((call) => call.url === '/api/matrix/whoami');
    expect((whoamiCall?.init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer at',
    );
  });

  it('recovers the device id from the token scope when whoami omits it', async () => {
    sessionStorage.setItem('sewernet:oauth', JSON.stringify(PENDING));
    installFetch((url) => {
      if (url === '/api/matrix/oauth/token') {
        return new Response(
          JSON.stringify({
            accessToken: 'at',
            scope: 'openid urn:matrix:client:api:* urn:matrix:client:device:SCOPED123',
          }),
          { status: 200 },
        );
      }
      if (url === '/api/matrix/whoami') {
        return new Response(
          JSON.stringify({ user_id: '@alice:matrix.org' }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    renderScreen('/callback?code=c&state=st_ok');

    await waitFor(() => expect(screen.getByText('chat-root')).toBeTruthy());
    expect(useAuthStore.getState().session?.deviceId).toBe('SCOPED123');
  });

  it('falls back to the device id saved before the redirect', async () => {
    sessionStorage.setItem(
      'sewernet:oauth',
      JSON.stringify({ ...PENDING, deviceId: 'SAVED123456' }),
    );
    installFetch((url) => {
      if (url === '/api/matrix/oauth/token') {
        return new Response(JSON.stringify({ accessToken: 'at' }), { status: 200 });
      }
      if (url === '/api/matrix/whoami') {
        return new Response(
          JSON.stringify({ user_id: '@alice:matrix.org' }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    renderScreen('/callback?code=c&state=st_ok');

    await waitFor(() => expect(screen.getByText('chat-root')).toBeTruthy());
    expect(useAuthStore.getState().session?.deviceId).toBe('SAVED123456');
  });
});
