import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { logoutCurrent, prewarmCrypto, resume } from '../../../client/init-matrix';
import type { MatrixCredentials } from '../../../client/accounts';
import { useAuthStore } from '../../stores/auth-store';
import { RequireAuth } from './require-auth';

vi.mock('../../../client/init-matrix', () => ({
  resume: vi.fn(),
  prewarmCrypto: vi.fn(),
  logoutCurrent: vi.fn(),
}));

const mockedResume = vi.mocked(resume);
const mockedPrewarm = vi.mocked(prewarmCrypto);
const mockedLogout = vi.mocked(logoutCurrent);

const CREDENTIALS: MatrixCredentials = {
  userId: '@u:h.example',
  accessToken: 'at',
  deviceId: 'dev',
  homeserverUrl: 'https://h.example',
};

function renderGate() {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <div>chat-ready</div>
                  </RequireAuth>
                }
              />
              <Route path="/welcome/:homeserver?" element={<div>welcome-home</div>} />
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
  useAuthStore.setState({ credentials: null, session: null });
  mockedLogout.mockResolvedValue(undefined);
});

describe('RequireAuth', () => {
  it('redirects to welcome when there are no stored credentials', async () => {
    renderGate();
    expect(await screen.findByText('welcome-home')).toBeTruthy();
    expect(mockedResume).not.toHaveBeenCalled();
  });

  it('resumes the client and renders children after the first sync', async () => {
    useAuthStore.setState({ credentials: CREDENTIALS, session: null });
    mockedResume.mockImplementation(
      async (_c, onFirstSync) => {
        onFirstSync?.();
        return {} as never;
      },
    );

    renderGate();

    await waitFor(() => expect(mockedPrewarm).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockedResume).toHaveBeenCalledWith(CREDENTIALS, expect.any(Function)),
    );
    expect(await screen.findByText('chat-ready')).toBeTruthy();
  });

  it('shows an error with retry and logout when resume fails', async () => {
    useAuthStore.setState({ credentials: CREDENTIALS, session: null });
    mockedResume.mockRejectedValue(new Error('sync failed'));

    renderGate();

    expect(await screen.findByText('Could not restore the session')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();

    mockedResume.mockImplementation(async (_c, cb) => {
      cb?.();
      return {} as never;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('chat-ready')).toBeTruthy();
  });

  it('logs out from the error screen and lands on welcome', async () => {
    useAuthStore.setState({ credentials: CREDENTIALS, session: null });
    mockedResume.mockRejectedValue(new Error('sync failed'));

    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(mockedLogout).toHaveBeenCalled());
    expect(await screen.findByText('welcome-home')).toBeTruthy();
    expect(useAuthStore.getState().credentials).toBeNull();
  });
});
