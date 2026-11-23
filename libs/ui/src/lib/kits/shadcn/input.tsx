import { cn } from '@sewer-net/utils';
import type { InputProps } from '../../ui-kit';

export function ShadcnInput({ className, invalid, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-[var(--sn-radius)] border bg-[var(--sn-surface-2)] px-3 text-sm text-[var(--sn-text)] outline-none transition-colors placeholder:text-[var(--sn-text-dim)] focus:border-[var(--sn-accent)] focus:ring-2 focus:ring-[var(--sn-accent)]/20',
        invalid
          ? 'border-red-500/70'
          : 'border-[var(--sn-border)] hover:border-[var(--sn-border-strong)]',
        className,
      )}
    />
  );
}

