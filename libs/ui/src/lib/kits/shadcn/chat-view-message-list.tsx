import { cn } from '@sewer-net/utils';
import { useUiKit } from '../../proxy/ui-kit-provider';
import type { ChatViewMessageListProps } from '../../ui-kit';

export function ShadcnChatViewMessageList({
  events,
  loading,
  currentUserId,
  bottomRef,
  hasMore,
  onLoadMore,
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
      {hasMore ? (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className={cn(
            'mx-auto mb-2 w-fit rounded-[calc(var(--sn-radius)*0.75)] border border-[var(--sn-border)] bg-[var(--sn-surface-2)] px-3 py-1 text-xs text-[var(--sn-text-muted)] transition-colors hover:bg-[var(--sn-surface-3)] hover:text-[var(--sn-text)] disabled:opacity-60',
          )}
        >
          {loading ? 'Loading…' : 'Load older messages'}
        </button>
      ) : null}
      {loading && !hasMore ? (
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
