import { useEffect, useState, type ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import { Navigate } from 'react-router-dom';
import { ProxyButton, ProxyStatusPanel } from '@sewer-net/ui';
import { logoutCurrent, prewarmCrypto, resume } from '../../../client/init-matrix';
import { useAuthStore } from '../../stores/auth-store';

type AuthGateState = 'pending' | 'syncing' | 'ready' | 'unauthenticated' | 'error';

/**
 * Машина состояний входа: pending → syncing → ready | unauthenticated | error.
 * Ждёт первый sync (PREPARED/CATCHUP) перед показом клиента.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const credentials = useAuthStore((state) => state.credentials);
  const setCredentials = useAuthStore((state) => state.setCredentials);
  const [state, setState] = useState<AuthGateState>('pending');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state === 'ready' || state === 'unauthenticated') {
      return;
    }
    if (!credentials) {
      setState('unauthenticated');
      return;
    }
    let cancelled = false;
    setState('syncing');
    void (async () => {
      try {
        await prewarmCrypto();
        await resume(credentials, () => {
          if (!cancelled) setState('ready');
        });
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [credentials, attempt, state]);

  if (state === 'unauthenticated') {
    return <Navigate to="/welcome" replace />;
  }

  if (state === 'error') {
    const onRetry = () => setAttempt((n) => n + 1);
    const onLogout = () => {
      void Promise.resolve(logoutCurrent()).finally(() => setCredentials(null));
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
