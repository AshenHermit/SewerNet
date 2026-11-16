import { useCallback, useEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { ProxyLoginScreen } from '@sewer-net/ui';
import {
  discoverMasAuth,
  matrixClient,
  normalizeHomeserver,
  type MasAuthMetadata,
} from '../../lib/matrix-client';
import {
  buildAuthorizationUrl,
  codeChallengeS256,
  generateCodeVerifier,
  generateDeviceId,
  generateState,
  savePendingOAuth,
} from '../../lib/oauth-pkce';
import { useAuthStore } from '../stores/auth-store';

export function LoginScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const { t } = useLingui();
  const [homeserverUrl, setHomeserverUrl] = useState('https://matrix.org');
  const [resolvedHomeserver, setResolvedHomeserver] = useState<string | null>(null);
  const [mas, setMas] = useState<MasAuthMetadata | null>(null);
  const [resolving, setResolving] = useState(true);
  const [starting, setStarting] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discoverSeq = useRef(0);
  const discover = useCallback(async (input: string) => {
    const seq = ++discoverSeq.current;
    setResolving(true);
    setError(null);
    try {
      const resolved = await normalizeHomeserver(input);
      const metadata = await discoverMasAuth(resolved);
      if (seq !== discoverSeq.current) return;
      setResolvedHomeserver(resolved);
      setMas(metadata);
    } catch {
      if (seq !== discoverSeq.current) return;
      setMas(null);
    } finally {
      if (seq === discoverSeq.current) setResolving(false);
    }
  }, []);

  useEffect(() => {
    void discover('https://matrix.org');
  }, [discover]);

  const onSignIn = useCallback(async () => {
    if (!homeserverUrl || !user || !password) return;
    setLoading(true);
    setError(null);
    try {
      const session = await matrixClient.login({
        homeserverUrl,
        user,
        password,
        deviceName: 'SewerNet Web',
      });
      setSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }, [homeserverUrl, user, password, setSession, setLoading, setError]);

  const startOAuth = useCallback(
    async (prompt?: 'create') => {
      if (!mas || starting) return;
      setStarting(true);
      setError(null);
      try {
        const redirectUri = `${window.location.origin}/callback`;
        const state = generateState();
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await codeChallengeS256(codeVerifier);
        const deviceId = generateDeviceId();
        const clientId = await matrixClient.registerOauthClient(mas.issuer, redirectUri);
        savePendingOAuth({
          homeserverUrl: resolvedHomeserver ?? homeserverUrl,
          issuer: mas.issuer,
          clientId,
          redirectUri,
          state,
          codeVerifier,
          ...(prompt ? { prompt } : {}),
        });
        window.location.assign(
          buildAuthorizationUrl(mas, {
            clientId,
            redirectUri,
            state,
            codeChallenge,
            deviceId,
            prompt,
          }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        setStarting(false);
      }
    },
    [mas, starting, resolvedHomeserver, homeserverUrl],
  );

  return (
    <ProxyLoginScreen
      appName={t`SewerNet`}
      subtitle={t`Sign in to your Matrix account`}
      homeserverUrl={homeserverUrl}
      homeserverLabel={t`Homeserver URL`}
      usernameLabel={t`Username`}
      passwordLabel={t`Password`}
      signInLabel={t`Sign in`}
      onHomeserverChange={(value) => setHomeserverUrl(value)}
      onHomeserverBlur={() => void discover(homeserverUrl)}
      mas={mas}
      resolving={resolving}
      starting={starting}
      error={error}
      onContinueWithMatrix={(prompt) => void startOAuth(prompt as 'create' | undefined)}
      continueLabel={t`Continue with Matrix`}
      createAccountLabel={t`Create account`}
      onTogglePasswordForm={() => undefined}
      passwordFormLabel={t`Sign in with password`}
      user={user}
      onUserChange={(value) => setUser(value)}
      password={password}
      onPasswordChange={(value) => setPassword(value)}
      passwordLoading={loading}
      passwordError={error}
      onSignIn={onSignIn}
    />
  );
}
