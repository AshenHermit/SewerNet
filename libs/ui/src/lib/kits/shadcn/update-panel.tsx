import type { UpdatePanelProps } from '../../ui-kit';

export function ShadcnUpdatePanel({
  phase,
  version,
  progress,
  error,
  title,
  statusLabel,
  checkLabel,
  installLabel,
  dismissLabel,
  draftWarningLabel,
  draftWarning,
  onCheck,
  onInstall,
  onDismiss,
}: UpdatePanelProps) {
  const canInstall = phase === 'available' || phase === 'error';
  return (
    <section aria-label={title} className="mb-4 rounded-[var(--sn-radius)] border border-[var(--sn-border)] p-3">
      <h4 className="mb-2 text-xs font-medium text-[var(--sn-text-muted)]">{title}</h4>
      <p role="status" className="text-sm text-[var(--sn-text)]">
        {statusLabel}{version ? ` (${version})` : ''}{typeof progress === 'number' ? ` ${progress}%` : ''}
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-[var(--sn-text-muted)]">{error}</p>}
      {draftWarning && <p className="mt-1 text-xs text-[var(--sn-text-muted)]">{draftWarningLabel}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onCheck} className="min-h-11 rounded-[var(--sn-radius)] px-3 text-sm text-[var(--sn-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sn-accent)]">
          {checkLabel}
        </button>
      </div>
      {canInstall && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onInstall} className="min-h-11 rounded-[var(--sn-radius)] bg-[var(--sn-accent)] px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sn-accent)]">
            {installLabel}
          </button>
          <button type="button" onClick={onDismiss} className="min-h-11 rounded-[var(--sn-radius)] px-3 text-sm text-[var(--sn-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sn-accent)]">
            {dismissLabel}
          </button>
        </div>
      )}
    </section>
  );
}
