import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { IconSetProvider } from '@sewer-net/icons';
import { UiKitProvider } from '@sewer-net/ui';
import App from './app/app';
import { activateLocale, detectLocale } from './i18n';
import './styles.css';

async function bootstrap() {
  await activateLocale(detectLocale());

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );

  root.render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <UiKitProvider>
          <IconSetProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </IconSetProvider>
        </UiKitProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

void bootstrap();
