import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { IconSetProvider } from '@sewer-net/icons';
import { UiKitProvider } from '@sewer-net/ui';
import App from './app/app';
import { cleanupLegacyStorage } from './client/accounts';
import { registerServiceWorker } from './lib/sw-session';
import { activateLocale, detectLocale } from './i18n';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

async function bootstrap() {
  cleanupLegacyStorage();
  void registerServiceWorker();
  await activateLocale(detectLocale());

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );

  root.render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <UiKitProvider>
          <IconSetProvider>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </QueryClientProvider>
          </IconSetProvider>
        </UiKitProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

void bootstrap();
