import { getMatrixClient, hasActiveClient } from '../client/init-matrix';
import { mxcUrlToHttp } from './mxc-url';
import type { MediaSource } from '../platform/contracts';

/**
 * Resolves a room/user avatar `mxc://` URI for rendering in the UI.
 * Returns `undefined` when no authenticated client exists (e.g. before sync
 * or in tests), so kits fall back to the generic room icon.
 */
export function roomAvatarSource(mxcUrl: string | undefined, size = 48): MediaSource | null {
  if (!mxcUrl) return null;
  return { mxc: mxcUrl, size };
}

export function roomAvatarUrl(
  mxcUrl: string | undefined,
  size = 48,
): string | undefined {
  if (!mxcUrl || !hasActiveClient()) {
    return undefined;
  }
  try {
    return mxcUrlToHttp(getMatrixClient(), mxcUrl, size, size, true) ?? undefined;
  } catch {
    return undefined;
  }
}
