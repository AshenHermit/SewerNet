import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyButton } from './proxy-button';

describe('ProxyButton', () => {
  it('renders the active kit button', () => {
    render(<ProxyButton>Send</ProxyButton>);
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('supports the loading state', () => {
    render(<ProxyButton loading>Sending</ProxyButton>);
    expect(screen.getByRole('button', { name: 'Sending' }).hasAttribute('disabled')).toBe(true);
  });
});

