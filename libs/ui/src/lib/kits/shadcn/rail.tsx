import { cn } from '@sewer-net/utils';
import { ProxyIcon } from '@sewer-net/icons';
import type { RailProps } from '../../ui-kit.js';

const NAV_ITEMS = [
  { icon: 'chats', label: 'Chats', active: true },
] as const;

export function ShadcnRail({
  mode,
  onThemeToggle,
  onSettings,
  onLogout,
  className,
  children,
  ...props
}: RailProps) {
  return (
    <nav
      {...props}
      className={cn(
        'flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--sn-border)] bg-[var(--sn-surface-1)] py-3',
        className,
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--sn-radius)] bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]">
        <ProxyIcon name="message" size={20} />
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.icon}
            title={item.label}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--sn-radius)] bg-[var(--sn-accent)]/15 text-[var(--sn-accent)]"
          >
            <ProxyIcon name={item.icon} />
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        {children}
      </div>
    </nav>
  );
}
