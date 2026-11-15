import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { beforeAll, describe, expect, it } from 'vitest';
import { App } from './app';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('App', () => {
  it('shows the login screen when not authenticated', () => {
    localStorage.removeItem('sewernet:auth');
    render(
      <I18nProvider i18n={i18n}>
        <UiKitProvider>
          <IconSetProvider>
            <App />
          </IconSetProvider>
        </UiKitProvider>
      </I18nProvider>,
    );

    expect(screen.getByText('SewerNet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
