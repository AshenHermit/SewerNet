import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShadcnUpdatePanel } from './update-panel';

describe('ShadcnUpdatePanel', () => {
  it('shows update state and lets user confirm install or dismiss', () => {
    const onCheck = vi.fn();
    const onInstall = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ShadcnUpdatePanel
        phase="available"
        version="2.0.0"
        title="Updates"
        statusLabel="Version 2.0.0 available"
        checkLabel="Check updates"
        installLabel="Install"
        dismissLabel="Later"
        draftWarningLabel="Unsaved draft may be lost"
        draftWarning
        onCheck={onCheck}
        onInstall={onInstall}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Version 2.0.0 available');
    expect(screen.getByRole('status').textContent).toContain('2.0.0');
    expect(screen.getByText('Unsaved draft may be lost')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check updates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onInstall).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders unavailable state without install controls', () => {
    render(
      <ShadcnUpdatePanel
        phase="unavailable"
        title="Updates"
        statusLabel="Updates unavailable"
        checkLabel="Check updates"
        installLabel="Install"
        dismissLabel="Later"
        draftWarningLabel="Unsaved draft may be lost"
        draftWarning={false}
        onCheck={vi.fn()}
        onInstall={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Updates unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});
