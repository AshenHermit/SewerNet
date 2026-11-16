import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import {
  discoverMasAuth,
  matrixClient,
  normalizeHomeserver,
} from '../../lib/matrix-client';
import { savePendingOAuth } from '../../lib/oauth-pkce';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './login-screen';

vi.mock('../../lib/matrix-client', () => ({
  matrixClient: {
    login: vi.fn(),
    registerOauthClient: vi.fn(),
  },
  normalizeHomeserver: vi.fn(),
  discoverMasAuth: vi.fn(),
  refreshOauthToken: vi.fn(),
}));

vi.mock('../../lib/oauth-pkce', () => ({
  generateState: vi.fn(() => 'st'),
  generateCodeVerifier: vi.fn(() => 'cv'),
  generateDeviceId: vi.fn(() => 'device1234567'),
  codeChallengeS256: vi.fn(async () => 'cc'),
  buildAuthorizationUrl: vi.fn(
    () => 'https://account.matrix.org/authorize?response_type=code',
  ),
  savePendingOAuth: vi.fn(),
}));

const mockedDiscover = vi.mocked(discoverMasAuth);
const mockedNormalize = vi.mocked(normalizeHomeserver);
const mockedRegister = vi.mocked(matrixClient.registerOauthClient);

const MAS_METADATA = {
  issuer: 'https://account.matrix.org/',
  authorizationEndpoint: 'https://account.matrix.org/authorize',
  tokenEndpoint: 'https://account.matrix.org/oauth2/token',
  registrationEndpoint: 'https://account.matrix.org/oauth2/registration',
  responseModesSupported: ['form_post', 'query', 'fragment'],
};

function renderLogin() {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <LoginScreen />
        </IconSetProvider>
      </UiKitProvider>
    </I18nProvider>,
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('sewernet:auth');
  mockedNormalize.mockResolvedValue('https://matrix-client.matrix.org');
});

describe('LoginScreen', () => {
  it('shows OAuth buttons and hides the password form behind a toggle when MAS is present', async () => {
    mockedDiscover.mockResolvedValue(MAS_METADATA);

    renderLogin();

    expect(
      await screen.findByRole('button', { name: 'Continue with Matrix' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    const username = screen.getByLabelText('Username');
    expect(username.closest('details')).toBeTruthy();
  });

  it('shows only the password form when the homeserver has no MAS', async () => {
    mockedDiscover.mockResolvedValue(null);

    renderLogin();

    await waitFor(() => expect(mockedDiscover).toHaveBeenCalled());
    expect(await screen.findByLabelText('Username')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Continue with Matrix' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
    expect(screen.getByLabelText('Username').closest('details')).toBeNull();
  });

  it('ignores a stale discovery that resolves after a newer one', async () => {
    let resolveOld: ((value: typeof MAS_METADATA | null) => void) | undefined;
    mockedNormalize.mockImplementation(async (input: string) => input);
    mockedDiscover.mockImplementation(((input: string) => {
      if (input === 'https://matrix.org') {
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
      return Promise.resolve(null);
    }) as typeof discoverMasAuth);

    renderLogin();
    const homeserver = await screen.findByLabelText('Homeserver URL');
    fireEvent.change(homeserver, { target: { value: 'https://example.org' } });
    fireEvent.blur(homeserver);
    // example.org resolves fast: no MAS → password form.
    await waitFor(() =>
      expect(mockedDiscover).toHaveBeenCalledWith('https://example.org'),
    );
    expect(await screen.findByLabelText('Username')).toBeTruthy();
    // The stale matrix.org discovery settles late with MAS present — must not win.
    resolveOld?.(MAS_METADATA);
    await waitFor(() => expect(mockedDiscover).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole('button', { name: 'Continue with Matrix' }),
    ).toBeNull();
  });

  it('starts the OAuth flow: registers the client, stores pending state and redirects', async () => {
    mockedDiscover.mockResolvedValue(MAS_METADATA);
    mockedRegister.mockResolvedValue('cid');
    const assign = vi.fn();
    vi.stubGlobal('location', { origin: 'http://localhost:4200', assign });

    renderLogin();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue with Matrix' }),
    );

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        expect.stringContaining('https://account.matrix.org/authorize'),
      ),
    );
    expect(mockedRegister).toHaveBeenCalledWith(
      'https://account.matrix.org/',
      'http://localhost:4200/callback',
    );
    expect(savePendingOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        homeserverUrl: 'https://matrix-client.matrix.org',
        issuer: 'https://account.matrix.org/',
        clientId: 'cid',
        redirectUri: 'http://localhost:4200/callback',
        state: 'st',
        codeVerifier: 'cv',
      }),
    );
    vi.unstubAllGlobals();
  });
});
