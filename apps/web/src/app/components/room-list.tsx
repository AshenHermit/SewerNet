import { useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { ProxyIcon } from '@sewer-net/icons';
import { useChatStore } from '../stores/chat-store';
import { cn } from '@sewer-net/utils';

export function RoomList() {
  const rooms = useChatStore((state) => state.rooms);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const setActiveRoom = useChatStore((state) => state.setActiveRoom);
  const loading = useChatStore((state) => state.loadingRooms);
  const { t } = useLingui();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rooms.filter((room) => room.name.toLowerCase().includes(q)) : rooms;
  }, [rooms, query]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--sn-border)] bg-[var(--sn-surface-1)]">
      <div className="border-b border-[var(--sn-border)] p-3">
        <div className="flex h-9 items-center gap-2 rounded-[calc(var(--sn-radius)*0.9)] bg-[var(--sn-surface-2)] px-3 text-[var(--sn-text-dim)] focus-within:ring-2 focus-within:ring-[var(--sn-accent)]/30">
          <ProxyIcon name="search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Search`}
            className="w-full bg-transparent text-sm text-[var(--sn-text)] outline-none placeholder:text-[var(--sn-text-dim)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="p-3 text-xs text-[var(--sn-text-dim)]">
            <Trans>Loading chats…</Trans>
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-xs text-[var(--sn-text-dim)]">
            <Trans>No chats yet</Trans>
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((room) => (
              <li key={room.id}>
                <button
                  onClick={() => setActiveRoom(room.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[calc(var(--sn-radius)*0.9)] px-3 py-2.5 text-left transition-colors',
                    activeRoomId === room.id
                      ? 'bg-[var(--sn-accent)]/15'
                      : 'hover:bg-[var(--sn-surface-2)]',
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sn-surface-3)] text-[var(--sn-text-muted)]">
                    <ProxyIcon name="room" size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--sn-text)]">
                      {room.name}
                    </span>
                    <span className="block truncate text-xs text-[var(--sn-text-dim)]">
                      {room.preview || '\u00A0'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
