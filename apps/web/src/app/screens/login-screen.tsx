import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Trans } from '@lingui/react/macro';
import { ProxyButton, ProxyInput } from '@sewer-net/ui';
import { ProxyIcon } from '@sewer-net/icons';
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
  generateState,
  savePendingOAuth,
} from '../../lib/oauth-pkce';
import { useAuthStore } from '../stores/auth-store';

export function LoginScreen() {
  const setSession = useAuthStore((state) => state.setSession);
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
    // A discovery that settles after a newer one must not overwrite its result.
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
      // No MAS announcement (or network trouble): password form fallback.
      setMas(null);
    } finally {
      if (seq === discoverSeq.current) setResolving(false);
    }
  }, []);

  useEffect(() => {
    void discover('https://matrix.org');
  }, [discover]);

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
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
  }

  async function startOAuth(prompt?: 'create') {
    if (!mas || starting) return;
    setStarting(true);
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/callback`;
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await codeChallengeS256(codeVerifier);
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
          prompt,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setStarting(false);
    }
  }

  const passwordForm = (
    <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--sn-text-muted)]">
          <Trans>Username</Trans>
        </span>
        <ProxyInput
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="alice"
          autoComplete="username"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--sn-text-muted)]">
          <Trans>Password</Trans>
        </span>
        <ProxyInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          invalid={Boolean(error)}
        />
      </label>

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <ProxyButton type="submit" loading={loading} className="mt-2">
        <Trans>Sign in</Trans>
      </ProxyButton>
    </form>
  );

  return (
    <div className="flex h-full items-center justify-center bg-[var(--sn-bg)] p-4">
      <div className="w-full max-w-sm rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]">
            <ProxyIcon name="message" size={24} />
          </div>
          <h1 className="text-lg font-semibold text-[var(--sn-text)]">SewerNet</h1>
          <p className="text-xs text-[var(--sn-text-muted)]">
            <Trans>Sign in to your Matrix account</Trans>
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--sn-text-muted)]">
              <Trans>Homeserver URL</Trans>
            </span>
            <ProxyInput
              value={homeserverUrl}
              onChange={(e) => setHomeserverUrl(e.target.value)}
              onBlur={() => void discover(homeserverUrl)}
              placeholder="https://matrix.org"
              autoComplete="url"
              required
            />
          </label>

          {mas ? (
            <>
              <ProxyButton
                onClick={() => void startOAuth()}
                loading={starting || resolving}
                className="mt-2"
              >
                <Trans>Continue with Matrix</Trans>
              </ProxyButton>
              <ProxyButton
                variant="secondary"
                onClick={() => void startOAuth('create')}
                disabled={starting}
              >
                <Trans>Create account</Trans>
              </ProxyButton>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-[var(--sn-text-muted)]">
                  <Trans>Sign in with password</Trans>
                </summary>
                <div className="mt-3">{passwordForm}</div>
              </details>
            </>
          ) : (
            passwordForm
          )}
        </div>
      </div>
    </div>
  );
}
