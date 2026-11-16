import { cn } from '@sewer-net/utils';
import {
  ProxyButton,
  ProxyIcon,
  ProxyInput,
  ProxyLoginForm,
} from '../../proxy/index.js';
import type { LoginScreenProps } from '../../ui-kit.js';

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
  mas,
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
      error={passwordError}
      loading={passwordLoading}
    />
  );

  return (
    <div
      {...props}
      className={cn('flex h-full items-center justify-center bg-[var(--sn-bg)] p-4', className)}
    >
      <div className="w-full max-w-sm rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]">
            <ProxyIcon name="message" size={24} />
          </div>
          <h1 className="text-lg font-semibold text-[var(--sn-text)]">
            {appName}
          </h1>
          <p className="text-xs text-[var(--sn-text-muted)]">
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
              onChange={(e) => onHomeserverChange(e.target.value)}
              onBlur={onHomeserverBlur}
              placeholder="https://matrix.org"
              autoComplete="url"
              required
            />
          </label>

          {mas ? (
            <>
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
            passwordForm
          )}
        </div>
      </div>
    </div>
  );
}
