import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShadcnLoginForm } from './login-form';

const baseProps = {
  usernameLabel: 'Username',
  passwordLabel: 'Password',
  submitLabel: 'Sign in',
  user: 'alice',
  onUserChange: () => undefined,
  password: 'secret',
  onPasswordChange: () => undefined,
  invalid: false,
  loading: false,
};

describe('ShadcnLoginForm', () => {
  it('prevents native submission and calls onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<ShadcnLoginForm {...baseProps} onSubmit={onSubmit} />);
    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    const seen: Event[] = [];
    form?.addEventListener('submit', (event) => seen.push(event));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1].defaultPrevented).toBe(true);
  });
});
