import { cn } from '@sewer-net/utils';
import type { ChatViewMessageProps } from '../../ui-kit.js';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ShadcnChatViewMessage({
  event,
  own = false,
  className,
  ...props
}: ChatViewMessageProps) {
  if (event.type !== 'm.room.message') return null;

  const body =
    typeof event.content?.['body'] === 'string'
      ? (event.content['body'] as string)
      : '';

  return (
    <li
      {...props}
      className={cn('flex', own ? 'justify-end' : 'justify-start', className)}
    >
      {!own ? (
        <p className="mb-0.5 text-xs font-medium text-[var(--sn-text-muted)]">
          {event.sender}
        </p>
      ) : null}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
          own
            ? 'rounded-br-sm bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
            : 'rounded-bl-sm bg-[var(--sn-surface-2)] text-[var(--sn-text)]',
          className,
        )}
      >
        {body}
      </div>
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
