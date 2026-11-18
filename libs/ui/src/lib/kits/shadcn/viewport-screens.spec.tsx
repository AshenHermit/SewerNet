import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShadcnLoginScreen } from './login-screen';
import { ShadcnStatusPanel } from './status-panel';
import type { LoginScreenProps, StatusPanelProps } from '../../ui-kit';

/**
 * Walks up from this file until `apps/web/index.html` exists, so the assertion
 * works no matter which directory the runner started from (`nx test` uses the
 * workspace root, a bare `vitest` run uses the project root).
 */
function findAppHtml(): string {
  let dir = import.meta.dirname;
  for (let depth = 0; depth < 10; depth++) {
    const candidate = join(dir, 'apps', 'web', 'index.html');
    if (existsSync(candidate)) return candidate;
    dir = join(dir, '..');
  }
  throw new Error('could not locate apps/web/index.html from the ui package');
}

const appHtml = () => readFileSync(findAppHtml(), 'utf8');

function loginProps(overrides: Partial<LoginScreenProps> = {}): LoginScreenProps {
  return {
    appName: 'SewerNet',
    subtitle: 'A customizable Matrix messenger',
    homeserverUrl: 'https://hs.example',
    homeserverLabel: 'Homeserver',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    signInLabel: 'Sign in',
    onHomeserverChange: vi.fn(),
    onHomeserverBlur: vi.fn(),
    oidc: true,
    resolving: false,
    starting: false,
    error: null,
    onContinueWithMatrix: vi.fn(),
    continueLabel: 'Continue with Matrix',
    createAccountLabel: 'Create account',
    onTogglePasswordForm: vi.fn(),
    passwordFormLabel: 'Use password instead',
    user: 'alice',
    onUserChange: vi.fn(),
    password: 'secret',
    onPasswordChange: vi.fn(),
    passwordLoading: false,
    passwordError: null,
    onSignIn: vi.fn(),
    ...overrides,
  };
}

function statusProps(overrides: Partial<StatusPanelProps> = {}): StatusPanelProps {
  return {
    title: 'Connecting',
    detail: 'https://hs.example/path/that/is/very/long/and/should/wrap/instead/of/overflowing',
    actionLabel: 'Retry',
    onAction: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('viewport meta', () => {
  it('enables safe area and keyboard resize without disabling zoom', () => {
    const html = appHtml();
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/i);

    expect(viewport).not.toBeNull();
    const content = viewport?.[1] ?? '';
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1');
    expect(content).toContain('viewport-fit=cover');
    expect(content).toContain('interactive-widget=resizes-content');
    // Zoom must stay available for accessibility.
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('user-scalable=no');
  });
});

describe('ShadcnLoginScreen auth controls', () => {
  it('keeps OIDC and password controls working', () => {
    const props = loginProps();
    render(<ShadcnLoginScreen {...props} />);

    const continueButton = screen.getByRole('button', { name: 'Continue with Matrix' });
    const createButton = screen.getByRole('button', { name: 'Create account' });
    const signIn = screen.getByRole('button', { name: 'Sign in' });

    fireEvent.click(continueButton);
    fireEvent.click(createButton);
    fireEvent.submit(signIn);

    expect(props.onContinueWithMatrix).toHaveBeenCalledTimes(2);
    expect(vi.mocked(props.onContinueWithMatrix).mock.calls[0]).toEqual([]);
    expect(vi.mocked(props.onContinueWithMatrix).mock.calls[1]).toEqual(['create']);
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
  });

  it('keeps the password fallback controlled', () => {
    const props = loginProps();
    render(<ShadcnLoginScreen {...props} />);

    const user = screen.getByPlaceholderText('alice');
    const password = document.querySelector<HTMLInputElement>('input[type="password"]');
    if (!password) throw new Error('the password fallback input is expected to render');
    fireEvent.change(user, { target: { value: 'bob' } });
    fireEvent.change(password, { target: { value: 'new-pass' } });

    expect(props.onUserChange).toHaveBeenCalledWith('bob');
    expect(props.onPasswordChange).toHaveBeenCalledWith('new-pass');
    expect(user).toHaveProperty('value', 'alice');
  });

  it('lets the whole login page scroll instead of clipping', () => {
    const { container } = render(<ShadcnLoginScreen {...loginProps()} />);
    const page = container.firstElementChild as HTMLElement;

    // A short viewport must scroll the page: never a fixed height with
    // `overflow: hidden`, and never a required vertical centering that clips.
    expect(page.className).toContain('min-h-dvh');
    expect(page.className).toContain('overflow-y-auto');
    expect(page.className).not.toContain('overflow-hidden');
    expect(page.className).not.toMatch(/flex h-full/);
  });
});

describe('ShadcnStatusPanel', () => {
  it('preserves status action', () => {
    const props = statusProps();
    render(<ShadcnStatusPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(props.onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Connecting')).toBeTruthy();
  });

  it('wraps long detail and lets the page scroll', () => {
    const { container } = render(<ShadcnStatusPanel {...statusProps()} />);
    const page = container.firstElementChild as HTMLElement;
    const detail = screen.getByText(/long\/and/);

    expect(page.className).toContain('min-h-dvh');
    expect(page.className).toContain('overflow-y-auto');
    expect(detail.className).toContain('break-words');
    expect(detail.className).toContain('overflow-wrap');
  });
});

describe('dynamic viewport fallback', () => {
  it('shares the viewport unit fallback and safe-area padding', () => {
    const styles = readFileSync(join(import.meta.dirname, '..', '..', '..', 'styles.css'), 'utf8');
    // Safe-area tokens are declared once in the layout tokens and consumed here.
    const tokens = readFileSync(join(import.meta.dirname, '..', '..', '..', 'layout-tokens.css'), 'utf8');

    // Older browsers without `dvh` must still get a full-height page.
    expect(styles).toMatch(/100vh/);
    expect(styles).toMatch(/100dvh/);
    expect(styles.indexOf('100vh')).toBeLessThan(styles.indexOf('100dvh'));
    // The safe-area insets feed the shared page padding.
    expect(tokens).toContain('--sn-safe-top');
    expect(tokens).toMatch(/safe-area-inset-top/);
    expect(styles).toContain("@import './layout-tokens.css';");
  });
});
