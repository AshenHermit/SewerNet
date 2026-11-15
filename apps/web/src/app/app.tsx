import { useEffect } from 'react';
import { applyTheme, useThemeStore } from '@sewer-net/themes';
import { useAuthStore } from './stores/auth-store';
import { LoginScreen } from './screens/login-screen';
import { ChatScreen } from './screens/chat-screen';

export function App() {
  const settings = useThemeStore((state) => state.settings);
  const session = useAuthStore((state) => state.session);

  // Push theme settings (accent, font, radius, mode) into CSS variables.
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  return session ? <ChatScreen /> : <LoginScreen />;
}

export default App;
