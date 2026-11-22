import { cn } from '@sewer-net/utils';
import {
  ProxyButton,
  ProxyInput,
  ProxyLoginForm,
} from '../../proxy/index';
import { ProxyIcon } from '@sewer-net/icons';
import type { LoginScreenProps } from '../../ui-kit';

export function ShadcnLoginScreen({
  appName,
  subtitle,
  homeserverUrl,
  homeserverLabel,
  usernameLabel,
  passwordLabel,
  signInLabel,
  onHomeserverChange,
  onHomeserverBlur,
  savedHomeservers,
  onHomeserverSelect,
  oidc,
  oidcUnavailableHint,
  resolving,
  starting,
  error,
  onContinueWithMatrix,
  continueLabel,
  createAccountLabel,
  onTogglePasswordForm,
  passwordFormLabel,
  user,
  onUserChange,
  password,
  onPasswordChange,
  passwordLoading,
  passwordError,
  onSignIn,
  className,
  ...props
}: LoginScreenProps) {
  const passwordForm = (
    <ProxyLoginForm
      onSubmit={onSignIn}
      usernameLabel={usernameLabel}
      passwordLabel={passwordLabel}
      submitLabel={signInLabel}
      user={user}
      onUserChange={onUserChange}
      password={password}
      onPasswordChange={onPasswordChange}
      invalid={Boolean(passwordError)}
      error={passwordError ?? undefined}
      loading={passwordLoading}
    />
  );

  return (
    <div
      {...props}
      className={cn(
        // A short viewport (landscape phone, keyboard open) must scroll the
        // whole page: dynamic viewport height with the `100vh` fallback, an
        // auto block margin instead of a forced centering that clips, and the
        // safe-area insets applied outside the card.
        'sn-vh-full min-h-dvh w-full overflow-y-auto bg-[var(--sn-bg)]',
        'px-[max(1rem,var(--sn-safe-left))] py-[max(1rem,var(--sn-safe-top))]',
        'pb-[max(1rem,var(--sn-safe-bottom))] pr-[max(1rem,var(--sn-safe-right))]',
        className,
      )}
    >
      <div className="mx-auto my-auto w-full max-w-sm rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]">
            <ProxyIcon name="message" size={24} />
          </div>
          <h1 className="truncate text-lg font-semibold text-[var(--sn-text)]">
            {appName}
          </h1>
          <p className="max-w-full break-words text-xs text-[var(--sn-text-muted)] [overflow-wrap:anywhere]">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--sn-text-muted)]">
              {homeserverLabel}
            </span>
            <ProxyInput
              value={homeserverUrl}
              onChange={(e) => onHomeserverChange((e.target as HTMLInputElement).value)}
              onBlur={onHomeserverBlur}
              placeholder="https://matrix.org"
              autoComplete="url"
              required
            />
          </label>
          {savedHomeservers?.length && onHomeserverSelect ? (
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--sn-text-muted)]">
                Saved homeservers
              </span>
              <select
                aria-label="Saved homeservers"
                value={homeserverUrl}
                onChange={(e) =>
                  onHomeserverSelect((e.target as HTMLSelectElement).value)
                }
                className="h-10 w-full rounded-[var(--sn-radius)] border bg-[var(--sn-surface-2)] px-3 text-sm text-[var(--sn-text)] outline-none transition-colors focus:border-[var(--sn-accent)] focus:ring-2 focus:ring-[var(--sn-accent)]/20 border-[var(--sn-border)]"
              >
                <option value="">Choose a saved homeserver</option>
                {savedHomeservers.map((url) => (
                  <option key={url} value={url}>
                    {url}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {oidc ? (
            <>
              {oidcUnavailableHint ? (
                <p className="break-words text-xs text-[var(--sn-text-muted)] [overflow-wrap:anywhere]">
                  {oidcUnavailableHint}
                </p>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="break-words text-xs text-[var(--sn-text)] [overflow-wrap:anywhere]"
                >
                  {error}
                </p>
              ) : null}
              <ProxyButton
                onClick={() => void onContinueWithMatrix()}
                loading={starting || resolving}
                className="mt-2"
              >
                {continueLabel}
              </ProxyButton>
              <ProxyButton
                variant="secondary"
                onClick={() => void onContinueWithMatrix('create')}
                disabled={starting}
              >
                {createAccountLabel}
              </ProxyButton>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-[var(--sn-text-muted)]" onClick={onTogglePasswordForm}>
                  {passwordFormLabel}
                </summary>
                <div className="mt-3">{passwordForm}</div>
              </details>
            </>
          ) : (
            <>
              {oidcUnavailableHint ? (
                <p className="break-words text-xs text-[var(--sn-text-muted)] [overflow-wrap:anywhere]">
                  {oidcUnavailableHint}
                </p>
              ) : null}
              {passwordForm}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

