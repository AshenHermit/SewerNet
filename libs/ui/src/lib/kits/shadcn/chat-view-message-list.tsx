import { cn } from '@sewer-net/utils';
import { useUiKit } from '../../proxy/ui-kit-provider';
import type { ChatViewMessageListProps } from '../../ui-kit';

export function ShadcnChatViewMessageList({
  events,
  loading,
  currentUserId,
  bottomRef,
  className,
  ...props
}: ChatViewMessageListProps) {
  const kit = useUiKit();

  return (
    <div
      {...props}
      ref={bottomRef}
      className={cn('flex-1 overflow-y-auto px-4 py-4', className)}
    >
      {loading ? (
        <p className="text-center text-xs text-[var(--sn-text-dim)]">
          Loading messages
        </p>
      ) : events.length === 0 ? (
        <p className="text-center text-xs text-[var(--sn-text-dim)]">
          No messages yet
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.map((event) => (
            <kit.ChatViewMessage
              key={event.event_id}
              event={event}
              own={event.sender === currentUserId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
