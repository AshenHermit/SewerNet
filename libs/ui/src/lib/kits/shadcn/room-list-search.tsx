import { cn } from '@sewer-net/utils';
import { ProxyInput } from '../../proxy/index';
import { ProxyIcon } from '@sewer-net/icons';
import type { RoomListSearchProps } from '../../ui-kit';

export function ShadcnRoomListSearch({
  query,
  onChange,
  placeholder,
  className,
  ...props
}: RoomListSearchProps) {
  return (
    <div
      {...props}
      className={cn('border-b border-[var(--sn-border)] p-3', className)}
    >
      <div className="flex h-9 items-center gap-2 rounded-[calc(var(--sn-radius)*0.9)] bg-[var(--sn-surface-2)] px-3 text-[var(--sn-text-dim)] focus-within:ring-2 focus-within:ring-[var(--sn-accent)]/30">
        <ProxyIcon name="search" size={16} />
        <ProxyInput
          value={query}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          placeholder={placeholder ?? 'Search'}
          className="w-full bg-transparent text-sm text-[var(--sn-text)] outline-none placeholder:text-[var(--sn-text-dim)]"
        />
      </div>
    </div>
  );
}

