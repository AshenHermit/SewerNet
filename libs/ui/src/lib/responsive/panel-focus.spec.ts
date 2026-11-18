import { renderHook } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPanelFocusTarget, usePanelFocus } from './panel-focus';

/**
 * jsdom keeps `document.activeElement` on a removed node. Browsers blur it, so
 * the tests detach nodes through this helper, which records the removal and
 * makes `isConnected` report the truth for the hook.
 */
const detached = new WeakSet<Node>();

function detach(node: Element) {
  detached.add(node);
  node.querySelectorAll('*').forEach((child) => detached.add(child));
  node.remove();
}

Object.defineProperty(Node.prototype, 'isConnected', {
  configurable: true,
  get(this: Node) {
    return !detached.has(this);
  },
});

/**
 * jsdom has no layout engine, so `checkVisibility` never reports a `hidden`
 * ancestor. The tests install a small double that follows the one rule the
 * hook is allowed to rely on: an element inside `[hidden]` is not visible.
 * Elements created later (the harness never re-inserts markup) fall back to
 * the same rule through `Element.prototype`.
 */
function stubVisibility(root: HTMLElement) {
  root.querySelectorAll('*').forEach((element) => {
    Object.defineProperty(element, 'checkVisibility', {
      configurable: true,
      value: () => element.closest('[hidden]') === null,
    });
  });
}

Element.prototype.checkVisibility = function checkVisibility() {
  return this.closest('[hidden]') === null;
};

const SHELL = `
  <nav data-sn-nav="bottom"><button data-sn-action="settings" type="button">Settings</button></nav>
  <div data-sn-panel="rooms">
    <div data-sn-focus="rooms" tabindex="-1">SewerNet</div>
    <button data-room-id="!a:hs" type="button">Alpha</button>
    <button data-room-id="!a.b[room]:hs" type="button">Tricky</button>
    <div hidden><button data-room-id="!gone:hs" type="button">Gone</button></div>
  </div>
  <div data-sn-panel="chat" hidden>
    <h1 data-sn-focus="chat" tabindex="-1">Alpha</h1>
    <form><input aria-label="Message" /></form>
  </div>
  <div data-sn-panel="settings" hidden>
    <h2 data-sn-focus="settings" tabindex="-1">Settings</h2>
  </div>
`;

interface Harness {
  root: HTMLDivElement;
  composer: HTMLInputElement;
  settingsTrigger: HTMLButtonElement;
  bottomNav: HTMLElement;
}

function installShell(): Harness {
  const root = document.createElement('div');
  root.innerHTML = SHELL;
  document.body.append(root);
  stubVisibility(root);
  return {
    root,
    composer: root.querySelector<HTMLInputElement>('input')!,
    settingsTrigger: root.querySelector<HTMLButtonElement>('[data-sn-action="settings"]')!,
    bottomNav: root.querySelector<HTMLElement>('[data-sn-nav="bottom"]')!,
  };
}

/** Mirrors what the shell does: only the active panel stays visible. */
function showPanel(root: HTMLElement, section: string) {
  root.querySelectorAll<HTMLElement>('[data-sn-panel]').forEach((panel) => {
    panel.toggleAttribute('hidden', panel.dataset['snPanel'] !== section);
  });
  stubVisibility(root);
}

/**
 * The hook tracks focus through `focusin`; jsdom does not dispatch it for
 * `.focus()`, so the tests replay the browser event explicitly.
 */
function trackedFocus(element: HTMLElement) {
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

/**
 * jsdom has no native `<dialog>`: a focused element outside the shell is the
 * closest proxy for a modal that took focus over. Focus is recorded through
 * `focusin` exactly like a browser would, with no extra render between the
 * dialog taking focus and the section change it triggers.
 */
function focusOutside(element: HTMLElement) {
  element.focus();
  trackedFocus(element);
}

type Section = 'rooms' | 'chat' | 'settings';
type Mode = 'compact' | 'wide';

function useHarness(ref: RefObject<HTMLDivElement | null>, mode: Mode, section: Section, room: string | null) {
  usePanelFocus(ref, section, mode, room);
}

describe('findPanelFocusTarget', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = installShell();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the opened panel', () => {
    const { root } = harness;

    expect(findPanelFocusTarget(root, 'rooms', null)?.textContent).toBe('SewerNet');
    showPanel(root, 'settings');
    expect(findPanelFocusTarget(root, 'settings', '!a:hs')?.textContent).toBe('Settings');
  });

  it('returns to selected room or heading', () => {
    const { root } = harness;

    expect(findPanelFocusTarget(root, 'rooms', '!a:hs')?.dataset['roomId']).toBe('!a:hs');
    expect(findPanelFocusTarget(root, 'rooms', '!gone:hs')?.dataset['snFocus']).toBe('rooms');
    expect(findPanelFocusTarget(root, 'rooms', '!missing:hs')?.tabIndex).toBe(-1);
  });

  it('handles special room IDs', () => {
    const target = findPanelFocusTarget(harness.root, 'rooms', '!a.b[room]:hs');

    expect(target?.dataset['roomId']).toBe('!a.b[room]:hs');
    expect(target?.tagName).toBe('BUTTON');
  });

  it('ignores a hidden panel', () => {
    showPanel(harness.root, 'rooms');

    expect(findPanelFocusTarget(harness.root, 'chat', '!a:hs')).toBeNull();
    showPanel(harness.root, 'chat');
    expect(findPanelFocusTarget(harness.root, 'chat', '!a:hs')?.dataset['snFocus']).toBe('chat');
  });
});

