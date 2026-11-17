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
      className={cn('flex min-h-dvh items-center justify-center p-6', className)}
    >
      <div className="w-full max-w-sm rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-6 text-center shadow-lg">
        <p className="text-lg font-semibold text-[var(--sn-text)]">{title}</p>
        {detail ? (
          <p className="mt-2 text-xs text-[var(--sn-text-muted)]">{detail}</p>
        ) : null}
        {actionLabel && onAction ? (
          <ProxyButton className="mt-4" onClick={onAction}>
            {actionLabel}
          </ProxyButton>
        ) : null}
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </div>
  );
}
