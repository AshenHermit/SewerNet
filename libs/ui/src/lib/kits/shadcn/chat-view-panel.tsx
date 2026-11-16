import { cn } from '@sewer-net/utils';
import type { ChatViewPanelProps } from '../../ui-kit';

export function ShadcnChatViewPanel({ children, className, ...props }: ChatViewPanelProps) {
  return (
    <div
      {...props}
      className={cn('flex flex-col h-full bg-[var(--sn-bg)]', className)}
    >
      {children}
    </div>
  );
}

