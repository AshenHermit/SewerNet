import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixRoomEvent } from '@sewer-net/types';
import { MessageAttachment } from './message-attachment';
import * as resolver from '../../lib/media-resolver';

vi.mock('../../lib/media-resolver', () => ({ acquireMedia: vi.fn(), clearMediaCache: vi.fn() }));
const labels = { downloadLabel: 'Download', loadingLabel: 'Loading attachment', retryLabel: 'Retry' };
const event = (content: Record<string, unknown>, redacted = false): MatrixRoomEvent => ({
  event_id: '$attachment', type: 'm.room.message', sender: '@alice:hs.example', origin_server_ts: 1,
  content: { msgtype: 'm.image', body: 'photo.png', ...content },
  ...(redacted ? { unsigned: { redacted_because: {} } } : {}),
});
const encryptedFile = { v: 'v2', url: 'mxc://hs.example/cipher', key: {}, iv: 'iv', hashes: { sha256: 'hash' } };

beforeEach(() => vi.clearAllMocks());

describe('MessageAttachment', () => {
  it('valid_image_and_file_download', async () => {
    vi.mocked(resolver.acquireMedia).mockResolvedValue({ url: 'blob:validated', release: vi.fn() });
    const { rerender } = render(<MessageAttachment event={event({ file: encryptedFile, url: 'https://evil.example/image', info: { mimetype: 'image/png' } })} {...labels} />);
    expect((await screen.findByRole('link', { name: /download photo\.png/i })).getAttribute('href')).toBe('blob:validated');
    expect(screen.getByRole('img', { name: 'photo.png' }).getAttribute('src')).toBe('blob:validated');
    expect(vi.mocked(resolver.acquireMedia)).toHaveBeenCalledWith(expect.objectContaining({ mxc: encryptedFile.url, encryptedFile }), expect.anything());
    rerender(<MessageAttachment event={event({ msgtype: 'm.file', body: '../../notes.txt', file: encryptedFile })} {...labels} />);
    const fileLink = await screen.findByRole('link');
    expect(fileLink.textContent).toContain('notes.txt');
    expect(fileLink.getAttribute('download')).toBe('_.._notes.txt');
    expect(fileLink.getAttribute('href')).toBe('blob:validated');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('hash_failure_has_retry_no_download', async () => {
    vi.mocked(resolver.acquireMedia).mockRejectedValue(new Error('Encrypted media verification or decryption failed'));
    render(<MessageAttachment event={event({ file: encryptedFile, url: 'mxc://hs.example/plain' })} {...labels} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(resolver.acquireMedia).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('html_svg_do_not_render_active_preview', async () => {
    vi.mocked(resolver.acquireMedia).mockResolvedValue({ url: 'blob:validated', release: vi.fn() });
    const { rerender } = render(<MessageAttachment event={event({ msgtype: 'm.image', body: 'unsafe.svg', file: encryptedFile, info: { mimetype: 'image/svg+xml' } })} {...labels} />);
    await waitFor(() => expect(resolver.acquireMedia).toHaveBeenCalled());
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<MessageAttachment event={event({ msgtype: 'm.file', body: 'page.html', file: encryptedFile, info: { mimetype: 'text/html' } })} {...labels} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('redacted_event_does_not_download_retained_attachment', async () => {
    vi.mocked(resolver.acquireMedia).mockResolvedValue({ url: 'blob:must-not-resolve', release: vi.fn() });
    const redactedEvent = event({
      msgtype: 'm.image',
      body: 'retained-photo.png',
      file: encryptedFile,
      url: 'mxc://hs.example/retained',
      info: { mimetype: 'image/png', size: 12 },
    });
    redactedEvent.unsigned = { redacted_because: { type: 'm.room.redaction' } };
    render(<MessageAttachment event={redactedEvent} {...labels} />);
    await waitFor(() => expect(resolver.acquireMedia).not.toHaveBeenCalled());
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('encrypted descriptor errors never fall back to plaintext and redact means no download', async () => {
    vi.mocked(resolver.acquireMedia).mockResolvedValue({ url: 'blob:validated', release: vi.fn() });
    const { rerender } = render(<MessageAttachment event={event({ msgtype: 'm.image', body: 'tampered.png', file: { ...encryptedFile, hashes: {} }, url: 'mxc://hs.example/plain' })} {...labels} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeNull());
    expect(resolver.acquireMedia).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<MessageAttachment event={event({ file: encryptedFile }, true)} {...labels} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(resolver.acquireMedia).not.toHaveBeenCalled();
  });
});
