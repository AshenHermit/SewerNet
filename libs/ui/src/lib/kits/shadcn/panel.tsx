import { cn } from '@sewer-net/utils';
import type { PanelProps } from '../../ui-kit';

const paddings: Record<NonNullable<PanelProps['p']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function ShadcnPanel({
  children,
  className,
  p = 'md',
  bordered = true,
  ...props
}: PanelProps) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-[var(--sn-radius)] bg-[var(--sn-surface-2)]',
        bordered ? 'border border-[var(--sn-border)]' : '',
        paddings[p],
        className,
      )}
    >
      {children}
    </div>
  );
}

