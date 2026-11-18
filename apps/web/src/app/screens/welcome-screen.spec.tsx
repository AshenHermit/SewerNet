import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  discoverAuthCapabilities,
  getOrRegisterClientId,
  resolveBaseUrl,
  startOidcLogin,
  type AuthCapabilities,
} from '../features/auth/oidc';
import { loginWithPassword } from '../../client/init-matrix';
import { WelcomeScreen } from './welcome-screen';
import type { OidcClientConfig } from 'matrix-js-sdk/lib/oidc';

vi.mock('../features/auth/oidc', () => ({
  resolveBaseUrl: vi.fn(),
  discoverAuthCapabilities: vi.fn(),
  getOrRegisterClientId: vi.fn(),
  getOidcRedirectUri: vi.fn(() => 'http://localhost:4200/oidc/callback'),
  startOidcLogin: vi.fn(),
}));

vi.mock('../../client/init-matrix', () => ({
  loginWithPassword: vi.fn(),
}));

const mockedResolve = vi.mocked(resolveBaseUrl);
const mockedDiscover = vi.mocked(discoverAuthCapabilities);
const mockedRegister = vi.mocked(getOrRegisterClientId);
const mockedStart = vi.mocked(startOidcLogin);
const mockedLogin = vi.mocked(loginWithPassword);

const AUTH_METADATA = {
  issuer: 'https://account.matrix.org/',
  authorization_endpoint: 'https://account.matrix.org/authorize',
  token_endpoint: 'https://account.matrix.org/token',
  revocation_endpoint: 'https://account.matrix.org/revoke',
  response_modes_supported: ['query'],
  signingKeys: null,
} as unknown as OidcClientConfig;

const DELEGATED: AuthCapabilities = {
  resolvedBaseUrl: 'https://matrix-client.matrix.org',
  hasPasswordLogin: true,
  ssoFlow: false,
  registerAvailable: true,
  delegatedAuth: true,
  authMetadata: AUTH_METADATA,
};

const PASSWORD_ONLY: AuthCapabilities = {
  resolvedBaseUrl: 'https://matrix-client.matrix.org',
  hasPasswordLogin: true,
  ssoFlow: false,
  registerAvailable: true,
  delegatedAuth: false,
  authMetadata: null,
};

const NOTHING: AuthCapabilities = {
  resolvedBaseUrl: 'https://matrix-client.matrix.org',
  hasPasswordLogin: false,
  ssoFlow: false,
  registerAvailable: null,
  delegatedAuth: false,
  authMetadata: null,
};

function renderWelcome(initial = '/welcome/matrix.org') {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <MemoryRouter initialEntries={[initial]}>
            <Routes>
              <Route path="/welcome/:homeserver?" element={<WelcomeScreen />} />
              <Route path="/" element={<div>chat-home</div>} />
            </Routes>
          </MemoryRouter>
        </IconSetProvider>
      </UiKitProvider>
    </I18nProvider>,
  );
}

async function flushDiscovery(ms = 400) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 25 });
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mockedResolve.mockImplementation(async (input: string) =>
    input === 'matrix.org' ? 'https://matrix-client.matrix.org' : /^https?:\/\//.test(input) ? input : `https://${input}`,
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WelcomeScreen', () => {
  it('discovers capabilities on mount and shows OIDC buttons for a MAS homeserver', async () => {
    mockedDiscover.mockResolvedValue(DELEGATED);
    renderWelcome();
    await flushDiscovery();

    expect(mockedResolve).toHaveBeenCalledWith('matrix.org');
    expect(mockedDiscover).toHaveBeenCalledWith('https://matrix-client.matrix.org');
    expect(await screen.findByRole('button', { name: 'Continue with Matrix' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByLabelText('Username').closest('details')).toBeTruthy();
  });

  it('shows only the password form when the homeserver has no MAS', async () => {
    mockedDiscover.mockResolvedValue(PASSWORD_ONLY);
    renderWelcome();
    await flushDiscovery();

    const username = await screen.findByLabelText('Username');
    expect(username.closest('details')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue with Matrix' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  });

  it('still shows the password form when discovery finds nothing', async () => {
    mockedDiscover.mockResolvedValue(NOTHING);
    renderWelcome();
    await flushDiscovery();
    expect(await screen.findByLabelText('Username')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue with Matrix' })).toBeNull();
  });

  it('ignores a stale discovery that resolves after a newer input', async () => {
    let resolveStale: ((caps: AuthCapabilities) => void) | undefined;
    mockedDiscover.mockImplementation(((baseUrl: string) => {
      if (baseUrl === 'https://matrix-client.matrix.org') {
        return new Promise<AuthCapabilities>((resolve) => {
          resolveStale = resolve;
        });
      }
      return Promise.resolve(PASSWORD_ONLY);
    }) as typeof discoverAuthCapabilities);

    renderWelcome();
    // Start the first discovery (matrix.org) and leave it in flight.
    await flushDiscovery(300);
    expect(mockedDiscover).toHaveBeenCalledWith('https://matrix-client.matrix.org');
    fireEvent.change(await screen.findByLabelText('Homeserver URL'), {
      target: { value: 'example.org' },
    });
    await flushDiscovery();

    // example.org resolved: password form, no OIDC buttons.
    expect(screen.getByLabelText('Username').closest('details')).toBeNull();
    // The stale matrix.org discovery settles late with MAS present — must not win.
    resolveStale?.(DELEGATED);
    await waitFor(() => expect(mockedDiscover).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Continue with Matrix' })).toBeNull();
  });

  it('starts the OIDC login flow with the resolved homeserver and callback url', async () => {
    mockedDiscover.mockResolvedValue(DELEGATED);
    mockedRegister.mockResolvedValue({ clientId: 'cid', redirectUri: 'http://localhost:4200/oidc/callback' });
    renderWelcome();
    await flushDiscovery();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Matrix' }));
    await waitFor(() =>
      expect(mockedStart).toHaveBeenCalledWith(
        AUTH_METADATA,
        'cid',
        'http://localhost:4200/oidc/callback',
        'https://matrix-client.matrix.org',
        'login',
      ),
    );
    expect(mockedRegister).toHaveBeenCalledWith(AUTH_METADATA, 'http://localhost:4200/oidc/callback');
  });

  it('starts the register flow from the Create account button', async () => {
    mockedDiscover.mockResolvedValue(DELEGATED);
    mockedRegister.mockResolvedValue({ clientId: 'cid', redirectUri: 'http://localhost:4200/oidc/callback' });
    renderWelcome();
    await flushDiscovery();

    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(mockedStart).toHaveBeenCalledWith(
        AUTH_METADATA,
        'cid',
        'http://localhost:4200/oidc/callback',
        'https://matrix-client.matrix.org',
        'register',
      ),
    );
  });

  it('signs in with password and navigates to the chat', async () => {
    mockedDiscover.mockResolvedValue(PASSWORD_ONLY);
    mockedLogin.mockResolvedValue({
      userId: '@alice:matrix.org',
      accessToken: 'at',
      deviceId: 'dev',
      homeserverUrl: 'https://matrix-client.matrix.org',
    });

    renderWelcome();
    await flushDiscovery();
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(mockedLogin).toHaveBeenCalledWith('alice', 'secret', 'https://matrix-client.matrix.org'),
    );
    expect(await screen.findByText('chat-home')).toBeTruthy();
  });
});
