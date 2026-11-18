import { Fragment } from 'react';
import type { AdaptiveSlotProps } from '../../ui-kit';
import { useLayoutMode } from '../../responsive/layout-mode';

/**
 * Mounts exactly one presentation for the current layout mode.
 *
 * - `undefined` means "no variant for this mode": the fallback renders.
 * - `null` is an intentional "render nothing" variant and is honoured.
 * - The active variant is keyed by mode, so crossing the breakpoint remounts
 *   it instead of reusing state from the other layout.
 */
export function ShadcnAdaptiveSlot({ fallback, compact, wide }: AdaptiveSlotProps) {
  const mode = useLayoutMode();
  const variant = mode === 'compact' ? compact : wide;
  const content = variant === undefined ? fallback : variant;

  return <Fragment key={mode}>{content}</Fragment>;
}
