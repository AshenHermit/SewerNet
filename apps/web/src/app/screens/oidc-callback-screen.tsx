import { useCallback, useEffect, useRef, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ProxyStatusPanel } from '@sewer-net/ui';
import { getPlatformKind } from '../../platform/runtime';
import { handleDesktopOidcCallback } from '../features/auth/desktop-oidc';
import { takeLatestCallbackUrl } from '../../platform/desktop-oidc';
import {
  clearPendingOidcFlow,
  completeOidcLogin,
  getPendingOidcFlow,
} from '../features/auth/oidc';

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
  const location = useLocation();
  const [searchParams] = useSearchParams();
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
        let isDesktop = false;
        try { isDesktop = getPlatformKind() === 'desktop'; } catch { /* callback tests render before bootstrap */ }
        if (isDesktop) {
          // Prefer callback URL from navigation state (passed by app.tsx listener)
          // Fall back to queue for backwards compat (deep link activation)
          const stateUrl = (location.state as { callbackUrl?: string } | null)?.callbackUrl;
          const claimedUrl = stateUrl ?? takeLatestCallbackUrl();
          if (!claimedUrl) throw new CallbackFailure('failed', 'desktop_callback_not_claimed');
          await handleDesktopOidcCallback(claimedUrl);
          setDone(true);
          return;
        }
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

        await completeOidcLogin(code, state);
        clearPendingOidcFlow();
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
  }, [searchParams]);

  const handleCancel = useCallback(() => {
    clearPendingOidcFlow();
    navigate('/welcome', { replace: true });
  }, [navigate]);

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

  return (
    <ProxyStatusPanel
      title={<Trans>Finishing sign-in…</Trans>}
      actionLabel={<Trans>Cancel</Trans>}
      onAction={handleCancel}
    />
  );
}
