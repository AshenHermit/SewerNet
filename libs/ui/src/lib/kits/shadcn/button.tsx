import { cn } from '@sewer-net/utils';
import type { ButtonProps } from '../../ui-kit.js';

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,box-shadow,filter] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sn-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sn-bg)]';

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)] shadow-sm hover:brightness-110 active:brightness-95',
  secondary:
    'bg-[var(--sn-surface-2)] text-[var(--sn-text)] hover:bg-[var(--sn-surface-3)]',
  ghost:
    'bg-transparent text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-2)] hover:text-[var(--sn-text)]',
  danger: 'bg-red-500 text-white shadow-sm hover:bg-red-600',
};

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs rounded-[calc(var(--sn-radius)*0.75)]',
  md: 'h-10 px-4 text-sm rounded-[var(--sn-radius)]',
  lg: 'h-12 px-6 text-base rounded-[var(--sn-radius)]',
  icon: 'h-10 w-10 rounded-[var(--sn-radius)]',
};

export function ShadcnButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
