import { useId } from 'react';
import { ProxyIcon } from '@sewer-net/icons';
import { cn } from '@sewer-net/utils';
import type { SettingsPanelProps } from '../../ui-kit';
import { ShadcnSettingsForm, settingsFormProps } from './settings-form';

/**
 * Compact settings panel. It fills the shell's `settings` slot, so it is
 * mounted for the whole session and the shell decides when it is visible —
 * `open` only reaches the inner form, never the panel itself.
 */
export function ShadcnSettingsScreen({
  open,
  onClose,
  closeAriaLabel,
  settingsLabel,
  logoutLabel,
  onLogout,
  className,
  id,
  style,
  ...props
}: SettingsPanelProps) {
  void open;
  const titleId = useId();

  return (
    <div
      id={id}
      style={style}
      data-sn-panel-body="settings"
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--sn-bg)]', className)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--sn-border)] px-2 py-1">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeAriaLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--sn-radius)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-2)] hover:text-[var(--sn-text)] focus-visible:outline-2 focus-visible:outline-[var(--sn-accent)]"
        >
          <ProxyIcon name="close" size={20} />
        </button>
        <h2
          id={titleId}
          tabIndex={-1}
          data-sn-focus="settings"
          className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--sn-text)] outline-none"
        >
          {settingsLabel}
        </h2>
      </div>

      <ShadcnSettingsForm {...settingsFormProps(props)} />

      <div className="shrink-0 border-t border-[var(--sn-border)] px-4 pt-3 pb-[calc(var(--sn-bottom-nav-clearance)+var(--sn-safe-bottom))] sn-wide:pb-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-11 w-full items-center gap-2 rounded-[var(--sn-radius)] px-3 text-sm font-medium text-[var(--sn-text)] hover:bg-[var(--sn-surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--sn-accent)]"
        >
          <ProxyIcon name="logout" size={18} />
          {logoutLabel}
        </button>
      </div>
    </div>
  );
}
