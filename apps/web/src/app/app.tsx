import { useEffect } from 'react';
import { applyTheme, useThemeStore } from '@sewer-net/themes';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/auth-store';
import { WelcomeScreen } from './screens/welcome-screen';
import { ChatScreen } from './screens/chat-screen';
import { CallbackScreen } from './screens/callback-screen';

export function App() {
  const settings = useThemeStore((state) => state.settings);
  const session = useAuthStore((state) => state.session);

  // Push theme settings (accent, font, radius, mode) into CSS variables.
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  return (
    <Routes>
      <Route path="/callback" element={<CallbackScreen />} />
      <Route path="/welcome/:homeserver?" element={session ? <ChatScreen /> : <WelcomeScreen />} />
      <Route path="*" element={session ? <ChatScreen /> : <WelcomeScreen />} />
    </Routes>
  );
}

export default App;
