import { cn } from '@sewer-net/utils';
import type { ChatViewPanelProps } from '../../ui-kit';

export function ShadcnChatViewPanel({ children, className, ...props }: ChatViewPanelProps) {
  return (
    <div
      {...props}
      className={cn('flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-[var(--sn-bg)]', className)}
    >
      {children}
    </div>
  );
}

