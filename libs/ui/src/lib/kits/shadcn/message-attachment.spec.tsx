import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShadcnMessageAttachment } from './message-attachment';

const labels = { downloadLabel: 'Download', loadingLabel: 'Loading attachment', retryLabel: 'Retry' };

describe('ShadcnMessageAttachment', () => {
  it('valid_image_and_file_download', () => {
    const { rerender } = render(<ShadcnMessageAttachment name="photo.png" url="blob:resolved" previewUrl="blob:resolved" loading={false} {...labels} onRetry={vi.fn()} />);
    expect(screen.getByRole('link', { name: /download photo\.png/i }).getAttribute('href')).toBe('blob:resolved');
    expect(screen.getByRole('img', { name: 'photo.png' }).getAttribute('src')).toBe('blob:resolved');
    rerender(<ShadcnMessageAttachment name="notes.pdf" url="blob:file" loading={false} {...labels} onRetry={vi.fn()} />);
    expect(screen.getByRole('link', { name: /download notes\.pdf/i }).getAttribute('href')).toBe('blob:file');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders accessible loading and retry error states without download', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ShadcnMessageAttachment name="photo.png" loading {...labels} onRetry={onRetry} />);
    expect(screen.getByRole('status').textContent).toContain('Loading attachment');
    rerender(<ShadcnMessageAttachment name="photo.png" loading={false} error="Could not verify attachment" {...labels} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('Could not verify attachment');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
