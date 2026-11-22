import { cn } from '@sewer-net/utils';
import type { MessageAttachmentProps } from '../../ui-kit';

function isBlobUrl(value?: string): value is string {
  return typeof value === 'string' && value.startsWith('blob:');
}

export function ShadcnMessageAttachment({
  name,
  url,
  previewUrl,
  loading,
  error,
  downloadLabel,
  loadingLabel,
  retryLabel,
  onRetry,
}: MessageAttachmentProps) {
  const safeUrl = isBlobUrl(url) ? url : undefined;
  const safePreview = isBlobUrl(previewUrl) && safeUrl === previewUrl ? previewUrl : undefined;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {safePreview ? <img className="max-h-80 max-w-full rounded-lg object-contain" src={safePreview} alt={name} /> : null}
      {loading ? <span role="status" className="text-xs text-[var(--sn-text-muted)]">{loadingLabel}</span> : null}
      {error ? (
        <div role="alert" className="flex items-center gap-2 text-xs text-red-600">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="underline focus-visible:outline-none focus-visible:ring-2">{retryLabel}</button>
        </div>
      ) : null}
      {safeUrl && !loading && !error ? (
        <a className={cn('w-fit text-xs underline')} href={safeUrl} download={name} aria-label={`${downloadLabel} ${name}`}>
          {downloadLabel}: {name}
        </a>
      ) : null}
    </div>
  );
}
