import { useState, type FormEvent } from 'react';
import { Trans } from '@lingui/react/macro';
import { ProxyButton, ProxyInput } from '@sewer-net/ui';
import { ProxyIcon } from '@sewer-net/icons';
import { matrixClient } from '../../lib/matrix-client';
import { useAuthStore } from '../stores/auth-store';

export function LoginScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const [homeserverUrl, setHomeserverUrl] = useState('https://matrix.org');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
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

  return (
    <div className="flex h-full items-center justify-center bg-[var(--sn-bg)] p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-6 shadow-lg"
      >
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
              placeholder="https://matrix.org"
              autoComplete="url"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--sn-text-muted)]">
              <Trans>Username</Trans>
            </span>
            <ProxyInput
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="alice"
              autoComplete="username"
              required
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
              required
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
        </div>
      </form>
    </div>
  );
}
