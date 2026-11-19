import { useMemo } from 'react';
import { ProxyMessageAttachment } from '@sewer-net/ui';
import type { MessageAttachmentProps } from '@sewer-net/ui';
import type { MatrixRoomEvent } from '@sewer-net/types';
import type { MatrixEncryptedFile } from '../../lib/attachment-crypto';
import { useMedia } from '../hooks/use-media';

export interface MessageAttachmentControllerProps extends Omit<MessageAttachmentProps, 'name' | 'url' | 'previewUrl' | 'loading' | 'error' | 'onRetry'> {
  event: MatrixRoomEvent;
}

const SAFE_PREVIEW_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function safeFilename(value: unknown): string {
  const raw = typeof value === 'string' ? value : 'attachment';
  const cleaned = Array.from(raw, (char) => {
    const code = char.charCodeAt(0);
    return char === '\\' || char === '/' || code <= 31 || code === 127 ? '_' : char;
  }).join('').replace(/^\.+/u, '').trim();
  return cleaned.slice(0, 180) || 'attachment';
}

function validDescriptor(value: unknown): value is MatrixEncryptedFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<MatrixEncryptedFile>;
  return file.v === 'v2' && typeof file.url === 'string' && file.url.startsWith('mxc://')
    && !!file.key && typeof file.key === 'object' && typeof file.iv === 'string'
    && !!file.hashes && typeof file.hashes.sha256 === 'string';
}

export function MessageAttachment({ event, downloadLabel, loadingLabel, retryLabel }: MessageAttachmentControllerProps) {
  const content = event.content;
  const descriptorPresent = Object.prototype.hasOwnProperty.call(content, 'file');
  const descriptor = content['file'];
  const msgtype = content['msgtype'];
  const descriptorIsValid = validDescriptor(descriptor);
  const valid = descriptorPresent && descriptorIsValid;
  const mxc = valid ? descriptor.url : !descriptorPresent && typeof content['url'] === 'string' && content['url'].startsWith('mxc://') ? content['url'] : undefined;
  const isRedacted = !!event.unsigned?.['redacted_because'] || !!event.unsigned?.['redacted_by'] || !content['body'];
  const info = content['info'] as Record<string, unknown> | undefined;
  const size = typeof info?.['size'] === 'number' ? info['size'] : undefined;
  const source = useMemo(() => !isRedacted && valid && mxc ? {
    mxc,
    size,
    encryptedFile: descriptor,
  } : !isRedacted && !descriptorPresent && mxc ? { mxc, size } : null,
  [isRedacted, valid, descriptorPresent, mxc, size, descriptor]);
  const media = useMedia(source);
  const name = safeFilename(content['body']);
  const mime = info?.['mimetype'];
  const previewUrl = msgtype === 'm.image' && typeof mime === 'string' && SAFE_PREVIEW_MIMES.has(mime.toLowerCase()) && media.url?.startsWith('blob:')
    ? media.url : undefined;
  const invalidEncryptedDescriptor = descriptorPresent && !descriptorIsValid;
  const props: MessageAttachmentProps = {
    name,
    url: !isRedacted && !invalidEncryptedDescriptor && media.url?.startsWith('blob:') ? media.url : undefined,
    previewUrl,
    loading: !isRedacted && !invalidEncryptedDescriptor && media.loading,
    error: isRedacted ? undefined : invalidEncryptedDescriptor ? 'Encrypted attachment descriptor is invalid' : media.error,
    downloadLabel,
    loadingLabel,
    retryLabel,
    onRetry: invalidEncryptedDescriptor || isRedacted ? () => undefined : media.retry,
  };
  if (isRedacted) return null;
  return <ProxyMessageAttachment {...props} />;
}
