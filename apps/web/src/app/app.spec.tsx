import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './app';

// The welcome screen probes the homeserver for auth capabilities on mount;
// keep tests offline by stubbing the discovery layer.
vi.mock('./features/auth/oidc', () => ({
  resolveBaseUrl: vi.fn(async (input: string) => input),
  discoverAuthCapabilities: vi.fn(async (resolvedBaseUrl: string) => ({
    resolvedBaseUrl,
    hasPasswordLogin: true,
    ssoFlow: false,
    delegatedAuth: false,
    registerAvailable: false,
    authMetadata: null,
  })),
  getOrRegisterClientId: vi.fn(),
  getOidcRedirectUri: vi.fn(() => 'http://localhost:4200/oidc/callback'),
  startOidcLogin: vi.fn(),
}));

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('App', () => {
  it('shows the welcome screen when not authenticated', () => {
    localStorage.clear();
    render(
      <I18nProvider i18n={i18n}>
        <UiKitProvider>
          <IconSetProvider>
            <MemoryRouter initialEntries={['/']}>
              <App />
            </MemoryRouter>
          </IconSetProvider>
        </UiKitProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('SewerNet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
