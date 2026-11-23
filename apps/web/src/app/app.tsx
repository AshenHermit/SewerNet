import { useEffect } from 'react';
import { applyTheme, useThemeStore } from '@sewer-net/themes';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { RequireAuth } from './features/auth/require-auth';
import { WelcomeScreen } from './screens/welcome-screen';
import { ChatScreen } from './screens/chat-screen';
import { OidcCallbackScreen } from './screens/oidc-callback-screen';
import { UpdateLifecycle } from './components/update-controller';

export function App() {
  const navigate = useNavigate();
  const settings = useThemeStore((state) => state.settings);

  // Push theme settings (accent, font, radius, mode) into CSS variables.
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  // Desktop OIDC: the native loopback listener (127.0.0.1:4201) emits
  // `sewernet://oidc-callback` when MAS redirects to the loopback callback.
  // Navigate the WebView to the /oidc/callback route so OidcCallbackScreen can
  // consume the queued callback and complete the login flow.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const tauri = await import('@tauri-apps/api/core');
        if (!(tauri.isTauri?.() ?? false)) return;
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<string>('sewernet://oidc-callback', (event) => {
          // Pass callback URL via navigation state to avoid race with desktop-oidc.ts queue
          navigate('/oidc/callback', { state: { callbackUrl: event.payload }, replace: true });
        });
      } catch {
        // Tauri APIs unavailable (browser build / tests): no-op.
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [navigate]);

  return (
    <>
    <UpdateLifecycle />
    <Routes>
      {/* Browser redirect destination for desktop OIDC is the loopback URI
          http://127.0.0.1:4201/oidc/callback. The native listener forwards the
          callback into this route; no sewernet:// deep-link navigation here. */}
      <Route path="/oidc/callback" element={<OidcCallbackScreen />} />
      <Route path="/welcome/:homeserver?" element={<WelcomeScreen />} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <ChatScreen />
          </RequireAuth>
        }
      />
    </Routes>
    </>
  );
}

export default App;
