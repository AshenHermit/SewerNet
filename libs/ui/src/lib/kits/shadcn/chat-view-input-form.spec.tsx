import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShadcnChatViewInputForm } from './chat-view-input-form';

function renderForm(overrides: Partial<Parameters<typeof ShadcnChatViewInputForm>[0]> = {}) {
  const props = {
    draft: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  const utils = render(<ShadcnChatViewInputForm {...props} />);
  return { ...utils, props };
}

describe('ShadcnChatViewInputForm', () => {
  it('renders the attach control only when onAttach is provided', () => {
    renderForm();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('passes the picked file to onAttach', () => {
    const onAttach = vi.fn();
    renderForm({ onAttach, attachLabel: 'Attach file' });

    fireEvent.click(screen.getByTitle('Attach file'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onAttach).toHaveBeenCalledWith(file);
  });

  it('keeps text submits working alongside attachments', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit, onAttach: vi.fn(), draft: 'hi' });

    fireEvent.submit(screen.getByPlaceholderText('Message').closest('form') as HTMLFormElement);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
