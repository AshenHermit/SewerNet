import type { MatrixRoomEvent } from '@sewer-net/types';
import { cn } from '@sewer-net/utils';
import { ProxyMessageBubble } from '@sewer-net/ui';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A single message. Delegates the bubble rendering to the active UI kit
 * via ProxyMessageBubble; sender name and timestamp are kept as metadata.
 */
export function MessageBubble({
  event,
  own,
}: {
  event: MatrixRoomEvent;
  own: boolean;
}) {
  if (event.type !== 'm.room.message') return null;

  const body =
    typeof event.content?.['body'] === 'string'
      ? (event.content['body'] as string)
      : '';

  return (
    <li className={cn('flex', own ? 'justify-end' : 'justify-start')}>
      {!own ? (
        <p className="mb-0.5 text-xs font-medium text-[var(--sn-text-muted)]">
          {event.sender}
        </p>
      ) : null}
      <ProxyMessageBubble
        own={own}
        text={body}
        className={cn(
          'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
          own
            ? 'rounded-br-sm bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
            : 'rounded-bl-sm bg-[var(--sn-surface-2)] text-[var(--sn-text)]',
        )}
      />
      <p
        className={cn(
          'mt-0.5 text-right text-[10px]',
          own
            ? 'text-[var(--sn-accent-contrast)]/60'
            : 'text-[var(--sn-text-dim)]',
        )}
      >
        {formatTime(event.origin_server_ts)}
      </p>
    </li>
  );
}
