import { useCallback, useEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useNavigate, useParams } from 'react-router-dom';
import { ProxyLoginScreen } from '@sewer-net/ui';
import {
  discoverAuthCapabilities,
  getOrRegisterClientId,
  getOidcRedirectUri,
  resolveBaseUrl,
  startOidcLogin,
  type AuthCapabilities,
} from '../features/auth/oidc';
import { loginWithPassword } from '../../client/init-matrix';

const DEBOUNCE_MS = 300;
const DEFAULT_HOMESERVER = 'matrix.org';

export function WelcomeScreen() {
  const params = useParams<{ homeserver?: string }>();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [homeserverUrl, setHomeserverUrl] = useState(params.homeserver ?? DEFAULT_HOMESERVER);
  const [caps, setCaps] = useState<AuthCapabilities | null>(null);
  const [resolving, setResolving] = useState(true);
  const [starting, setStarting] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discoverSeq = useRef(0);

  // Debounced capability discovery: typing cancels the pending discovery,
  // a late response from a superseded input is dropped via the seq guard.
  useEffect(() => {
    const input = homeserverUrl;
    const seq = ++discoverSeq.current;
    setResolving(true);
    setError(null);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const resolved = await resolveBaseUrl(input);
          const nextCaps = await discoverAuthCapabilities(resolved);
          if (discoverSeq.current !== seq) return;
          setCaps({ ...nextCaps, resolvedBaseUrl: resolved });
        } catch {
          if (discoverSeq.current !== seq) return;
          setCaps(null);
        } finally {
          if (discoverSeq.current === seq) setResolving(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [homeserverUrl]);

  const onContinue = useCallback(
    async (prompt?: string) => {
      if (!caps?.delegatedAuth || !caps.authMetadata || starting) return;
      setStarting(true);
      setError(null);
      try {
        const redirectUri = getOidcRedirectUri();
        const clientId = await getOrRegisterClientId(caps.authMetadata, redirectUri);
        await startOidcLogin(
          caps.authMetadata,
          clientId,
          redirectUri,
          caps.resolvedBaseUrl,
          prompt === 'create' ? 'register' : 'login',
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStarting(false);
      }
    },
    [caps, starting],
  );

  const onSignIn = useCallback(async () => {
    if (!user || !password) return;
    setLoading(true);
    setError(null);
    try {
      await loginWithPassword(user, password, caps?.resolvedBaseUrl ?? homeserverUrl);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, password, caps, homeserverUrl, navigate]);

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
      onHomeserverBlur={() => undefined}
      oidc={Boolean(caps?.delegatedAuth)}
      resolving={resolving}
      starting={starting}
      error={error}
      onContinueWithMatrix={(prompt) => void onContinue(prompt)}
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
      onSignIn={() => void onSignIn()}
    />
  );
}
