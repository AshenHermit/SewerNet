import { cn } from '@sewer-net/utils';
import type { KitOptionProps } from '../../ui-kit';

export function ShadcnKitOption({
  kitId,
  label,
  active,
  onSelect,
  className,
  ...props
}: KitOptionProps) {
  return (
    <button
      {...props}
      onClick={() => onSelect(kitId)}
      className={cn(
        'h-8 flex-1 rounded-[calc(var(--sn-radius)*0.75)] text-xs transition-colors',
        active
          ? 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
          : 'bg-[var(--sn-surface-2)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)]',
        className,
      )}
    >
      {label}
    </button>
  );
}

