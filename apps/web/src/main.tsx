import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { IconSetProvider } from '@sewer-net/icons';
import { UiKitProvider } from '@sewer-net/ui';
import App from './app/app';
import { BootstrapStatus } from './app/components/bootstrap-status';
import { registerServiceWorker } from './lib/sw-session';
import { activateLocale, detectLocale } from './i18n';
import { bootstrapSession } from './platform/bootstrap';
import './platform/desktop';
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

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

function renderApp() {
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

function renderBootstrapFailure(onRetry: () => void) {
  root.render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <UiKitProvider>
          <IconSetProvider>
            <BootstrapStatus onRetry={onRetry} />
          </IconSetProvider>
        </UiKitProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

let started = false;

async function start() {
  if (!started) {
    started = true;
    void registerServiceWorker();
    await activateLocale(detectLocale());
  }
  try {
    await bootstrapSession();
    renderApp();
  } catch {
    // The snapshot/UI already reports the failure; retry is explicit, never a
    // silent fallback to an empty account.
    renderBootstrapFailure(() => void start());
  }
}

void start();
