import { useEffect, useRef, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { AuthSession } from '../../lib/matrix-client';
import { matrixClient } from '../../lib/matrix-client';
import {
  clearPendingOAuth,
  deviceIdFromScope,
  getPendingOAuth,
  parseCallbackParams,
} from '../../lib/oauth-pkce';
import { useAuthStore } from '../stores/auth-store';

type FailureKind = 'denied' | 'state' | 'expired' | 'failed';

class CallbackFailure extends Error {
  constructor(
    public kind: FailureKind,
    public detail?: string,
  ) {
    super(detail ?? kind);
    this.name = 'CallbackFailure';
  }
}

/** Finishes the MAS OAuth flow: validates state, exchanges the code, stores the session. */
export function CallbackScreen() {
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
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
      const params = parseCallbackParams(location.search, location.hash);
      const pending = getPendingOAuth();
      try {
        if (params.error) {
          throw new CallbackFailure(
            'denied',
            params.errorDescription ?? params.error,
          );
        }
        if (!pending) {
          throw new CallbackFailure('expired');
        }
        if (!params.code || params.state !== pending.state) {
          throw new CallbackFailure('state');
        }

        const tokens = await matrixClient.exchangeOauthCode({
          issuer: pending.issuer,
          clientId: pending.clientId,
          redirectUri: pending.redirectUri,
          code: params.code,
          codeVerifier: pending.codeVerifier,
          grantType: 'authorization_code',
        });
        const probe: AuthSession = {
          homeserverUrl: pending.homeserverUrl,
          accessToken: tokens.accessToken,
          userId: '',
          deviceId: '',
        };
        const who = await matrixClient.whoami(probe);

        clearPendingOAuth();
        setSession({
          homeserverUrl: pending.homeserverUrl,
          accessToken: tokens.accessToken,
          userId: who.user_id,
          // whoami often omits device_id for MAS-issued tokens. Recover it
          // from the granted scope, then from what we stored at redirect time.
          deviceId:
            who.device_id ??
            deviceIdFromScope(tokens.scope) ??
            pending.deviceId ??
            '',
          issuer: pending.issuer,
          clientId: pending.clientId,
          ...(tokens.refreshToken !== undefined
            ? { refreshToken: tokens.refreshToken }
            : {}),
          ...(tokens.expiresIn !== undefined
            ? { expiresAt: Date.now() + tokens.expiresIn * 1000 }
            : {}),
        });
        setDone(true);
      } catch (thrown) {
        clearPendingOAuth();
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
  }, [location.search, location.hash, setSession]);

  if (done) return <Navigate to="/" replace />;

  if (failure) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold text-[--sn-text]">
          {failure.kind === 'denied' && <Trans>Sign-in was cancelled</Trans>}
          {failure.kind === 'state' && (
            <Trans>Security check failed. Please try signing in again.</Trans>
          )}
          {failure.kind === 'expired' && (
            <Trans>Sign-in session expired. Please try again.</Trans>
          )}
          {failure.kind === 'failed' && <Trans>Sign-in failed</Trans>}
        </p>
        {failure.detail && <p className="text-sm text-[--sn-muted]">{failure.detail}</p>}
        <Link
          to="/"
          className="rounded-[var(--sn-radius)] bg-[--sn-accent] px-4 py-2 text-sm font-medium text-[--sn-accent-contrast]"
        >
          <Trans>Back to sign in</Trans>
        </Link>
      </div>
    );
  }

  return (
    <p className="flex min-h-dvh items-center justify-center p-6 text-[--sn-muted]">
      <Trans>Finishing sign-in…</Trans>
    </p>
  );
}
