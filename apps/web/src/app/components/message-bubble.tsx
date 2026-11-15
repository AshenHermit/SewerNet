import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MatrixRoomEvent } from '@sewer-net/types';
import { cn } from '@sewer-net/utils';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A single message. The body is rendered as GitHub-flavored Markdown;
 * custom HTML wrappers (per-message styling/effects) arrive later — see ROADMAP.
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
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
          own
            ? 'rounded-br-sm bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]'
            : 'rounded-bl-sm bg-[var(--sn-surface-2)] text-[var(--sn-text)]',
        )}
      >
        {!own ? (
          <p className="mb-0.5 text-xs font-medium text-[var(--sn-text-muted)]">
            {event.sender}
          </p>
        ) : null}
        <div className="[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-current/40 [&_blockquote]:pl-2 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:m-0 [&_p+p]:mt-1 [&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/20 [&_pre]:p-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>
        <p
          className={cn(
            'mt-0.5 text-right text-[10px]',
            own ? 'text-[var(--sn-accent-contrast)]/60' : 'text-[var(--sn-text-dim)]',
          )}
        >
          {formatTime(event.origin_server_ts)}
        </p>
      </div>
    </li>
  );
}
