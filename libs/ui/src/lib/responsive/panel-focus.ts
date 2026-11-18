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

/** A control that lives in one of the section panels (never the navigation). */
function insidePanel(element: Element | null): boolean {
  if (element === null) return false;
  const panel = element.closest('[data-sn-panel]');
  return panel !== null && panel.closest('[data-sn-nav]') === null;
}

/** Whether the browser would focus the opener by itself: it is under the cursor. */
function covers(opener: HTMLElement, hit: Element | null): boolean {
  return hit !== null && (hit === opener || opener.contains(hit));
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
  /**
   * Last control that was focused outside the section panels — a navigation
   * button, a control of the previous section. Focus handlers run before React
   * commits, so this survives the heading the shell focuses when a section
   * opens, which makes it the only reliable source of the opener.
   */
  const outsideFocus = useRef<HTMLElement | null>(null);
  /**
   * Control that opened the current section. Section panels are always mounted,
   * so the opener stays connected while hidden — that is why the browser drops
   * focus to `<body>` instead of restoring it.
   */
  const returnFocus = useRef<HTMLElement | null>(null);
  /** Section focus had to be restored to, still waiting for a focus target. */
  const pendingSection = useRef<ChatSection | null>(null);
  /** Last pointer position; the browser may focus what lands under it. */
  const pointer = useRef({ x: 0, y: 0 });
  /** First mount: wide layouts leave focus alone, compact ones seat it. */
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const onPointer = (event: Event) => {
      // Only the last cursor position matters. `MouseEvent` covers browsers
      // without pointer events (and test environments that dispatch a bare
      // `PointerEvent`), where `clientX` is the only useful reading.
      const { clientX, clientY } = event as MouseEvent;
      pointer.current = {
        x: Number.isFinite(clientX) ? clientX : 0,
        y: Number.isFinite(clientY) ? clientY : 0,
      };
    };
    if (root) root.addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      if (root) root.removeEventListener('pointermove', onPointer);
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const record = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement) || insidePanel(target)) return;
      outsideFocus.current = target;
    };
    const onFocusIn = (event: FocusEvent) => record(event.target);
    root.addEventListener('focusin', onFocusIn);
    // The navigation buttons live next to the panels, so focus inside the root
    // reaches the root listener; only controls outside the root reach the
    // document one, which must not double-record the same event.
    const onDocumentFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && root.contains(target)) return;
      record(target);
    };
    document.addEventListener('focusin', onDocumentFocusIn);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusin', onDocumentFocusIn);
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const active = document.activeElement;
    const focusInside = active instanceof HTMLElement && root.contains(active);
    const previous = previousSection.current;
    const sectionChanged = previous !== null && previous !== section;
    const firstMount = !mounted.current;
    previousSection.current = section;
    mounted.current = true;

    // Remember the control that led out of the previous section, so closing the
    // new one can hand focus back to it. The heading the shell focuses when a
    // section opens is never the opener: `outsideFocus` only records controls
    // outside the panels, and a control of the leaving panel is about to be
    // hidden by the same commit.
    if (sectionChanged) {
      const candidate = outsideFocus.current;
      returnFocus.current =
        candidate !== null && candidate.isConnected && !insidePanel(candidate) ? candidate : null;
      pendingSection.current = section;
    }

    // A first compact mount starts at the top of the visible panel; a wide
    // mount leaves focus to the browser so the page does not steal it.
    if (firstMount) {
      if (mode === 'compact') findPanelFocusTarget(root, section, activeRoomId)?.focus();
      return;
    }

    /** Focus the commit took away: it was in a panel this commit hid. */
    const previousPanel = previous === null ? null : root.querySelector<HTMLElement>(`[data-sn-panel="${previous}"]`);
    const stranded = previousPanel !== null && !isVisible(previousPanel);
    const hit =
      typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(pointer.current.x, pointer.current.y)
        : null;

    // Focus outside the shell belongs to the browser or to a native dialog,
    // which restores its own trigger on close. Even an intentional section
    // change must not pull it back while the dialog is open. The record is
    // checked as well, because a modal can take focus in the same commit that
    // changes the section, before the hook sees a `focusin` for it.
    if (!focusInside && active !== null && active !== document.body && active.isConnected) return;
    const recorded = outsideFocus.current;
    if (recorded !== null && !root.contains(recorded) && !focusInside && isVisible(recorded)) return;

    // A section switch that started inside the leaving panel restores focus
    // instead of sending it to the new panel. The last control touched outside
    // the panels is where the user came from, and its `aria-current` state
    // names the section now on screen, so focus lands there — both when a
    // navigation button opens a section and when the section closes back to
    // the one that holds that control. Clicking focuses these in browsers; the
    // shell makes that deterministic for keyboard users too.
    if (stranded) {
      const pressed = outsideFocus.current;
      if (pressed !== null && pressed.isConnected && !insidePanel(pressed) && !covers(pressed, hit)) {
        pendingSection.current = null;
        returnFocus.current = null;
        pressed.focus();
        return;
      }
      const opener = returnFocus.current;
      if (opener !== null && opener.isConnected && !covers(opener, hit)) {
        pendingSection.current = null;
        returnFocus.current = null;
        opener.focus();
        return;
      }
    }

    // Section focus is still owed. Compact panels mount their focus target with
    // the content, so the first effect pass may find nothing; retry on the next
    // commit until the panel has a heading to land on.
    if (pendingSection.current !== null) {
      const target = findPanelFocusTarget(root, pendingSection.current, activeRoomId);
      if (target !== null) {
        pendingSection.current = null;
        target.focus();
        return;
      }
    }

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
