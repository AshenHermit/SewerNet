import { useEffect, useId, useRef } from 'react';
import { ProxyIcon } from '@sewer-net/icons';
import { cn } from '@sewer-net/utils';
import type { SettingsPanelProps } from '../../ui-kit';
import { ShadcnSettingsForm, settingsFormProps } from './settings-form';

type DialogDomProps = Pick<SettingsPanelProps, 'className' | 'id' | 'style'>;

/**
 * Wide settings dialog.
 *
 * The element is a real `<dialog>` opened with `showModal()`, which gives the
 * native focus trap, inert background and Escape handling for free. The caller
 * mounts it only while settings are open, so:
 *
 * - opening runs `showModal()` exactly once, and the initial focus lands on the
 *   first focusable control inside the dialog;
 * - unmounting (explicit close, logout, or a reflow to the compact screen)
 *   closes the dialog and lets the browser restore focus to the opener — an
 *   opener that is gone or hidden is skipped instead of being forced.
 *
 * Controlled values are only read here, so re-rendering with new settings
 * never re-creates or re-opens the dialog.
 */
export function ShadcnSettingsDialog({
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
    };
  }, []);

  const domProps: DialogDomProps = { className, id, style };

  return (
    <dialog
      {...domProps}
      ref={dialogRef}
      data-sn-settings-dialog=""
      aria-labelledby={titleId}
      // Escape is handled natively: prevent the default close, tell the
      // controller, and let unmounting close the element exactly once.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        'm-auto flex h-[min(85dvh,44rem)] w-[min(92vw,30rem)] flex-col overflow-hidden rounded-[calc(var(--sn-radius)*1.5)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-0 text-[var(--sn-text)] shadow-2xl backdrop:bg-black/50',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--sn-border)] px-4 py-3">
        <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {settingsLabel}
        </h2>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label={closeAriaLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sn-radius)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-2)] hover:text-[var(--sn-text)] focus-visible:outline-2 focus-visible:outline-[var(--sn-accent)]"
        >
          <ProxyIcon name="close" size={16} />
        </button>
      </div>

      <ShadcnSettingsForm {...settingsFormProps(props)} />

      <div className="shrink-0 border-t border-[var(--sn-border)] px-4 py-2">
        <button
          type="button"
          onClick={onLogout}
          className="flex h-9 w-full items-center gap-2 rounded-[var(--sn-radius)] px-2 text-sm font-medium text-[var(--sn-text)] hover:bg-[var(--sn-surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--sn-accent)]"
        >
          <ProxyIcon name="logout" size={16} />
          {logoutLabel}
        </button>
      </div>
    </dialog>
  );
}
