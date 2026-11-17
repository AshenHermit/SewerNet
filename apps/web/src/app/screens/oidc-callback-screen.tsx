import { useEffect, useRef, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ProxyStatusPanel } from '@sewer-net/ui';
import {
  clearPendingOidcFlow,
  completeOidcLogin,
  getPendingOidcFlow,
} from '../features/auth/oidc';
import { useAuthStore } from '../stores/auth-store';

type FailureKind = 'denied' | 'expired' | 'failed';

class CallbackFailure extends Error {
  constructor(
    public kind: FailureKind,
    public detail?: string,
  ) {
    super(detail ?? kind);
    this.name = 'CallbackFailure';
  }
}

/**
 * Финиш MAS OIDC-флоу: SDK валидирует state/PKCE внутри
 * completeAuthorizationCodeGrant, экран только маршрутизирует результат.
 */
export function OidcCallbackScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setCredentials = useAuthStore((state) => state.setCredentials);
  const [failure, setFailure] = useState<{
    kind: FailureKind;
    detail?: string;
  } | null>(null);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const error = searchParams.get('error');
        if (error) {
          throw new CallbackFailure(
            'denied',
            searchParams.get('error_description') ?? error,
          );
        }
        const pending = getPendingOidcFlow();
        if (!pending) {
          throw new CallbackFailure('expired');
        }
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        if (!code || !state) {
          throw new CallbackFailure('failed', 'missing_code_or_state');
        }

        const credentials = await completeOidcLogin(code, state);
        clearPendingOidcFlow();
        setCredentials(credentials);
        setDone(true);
      } catch (thrown) {
        clearPendingOidcFlow();
        if (thrown instanceof CallbackFailure) {
          setFailure({ kind: thrown.kind, detail: thrown.detail });
        } else {
          setFailure({
            kind: 'failed',
            detail: thrown instanceof Error ? thrown.message : undefined,
          });
        }
      }
    })();
  }, [searchParams, setCredentials]);

  if (done) return <Navigate to="/" replace />;

  if (failure) {
    return (
      <ProxyStatusPanel
        title={
          failure.kind === 'denied' ? (
            <Trans>Sign-in was cancelled</Trans>
          ) : failure.kind === 'expired' ? (
            <Trans>Sign-in session expired. Please try again.</Trans>
          ) : (
            <Trans>Sign-in failed</Trans>
          )
        }
        detail={failure.detail}
        actionLabel={<Trans>Back to sign in</Trans>}
        onAction={() => navigate('/welcome')}
      />
    );
  }

  return <ProxyStatusPanel title={<Trans>Finishing sign-in…</Trans>} />;
}
