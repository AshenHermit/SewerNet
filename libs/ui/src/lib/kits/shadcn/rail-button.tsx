import { cn } from '@sewer-net/utils';
import { ProxyIcon } from '@sewer-net/icons';
import type { RailButtonProps } from '../../ui-kit.js';

export function ShadcnRailButton({
  icon,
  title,
  active = false,
  className,
  ...props
}: RailButtonProps) {
  return (
    <button
      {...props}
      title={title}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-[var(--sn-radius)] transition-colors',
        active
          ? 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
          : 'text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-2)] hover:text-[var(--sn-text)]',
        className,
      )}
    >
      <ProxyIcon name={icon} />
    </button>
  );
}
