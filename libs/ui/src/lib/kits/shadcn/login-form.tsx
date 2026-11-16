import { cn } from '@sewer-net/utils';
import { ProxyInput, ProxyButton } from '../../proxy/index.js';
import type { LoginFormProps } from '../../ui-kit.js';

export function ShadcnLoginForm({
  usernameLabel,
  passwordLabel,
  submitLabel,
  onSubmit,
  user,
  onUserChange,
  password,
  onPasswordChange,
  invalid,
  error,
  loading,
  className,
  ...props
}: LoginFormProps) {
  return (
    <form
      {...props}
      onSubmit={onSubmit}
      className={cn('flex flex-col gap-3', className)}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--sn-text-muted)]">
          {usernameLabel}
        </span>
        <ProxyInput
          value={user}
          onChange={(e) => onUserChange(e.target.value)}
          placeholder="alice"
          autoComplete="username"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--sn-text-muted)]">
          {passwordLabel}
        </span>
        <ProxyInput
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
          invalid={invalid}
        />
      </label>

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <ProxyButton type="submit" loading={loading} className="mt-2">
        {submitLabel}
      </ProxyButton>
    </form>
  );
}
