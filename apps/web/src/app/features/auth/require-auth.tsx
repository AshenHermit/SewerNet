import { useEffect, useState, type ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import { Navigate, useNavigate } from 'react-router-dom';
import { ProxyButton, ProxyStatusPanel } from '@sewer-net/ui';
import { logoutCurrent, prewarmCrypto, resume } from '../../../client/init-matrix';
import { clearPublishedCredentials, useAuthStore } from '../../stores/auth-store';

type AuthGateState = 'pending' | 'ready' | 'unauthenticated' | 'error';

/**
 * Машина состояний входа: pending → ready | unauthenticated | error.
 * Ждёт первый sync (PREPARED/CATCHUP) перед показом клиента.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const credentials = useAuthStore((state) => state.credentials);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const navigate = useNavigate();
  const [state, setState] = useState<AuthGateState>('pending');
  const [attempt, setAttempt] = useState(0);

  // Credential identity changed: reset the gate. Losing credentials
  // (logout, token revoke) must always navigate away from the client UI,
  // even when the gate was already 'ready'.
  useEffect(() => {
    setState(credentials ? 'pending' : 'unauthenticated');
  }, [credentials]);

  // Await the first sync. Depends only on credentials/attempt — not on
  // state — so error transitions cannot restart the sync by themselves
  // (retry is explicit via the attempt counter).
  useEffect(() => {
    if (!credentials) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await prewarmCrypto();
        await resume(credentials, () => {
          if (!cancelled) setState('ready');
        });
      } catch (err) {
        console.error('[sewernet] resume error:', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [credentials, attempt]);

  // The durable snapshot is still loading: never resume a guessed session.
  if (status === 'loading') {
    return <ProxyStatusPanel title={<Trans>Restoring session…</Trans>} />;
  }

  // Storage could not be read or a session was quarantined: visible error,
  // explicit new login instead of resuming a possibly broken session.
  if (status === 'storage-error') {
    return (
      <ProxyStatusPanel
        title={<Trans>Could not restore the session</Trans>}
        detail={
          error ? (
            <Trans>Sign in again to continue.</Trans>
          ) : (
            <Trans>The homeserver is unreachable or the session expired.</Trans>
          )
        }
        actionLabel={<Trans>Sign in</Trans>}
        onAction={() => navigate('/welcome', { replace: true })}
      />
    );
  }

  if (state === 'unauthenticated') {
    return <Navigate to="/welcome" replace />;
  }

  if (state === 'error') {
    const onRetry = () => setAttempt((n) => n + 1);
    const onLogout = () => {
      // Remove the live UI first, then let the durable logout run.
      clearPublishedCredentials();
      void logoutCurrent();
    };
    return (
      <ProxyStatusPanel
        title={<Trans>Could not restore the session</Trans>}
        detail={<Trans>The homeserver is unreachable or the session expired.</Trans>}
        actionLabel={<Trans>Try again</Trans>}
        onAction={onRetry}
      >
        <ProxyButton variant="secondary" className="mt-2" onClick={onLogout}>
          <Trans>Log out</Trans>
        </ProxyButton>
      </ProxyStatusPanel>
    );
  }

  if (state !== 'ready') {
    return <ProxyStatusPanel title={<Trans>Restoring session…</Trans>} />;
  }

  return children;
}
