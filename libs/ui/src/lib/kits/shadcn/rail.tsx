import { cn } from '@sewer-net/utils';
import { ProxyIcon } from '@sewer-net/icons';
import type { RailProps } from '../../ui-kit';

export function ShadcnRail({
  mode,
  onThemeToggle,
  onSettings,
  onLogout,
  className,
  children,
  ...props
}: RailProps) {
  void mode;
  void onThemeToggle;
  void onSettings;
  void onLogout;
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

      <div className="mt-auto flex flex-col items-center gap-1">
        {children}
      </div>
    </nav>
  );
}

