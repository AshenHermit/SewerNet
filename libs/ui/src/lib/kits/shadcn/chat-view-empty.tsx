import { cn } from '@sewer-net/utils';
import { ProxyIcon } from '@sewer-net/icons';
import type { ChatViewEmptyProps } from '../../ui-kit';

/** Chat placeholder shown while no room is selected. */
export function ShadcnChatViewEmpty({
  icon,
  label,
  className,
  ...props
}: ChatViewEmptyProps) {
  return (
    <section
      {...props}
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[var(--sn-text-dim)]',
        className,
      )}
    >
      {icon ?? <ProxyIcon name="message" size={48} strokeWidth={1.2} />}
      <p className="max-w-60 text-sm break-words [overflow-wrap:anywhere]">{label}</p>
    </section>
  );
}
