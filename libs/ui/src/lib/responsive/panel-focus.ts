import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { ChatSection } from '../ui-kit';
import type { LayoutMode } from './layout-mode';

/**
 * Focus contract of the adaptive chat shell.
 *
 * The shell keeps every panel mounted and only flips `hidden`, so DOM order and
 * React identity survive navigation and resizes. Focus, however, is not
 * preserved by `hidden`: a control that starts inside a hidden panel — or a
 * kit view replaced by the other layout variant — silently loses focus to
 * `<body>`. This module restores a predictable reading position:
 *
 * - an intentional section change always moves focus to the new panel,
 * - a resize only repairs focus when the previously focused element is gone,
 * - a visible, still-connected control (the composer) is never stolen,
 * - focus outside the shell belongs to the browser (native dialog, address
 *   bar), so it is left alone.
 */

/** Attributes the kits expose for focus, so no component structure is assumed. */
const PANEL_FOCUS = 'data-sn-focus';
const ROOM_ID = 'data-room-id';

function isRoomElement(element: HTMLElement): element is HTMLElement & { dataset: DOMStringMap } {
  return element instanceof HTMLElement;
}

/** `checkVisibility` is the only visibility source; `hidden` ancestors are its fallback. */
function isVisible(element: HTMLElement | null): boolean {
  if (!element || !element.isConnected) return false;
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  }
  return element.closest('[hidden]') === null;
}

/**
 * Resolves the element that should receive focus when `section` becomes
 * visible: the selected room, otherwise the panel heading itself.
 *
 * Room IDs are Matrix identifiers (`!a.b[room]:hs`) and must never be
 * interpolated into a CSS selector — they are matched by dataset comparison.
 */
export function findPanelFocusTarget(
  root: HTMLElement,
  section: ChatSection,
  activeRoomId: string | null,
): HTMLElement | null {
  const panel = root.querySelector<HTMLElement>(`[data-sn-panel="${section}"]`);
  if (!panel || !isVisible(panel)) return null;

  if (section === 'rooms' && activeRoomId) {
    const rooms = panel.querySelectorAll<HTMLElement>(`[${ROOM_ID}]`);
    for (const room of rooms) {
      if (isRoomElement(room) && room.dataset['roomId'] === activeRoomId && isVisible(room)) {
        return room;
      }
    }
  }

  const heading = panel.querySelector<HTMLElement>(`[${PANEL_FOCUS}="${section}"]`);
  return isVisible(heading) ? heading : null;
}

/**
 * Keeps keyboard focus in a place that still exists after a section change or
 * a layout-mode swap. Mutates nothing but focus — never store state, so a
 * resize can not resend a message, re-upload a file or reset a draft.
 */
export function usePanelFocus(
  rootRef: RefObject<HTMLDivElement | null>,
  section: ChatSection,
  mode: LayoutMode,
  activeRoomId: string | null,
): void {
  const previousSection = useRef<ChatSection | null>(null);
  const trackedFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      trackedFocus.current = target instanceof HTMLElement ? target : null;
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const active = document.activeElement;
    const focusInside = active instanceof HTMLElement && root.contains(active);
    const previous = previousSection.current;
    const sectionChanged = previous !== null && previous !== section;
    previousSection.current = section;

    // A first compact mount starts at the top of the visible panel; a wide
    // mount leaves focus to the browser so the page does not steal it.
    const firstMount = previous === null;
    if (firstMount) {
      if (mode !== 'compact') return;
      findPanelFocusTarget(root, section, activeRoomId)?.focus();
      return;
    }

    // Focus outside the shell belongs to the browser or to a native dialog,
    // which restores its own trigger on close. Even an intentional section
    // change must not pull it back while the dialog is open.
    if (!focusInside && active !== null && active !== document.body && active.isConnected) return;

    // Mutations happen during the passive effect, so a detached
    // `document.activeElement` is detected reliably.
    if (active === null || active === document.body || !active.isConnected || sectionChanged) {
      findPanelFocusTarget(root, section, activeRoomId)?.focus();
      return;
    }
    // A resize only repairs focus the previous mode took away; visible
    // controls inside the shell (the composer) keep it.
    if (isVisible(active as HTMLElement)) return;

    findPanelFocusTarget(root, section, activeRoomId)?.focus();
  });
}
