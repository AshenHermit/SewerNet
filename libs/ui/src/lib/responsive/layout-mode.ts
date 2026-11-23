import { useSyncExternalStore } from 'react';
import { WIDE_BREAKPOINT, readToken } from './read-token';

/** Layout mode of the current viewport. Compact below the shared breakpoint, wide at or above it. */
export type LayoutMode = 'compact' | 'wide';

const BREAKPOINT_TOKEN = '--breakpoint-sn-wide';

/**
 * Derives the wide media query from the shared layout tokens stylesheet,
 * so CSS and the variant switch can never drift apart.
 */
export function readWideMediaQuery(cssText: string): string {
  return `(min-width: ${readToken(cssText, BREAKPOINT_TOKEN)})`;
}

/** The single wide media query used by the adaptive slot mechanism. */
export const WIDE_MEDIA_QUERY = `(min-width: ${WIDE_BREAKPOINT})`;

let mediaQueryList: MediaQueryList | null = null;
let mediaQueryListQuery: string | null = null;
let mediaQueryListSource: typeof window.matchMedia | null = null;

/**
 * Cached `MediaQueryList` for the wide query. The cache is keyed by both the
 * query text and the `matchMedia` implementation, so a swapped or re-created
 * `matchMedia` (hot reload, test doubles) never leaves a stale listener list
 * behind. Callers re-read `.matches` because the cached list itself is live.
 */
function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  const matchMedia = window.matchMedia;
  if (!mediaQueryList || mediaQueryListQuery !== WIDE_MEDIA_QUERY || mediaQueryListSource !== matchMedia) {
    mediaQueryList = matchMedia.call(window, WIDE_MEDIA_QUERY);
    mediaQueryListQuery = WIDE_MEDIA_QUERY;
    mediaQueryListSource = matchMedia;
  }
  return mediaQueryList;
}

/** Deterministic server snapshot: SSR renders the wide layout. */
export function getServerLayoutModeSnapshot(): LayoutMode {
  return 'wide';
}

function getLayoutModeSnapshot(): LayoutMode {
  const list = getMediaQueryList();
  if (!list) return getServerLayoutModeSnapshot();
  return list.matches ? 'wide' : 'compact';
}

function subscribeLayoutMode(onChange: () => void): () => void {
  const list = getMediaQueryList();
  if (!list) return () => undefined;
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** Internal hook: current layout mode, re-rendering on breakpoint changes. */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(
    subscribeLayoutMode,
    getLayoutModeSnapshot,
    getServerLayoutModeSnapshot,
  );
}
