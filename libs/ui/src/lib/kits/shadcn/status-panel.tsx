import { cn } from '@sewer-net/utils';
import { ProxyButton } from '../../proxy/index';
import type { StatusPanelProps } from '../../ui-kit';

export function ShadcnStatusPanel({
  title,
  detail,
  actionLabel,
  onAction,
  children,
  className,
  ...props
}: StatusPanelProps) {
  return (
    <div
      {...props}
      className={cn(
        // Same viewport contract as the login page: the page scrolls when the
        // viewport is short, and long server URLs wrap instead of overflowing.
        'sn-vh-full min-h-dvh w-full overflow-y-auto bg-[var(--sn-bg)]',
        'px-[max(1.5rem,var(--sn-safe-left))] py-[max(1.5rem,var(--sn-safe-top))]',
        'pb-[max(1.5rem,var(--sn-safe-bottom))] pr-[max(1.5rem,var(--sn-safe-right))]',
        className,
      )}
    >
      <div className="mx-auto my-auto w-full max-w-sm overflow-hidden rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-6 text-center shadow-lg">
        <p className="break-words text-lg font-semibold text-[var(--sn-text)] [overflow-wrap:anywhere]">
          {title}
        </p>
        {detail ? (
          <p className="mt-2 break-words text-xs text-[var(--sn-text-muted)] [overflow-wrap:anywhere]">
            {detail}
          </p>
        ) : null}
        {actionLabel && onAction ? (
          <ProxyButton className="mt-4" onClick={onAction}>
            {actionLabel}
          </ProxyButton>
        ) : null}
        {children ? <div className="mt-2 break-words [overflow-wrap:anywhere]">{children}</div> : null}
      </div>
    </div>
  );
}
