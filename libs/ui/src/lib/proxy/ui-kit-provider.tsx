import { createContext, useContext, type ReactNode } from 'react';
import { useThemeStore } from '@sewer-net/themes';
import { DEFAULT_UI_KIT, UI_KITS } from '../kits/index';
import type { UiKit } from '../ui-kit';

const UiKitContext = createContext<UiKit>(DEFAULT_UI_KIT);

export interface UiKitProviderProps {
  /** Overrides the kit selected in theme settings (useful for Storybook/tests). */
  kitId?: string;
  children: ReactNode;
}

/** Resolves the active UI kit and exposes it to proxy components. */
export function UiKitProvider({ kitId, children }: UiKitProviderProps) {
  const selectedKitId = useThemeStore((state) => state.settings.kitId);
  const kit = UI_KITS[kitId ?? selectedKitId] ?? DEFAULT_UI_KIT;

  return <UiKitContext.Provider value={kit}>{children}</UiKitContext.Provider>;
}

export function useUiKit(): UiKit {
  return useContext(UiKitContext);
}

