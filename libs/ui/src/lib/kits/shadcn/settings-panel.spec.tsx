import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsPanelProps } from '../../ui-kit';
import { ProxySettingsPanel } from '../../proxy/proxy-settings-panel';
import { WIDE_MEDIA_QUERY } from '../../responsive/layout-mode';

interface MediaMock {
  matchMedia: typeof window.matchMedia;
  dispatch: (matches: boolean) => void;
  listeners: Set<() => void>;
}

function createMediaMock(matches: boolean): MediaMock {
  let current = matches;
  const listeners = new Set<() => void>();
  const matchMedia = ((query: string) => ({
    get matches() {
      return current;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
  return {
    matchMedia,
    dispatch: (next: boolean) => {
      current = next;
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
}

/**
 * jsdom has no `<dialog>` implementation: without these stubs `showModal()`
 * throws and `.open` never changes. The stub mirrors the observable part of the
 * native state machine only (open flag + focus) — it is not evidence of the
 * real focus trap, which is verified in a real browser.
 */
function installDialogStub() {
  const proto = window.HTMLDialogElement?.prototype;
  if (!proto) throw new Error('jsdom is expected to expose HTMLDialogElement');
  const originalShowModal = proto.showModal;
  const originalClose = proto.close;
  Object.defineProperty(proto, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(proto, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
  return () => {
    Object.defineProperty(proto, 'showModal', {
      configurable: true,
      writable: true,
      value: originalShowModal,
    });
    Object.defineProperty(proto, 'close', {
      configurable: true,
      writable: true,
      value: originalClose,
    });
  };
}

const baseProps: SettingsPanelProps = {
  open: true,
  onClose: () => undefined,
  onLogout: () => undefined,
  settingsLabel: 'Settings',
  logoutLabel: 'Log out',
  closeAriaLabel: 'Close',
  appearanceLabel: 'Appearance',
  interfaceLabel: 'Interface',
  colorSchemeLabel: 'Color scheme',
  accentLabel: 'Accent color',
  fontLabel: 'Font',
  radiusLabel: 'Corner radius',
  resetLabel: 'Reset to defaults',
  kitId: 'shadcn',
  kitLabel: 'shadcn/ui',
  onKitChange: () => undefined,
  mode: 'dark',
  onModeChange: () => undefined,
  modeOptions: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ],
  accent: '#22c55e',
  onAccentChange: () => undefined,
  accentPresets: [
    { id: 'sewer', label: 'Sewer Green', value: '#22c55e' },
    { id: 'matrix', label: 'Matrix Blue', value: '#3b82f6' },
  ],
  font: 'inter',
  onFontChange: () => undefined,
  fontOptions: [
    { id: 'inter', label: 'Inter' },
    { id: 'system', label: 'System' },
  ],
  radius: 10,
  onRadiusChange: () => undefined,
  locale: 'en',
  onLocaleChange: () => undefined,
  localeOptions: [
    { value: 'en', label: 'EN' },
    { value: 'ru', label: 'RU' },
  ],
  onReset: () => undefined,
};

const originalMatchMedia = window.matchMedia;

describe('ShadcnSettingsPanel', () => {
  let media: MediaMock;
  let restoreDialog: () => void;

  beforeEach(() => {
    media = createMediaMock(false);
    window.matchMedia = media.matchMedia;
    restoreDialog = installDialogStub();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    restoreDialog();
  });

  it('renders one compact settings form with working close and logout', () => {
    const onClose = vi.fn();
    const onLogout = vi.fn();
    render(<ProxySettingsPanel {...baseProps} onClose={onClose} onLogout={onLogout} />);

    expect(screen.getAllByRole('form', { name: 'Appearance' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    // The compact screen is a panel, so the shell can keep it mounted in the
    // settings slot while another section is visible.
    expect(document.querySelector('[data-sn-panel-body="settings"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens and cancels the wide dialog', () => {
    media = createMediaMock(true);
    window.matchMedia = media.matchMedia;
    const trigger = document.createElement('button');
    trigger.textContent = 'Settings';
    document.body.append(trigger);
    trigger.focus();

    const onClose = vi.fn();
    render(<ProxySettingsPanel {...baseProps} onClose={onClose} />);

    const dialogs = screen.getAllByRole('dialog', { name: 'Settings' });
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0] as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(screen.getAllByRole('form', { name: 'Appearance' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeTruthy();
    // The compact screen's focus target only exists in the shell slot.
    expect(document.querySelector('[data-sn-focus="settings"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    trigger.remove();
  });

  it('keeps a single form and stable field ids on resize', () => {
    const onModeChange = vi.fn();
    const onLocaleChange = vi.fn();
    const { rerender } = render(
      <ProxySettingsPanel {...baseProps} onModeChange={onModeChange} onLocaleChange={onLocaleChange} />,
    );

    const range = document.querySelector<HTMLInputElement>('input[type="range"]');
    expect(range).toBeTruthy();
    // The range input owns `${radiusId}-input`; its label points at it.
    expect(range!.labels).toHaveLength(1);
    const radiusLabel = range!.labels![0];
    expect(radiusLabel.tagName).toBe('LABEL');
    const compactForm = screen.getByRole('form', { name: 'Appearance' });

    act(() => media.dispatch(true));
    expect(screen.getByRole('form', { name: 'Appearance' })).not.toBe(compactForm);
    expect(screen.getAllByRole('form', { name: 'Appearance' })).toHaveLength(1);

    const wideRange = document.querySelector<HTMLInputElement>('input[type="range"]');
    expect(wideRange!.labels?.[0]?.tagName).toBe('LABEL');

    // Controlled values are owned above the container: a reflow never writes
    // the theme or locale stores.
    rerender(<ProxySettingsPanel {...baseProps} onModeChange={onModeChange} onLocaleChange={onLocaleChange} />);
    act(() => media.dispatch(false));
    expect(screen.getAllByRole('form', { name: 'Appearance' })).toHaveLength(1);
    expect(onModeChange).not.toHaveBeenCalled();
    expect(onLocaleChange).not.toHaveBeenCalled();

    const compactAgain = document.querySelector<HTMLInputElement>('input[type="range"]');
    expect(compactAgain!.labels?.[0]?.tagName).toBe('LABEL');
  });

  it('closes the dialog without touching the trigger', () => {
    media = createMediaMock(true);
    window.matchMedia = media.matchMedia;
    const trigger = document.createElement('button');
    trigger.textContent = 'Settings';
    document.body.append(trigger);
    trigger.focus();

    const { rerender } = render(<ProxySettingsPanel {...baseProps} />);
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    const close = screen.getByRole('button', { name: 'Close' });
    expect(dialog.contains(close)).toBe(true);

    rerender(<ProxySettingsPanel {...baseProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Native `<dialog>` restores focus to the opener; jsdom's stub cannot
    // reproduce that, so the real focus return is verified in a browser.
    expect(document.activeElement).not.toBe(close);
    expect(trigger.isConnected).toBe(true);

    trigger.remove();
  });

  it('marks the selected choices as pressed buttons', () => {
    render(<ProxySettingsPanel {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('uses the shared wide media query', () => {
    expect(WIDE_MEDIA_QUERY).toBe('(min-width: 48rem)');
    render(<ProxySettingsPanel {...baseProps} />);
    expect(screen.getByRole('form', { name: 'Appearance' })).toBeTruthy();
  });
});
