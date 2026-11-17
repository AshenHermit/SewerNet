import { cn } from '@sewer-net/utils';
import { ProxyIcon } from '@sewer-net/icons';
import type { ChatViewHeaderProps } from '../../ui-kit';

export function ShadcnChatViewHeader({
  onBack,
  backLabel,
  avatar,
  avatarUrl,
  title,
  subtitle,
  encrypted,
  encryptedLabel,
  className,
  ...props
}: ChatViewHeaderProps) {
  return (
    <header
      {...props}
      className={cn(
        'flex h-14 items-center gap-3 border-b border-[var(--sn-border)] px-4',
        className,
      )}
    >
      {onBack ? (
        <button
          onClick={onBack}
          className="text-[var(--sn-text-muted)] hover:text-[var(--sn-text)] md:hidden"
          aria-label={typeof backLabel === 'string' ? backLabel : undefined}
        >
          <ProxyIcon name="back" />
        </button>
      ) : null}
      {avatarUrl && !avatar ? (
        <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--sn-surface-3)] text-[var(--sn-text-muted)]">
          {avatar ?? <ProxyIcon name="room" size={18} />}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-[var(--sn-text)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-xs text-[var(--sn-text-dim)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {encrypted ? (
        <span
          className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-[var(--sn-border)] bg-[var(--sn-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--sn-text-muted)]"
        >
          <ProxyIcon name="lock" size={12} />
          {encryptedLabel}
        </span>
      ) : null}
    </header>
  );
}

