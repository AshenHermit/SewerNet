import { cn } from '@sewer-net/utils';
import { useUiKit } from '../../proxy/ui-kit-provider';
import type { ChatViewMessageListProps } from '../../ui-kit';

/**
 * Timeline of the open room. This element is the scroll region the app attaches
 * its "am I at the bottom" listener to, so it owns `overflow-y-auto` and the
 * sentinel sits at its end. Text is allowed to wrap anywhere: Matrix bodies are
 * arbitrary and wide content must never push the layout sideways.
 */
export function ShadcnChatViewMessageList({
  events,
  loading,
  currentUserId,
  bottomRef,
  hasMore,
  onLoadMore,
  loadingLabel = 'Loading messages',
  emptyLabel = 'No messages yet',
  loadMoreLabel = 'Load older messages',
  className,
  ...props
}: ChatViewMessageListProps) {
  const kit = useUiKit();

  return (
    <div
      {...props}
      data-sn-scroll="messages"
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 [overflow-wrap:anywhere]',
        className,
      )}
    >
      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className={cn(
            'mx-auto mb-2 block w-fit min-h-9 rounded-[calc(var(--sn-radius)*0.75)] border border-[var(--sn-border)] bg-[var(--sn-surface-2)] px-3 py-1 text-xs text-[var(--sn-text-muted)] transition-colors hover:bg-[var(--sn-surface-3)] hover:text-[var(--sn-text)] disabled:opacity-60',
          )}
        >
          {loading ? loadingLabel : loadMoreLabel}
        </button>
      ) : null}
      {loading && !hasMore ? (
        <p className="text-center text-xs text-[var(--sn-text-dim)]">{loadingLabel}</p>
      ) : events.length === 0 ? (
        <p className="text-center text-xs text-[var(--sn-text-dim)]">{emptyLabel}</p>
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
      <div ref={bottomRef} className="h-1" aria-hidden="true" />
    </div>
  );
}
