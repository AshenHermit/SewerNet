import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingOidcFlow,
  completeOidcLogin,
  getPendingOidcFlow,
  type PendingOidcFlow,
} from '../features/auth/oidc';
import { useAuthStore } from '../stores/auth-store';
import { OidcCallbackScreen } from './oidc-callback-screen';

vi.mock('../features/auth/oidc', () => ({
  completeOidcLogin: vi.fn(),
  getPendingOidcFlow: vi.fn(),
  clearPendingOidcFlow: vi.fn(),
}));

const mockedComplete = vi.mocked(completeOidcLogin);
const mockedGetPending = vi.mocked(getPendingOidcFlow);
const mockedClearPending = vi.mocked(clearPendingOidcFlow);

const PENDING: PendingOidcFlow = {
  homeserverUrl: 'https://matrix-client.matrix.org',
  nonce: 'n1',
  responseMode: 'query',
  action: 'login',
};

function renderCallback(search = '?code=c1&state=s1') {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <MemoryRouter initialEntries={[`/oidc/callback${search}`]}>
            <Routes>
              <Route path="/oidc/callback" element={<OidcCallbackScreen />} />
              <Route path="/" element={<div>chat-home</div>} />
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mockedGetPending.mockReturnValue(PENDING);
});

describe('OidcCallbackScreen', () => {
  it('completes the login and navigates to the chat', async () => {
    mockedComplete.mockResolvedValue({
      userId: '@alice:matrix.org',
      accessToken: 'at',
      deviceId: 'dev',
      homeserverUrl: PENDING.homeserverUrl,
    });

    renderCallback();

    await waitFor(() =>
      expect(mockedComplete).toHaveBeenCalledWith('c1', 's1'),
    );
    expect(await screen.findByText('chat-home')).toBeTruthy();
    expect(useAuthStore.getState().credentials?.userId).toBe('@alice:matrix.org');
    expect(mockedClearPending).toHaveBeenCalled();
  });

  it('shows the denied message and clears the pending flow without token calls', async () => {
    renderCallback('?error=access_denied&state=s1');

    expect(await screen.findByText('Sign-in was cancelled')).toBeTruthy();
    expect(mockedComplete).not.toHaveBeenCalled();
    expect(mockedClearPending).toHaveBeenCalled();
  });

  it('shows an error when there is no pending flow', async () => {
    mockedGetPending.mockReturnValue(null);
    renderCallback('?code=c1&state=s1');

    expect(await screen.findByText('Sign-in session expired. Please try again.')).toBeTruthy();
    expect(mockedComplete).not.toHaveBeenCalled();
    expect(mockedClearPending).toHaveBeenCalled();
  });

  it('shows a failure message when the code exchange rejects', async () => {
    mockedComplete.mockRejectedValue(new Error('oidc_missing_device_id'));
    renderCallback('?code=c1&state=s1');

    expect(await screen.findByText('Sign-in failed')).toBeTruthy();
    expect(mockedClearPending).toHaveBeenCalled();
  });

  it('runs the exchange only once even if the effect re-runs', async () => {
    mockedComplete.mockImplementation(
      () => new Promise(() => undefined),
    );
    renderCallback('?code=c1&state=s1');

    await waitFor(() => expect(mockedComplete).toHaveBeenCalledTimes(1));
    expect(mockedComplete).toHaveBeenCalledTimes(1);
  });
});
