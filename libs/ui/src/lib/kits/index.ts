import type { UiKit } from '../ui-kit.js';
import { shadcnKit } from './shadcn/index.js';

/**
 * Registry of available UI kits. New kits (e.g. the custom shadcn registry)
 * are added here and become selectable in the theme settings.
 */
export const UI_KITS: Record<string, UiKit> = {
  [shadcnKit.id]: shadcnKit,
};

export const DEFAULT_UI_KIT = shadcnKit;
