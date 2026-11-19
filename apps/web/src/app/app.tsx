import { useEffect } from 'react';
import { applyTheme, useThemeStore } from '@sewer-net/themes';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './features/auth/require-auth';
import { WelcomeScreen } from './screens/welcome-screen';
import { ChatScreen } from './screens/chat-screen';
import { OidcCallbackScreen } from './screens/oidc-callback-screen';
import { UpdateLifecycle } from './components/update-controller';

export function App() {
  const settings = useThemeStore((state) => state.settings);

  // Push theme settings (accent, font, radius, mode) into CSS variables.
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  return (
    <>
    <UpdateLifecycle />
    <Routes>
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
