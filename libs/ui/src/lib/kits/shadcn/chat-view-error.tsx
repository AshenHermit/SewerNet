import { cn } from '@sewer-net/utils';
import type { ChatViewErrorProps } from '../../ui-kit';

export function ShadcnChatViewError({ error, className, ...props }: ChatViewErrorProps) {
  if (!error) return null;

  return (
    <p
      {...props}
      className={cn(
        'border-t border-[var(--sn-border)] px-4 py-2 text-xs text-red-400',
        className,
      )}
    >
      {error}
    </p>
  );
}