describe('usePanelFocus', () => {
  let harness: Harness;
  let ref: RefObject<HTMLDivElement | null>;

  beforeEach(() => {
    harness = installShell();
    ref = createRef<HTMLDivElement>();
    ref.current = harness.root;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function renderFocus(initial: { mode: Mode; section: Section; room: string | null }) {
    return renderHook((props: typeof initial) => useHarness(ref, props.mode, props.section, props.room), {
      initialProps: initial,
    });
  }

  it('focuses the compact rooms heading on mount', () => {
    renderFocus({ mode: 'compact', section: 'rooms', room: null });

    expect(document.activeElement?.getAttribute('data-sn-focus')).toBe('rooms');
  });

  it('does not steal focus on wide mount', () => {
    renderFocus({ mode: 'wide', section: 'rooms', room: null });

    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus on an intentional section change', () => {
    const { rerender } = renderFocus({ mode: 'compact', section: 'rooms', room: null });

    showPanel(harness.root, 'chat');
    rerender({ mode: 'compact', section: 'chat', room: '!a:hs' });
    expect(document.activeElement?.getAttribute('data-sn-focus')).toBe('chat');

    showPanel(harness.root, 'settings');
    rerender({ mode: 'compact', section: 'settings', room: '!a:hs' });
    expect(document.activeElement?.getAttribute('data-sn-focus')).toBe('settings');

    showPanel(harness.root, 'rooms');
    rerender({ mode: 'compact', section: 'rooms', room: '!a:hs' });
    expect((document.activeElement as HTMLElement | null)?.dataset['roomId']).toBe('!a:hs');
  });

  it('keeps focus in the visible composer', () => {
    showPanel(harness.root, 'chat');
    const { rerender } = renderFocus({ mode: 'compact', section: 'chat', room: '!a:hs' });
    harness.composer.focus();

    rerender({ mode: 'wide', section: 'chat', room: '!a:hs' });

    expect(document.activeElement).toBe(harness.composer);
  });

  it('repairs focus after the view is replaced', () => {
    showPanel(harness.root, 'chat');
    const { rerender } = renderFocus({ mode: 'compact', section: 'chat', room: '!a:hs' });
    harness.composer.focus();
    trackedFocus(harness.composer);

    detach(harness.root.querySelector('form')!);
    rerender({ mode: 'wide', section: 'chat', room: '!a:hs' });

    expect(document.activeElement?.getAttribute('data-sn-focus')).toBe('chat');
  });

  it('repairs focus when the last control becomes hidden', () => {
    const { rerender } = renderFocus({ mode: 'compact', section: 'rooms', room: null });
    harness.settingsTrigger.focus();
    trackedFocus(harness.settingsTrigger);

    harness.bottomNav.setAttribute('hidden', '');
    stubVisibility(harness.root);
    rerender({ mode: 'compact', section: 'rooms', room: null });

    expect(document.activeElement?.getAttribute('data-sn-focus')).toBe('rooms');
  });

  it('does not override dialog return', () => {
    // The native dialog is modal: it owns focus even when the shell behind it
    // changes section, so the shell must never pull focus back. The dialog sits
    // outside the shell root, which is the only reliable proxy jsdom offers.
    const dialogButton = document.createElement('button');
    dialogButton.textContent = 'Close';
    document.body.append(dialogButton);
    const { rerender } = renderFocus({ mode: 'wide', section: 'chat', room: '!a:hs' });
    harness.settingsTrigger.focus();
    trackedFocus(harness.settingsTrigger);

    showPanel(harness.root, 'rooms');
    // A control outside the shell (a modal dialog button) takes focus over.
    dialogButton.focus();
    rerender({ mode: 'wide', section: 'rooms', room: '!a:hs' });

    expect(document.activeElement).toBe(dialogButton);
  });

  it('leaves focus alone when it is outside the shell', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.append(outside);
    const { rerender } = renderFocus({ mode: 'compact', section: 'rooms', room: null });
    outside.focus();

    rerender({ mode: 'wide', section: 'rooms', room: null });

    expect(document.activeElement).toBe(outside);
  });

  it('does not steal focus from a control that stays visible', () => {
    showPanel(harness.root, 'chat');
    const { rerender } = renderFocus({ mode: 'compact', section: 'chat', room: '!a:hs' });
    harness.composer.focus();
    trackedFocus(harness.composer);

    rerender({ mode: 'wide', section: 'chat', room: '!a:hs' });

    expect(document.activeElement).toBe(harness.composer);
  });

  it('returns focus to the opener when the section closes', () => {
    const { rerender } = renderFocus({ mode: 'compact', section: 'rooms', room: null });
    // The navigation button that opens settings.
    harness.settingsTrigger.focus();
    trackedFocus(harness.settingsTrigger);

    showPanel(harness.root, 'settings');
    rerender({ mode: 'compact', section: 'settings', room: null });
    // Opening the section moves focus to its heading, exactly like the shell.
    harness.root.querySelector<HTMLElement>('[data-sn-focus="settings"]')!.focus();
    trackedFocus(harness.root.querySelector<HTMLElement>('[data-sn-focus="settings"]')!);
    expect(document.activeElement?.getAttribute('data-sn-focus')).toBe('settings');

    // The user closes the section from inside it. The navigation button is
    // hidden by then, so the browser can not restore it on its own.
    showPanel(harness.root, 'rooms');
    rerender({ mode: 'compact', section: 'rooms', room: null });

    expect(document.activeElement).toBe(harness.settingsTrigger);
  });
});
