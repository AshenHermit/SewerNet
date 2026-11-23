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
const HOMESERVERS_KEY = 'sewernet:homeservers';

function getSavedHomeservers(): string[] {
  try {
    const raw = localStorage.getItem(HOMESERVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((h) => typeof h === 'string');
    return [];
  } catch {
    return [];
  }
}

function saveHomeserver(url: string): void {
  try {
    const list = getSavedHomeservers();
    const normalized = url.trim();
    if (!normalized) return;
    const updated = [normalized, ...list.filter((h) => h !== normalized)].slice(0, 10);
    localStorage.setItem(HOMESERVERS_KEY, JSON.stringify(updated));
  } catch {
    // best-effort persistence only
  }
}

export function WelcomeScreen() {
  const params = useParams<{ homeserver?: string }>();
  const navigate = useNavigate();
  const { t } = useLingui();
  const saved = getSavedHomeservers();
  const defaultHomeserver = params.homeserver ?? saved[0] ?? DEFAULT_HOMESERVER;
  const [homeserverUrl, setHomeserverUrl] = useState(defaultHomeserver);
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
      saveHomeserver(homeserverUrl);
      setStarting(true);
      setError(null);
      try {
        const redirectUri = getOidcRedirectUri();
        const { clientId, redirectUri: effectiveRedirectUri } = await getOrRegisterClientId(caps.authMetadata, redirectUri);
        await startOidcLogin(
          caps.authMetadata,
          clientId,
          effectiveRedirectUri,
          caps.resolvedBaseUrl,
          prompt === 'create' ? 'register' : 'login',
        );
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        if (raw.includes('invalid_redirect_uri') || raw.includes('invalid redirect_uri')) {
          setError(
            'This Matrix authentication server does not accept the desktop callback. Desktop OIDC is unavailable here; use password sign-in.',
          );
        } else {
          setError(raw);
        }
        setStarting(false);
      }
    },
    [caps, starting],
  );

  const onSignIn = useCallback(async () => {
    if (!user || !password) return;
    saveHomeserver(homeserverUrl);
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
      savedHomeservers={saved}
      onHomeserverSelect={(url: string) => setHomeserverUrl(url)}
      oidc={Boolean(caps?.delegatedAuth)}
      oidcUnavailableHint={
        error
          ? t`Desktop OIDC is unavailable. Use password sign-in.`
          : !resolving && !caps?.delegatedAuth
            ? t`This homeserver does not advertise Matrix OIDC login; password sign-in is available.`
            : null
      }
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
      onSignIn={onSignIn}
    />
  );
}
