import { cn } from '@sewer-net/utils';
import type { ChatScreenProps } from '../../ui-kit';

export function ShadcnChatScreen({ className, children, ...props }: ChatScreenProps) {
  return (
    <div
      {...props}
      className={cn('flex h-full overflow-hidden bg-[var(--sn-bg)]', className)}
    >
      {children}
    </div>
  );
}

