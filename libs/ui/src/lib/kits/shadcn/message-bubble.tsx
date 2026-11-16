import { cn } from '@sewer-net/utils';
import type { MessageBubbleProps } from '../../ui-kit.js';

export function ShadcnMessageBubble({ own = false, text, className, ...props }: MessageBubbleProps) {
  return (
    <div
      {...props}
      className={cn(
        'max-w-[80%] rounded-[var(--sn-radius)] p-3 text-sm',
        own
          ? 'ml-auto bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)] rounded-tr-none'
          : 'mr-auto bg-[var(--sn-surface-2)] border border-[var(--sn-border)] text-[var(--sn-text)] rounded-tl-none',
        className,
      )}
    >
      {text}
    </div>
  );
}
