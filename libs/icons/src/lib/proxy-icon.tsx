import { createContext, useContext, type ReactNode } from 'react';
import { useThemeStore } from '@sewer-net/themes';
import {
  DEFAULT_ICON_SET,
  ICON_SETS,
  type IconProps,
} from './icon-sets.js';

const IconSetContext = createContext(DEFAULT_ICON_SET);

export interface IconSetProviderProps {
  /** Overrides the icon set selected by the theme (Storybook/tests). */
  iconSetId?: string;
  children: ReactNode;
}

export function IconSetProvider({ iconSetId, children }: IconSetProviderProps) {
  const kitId = useThemeStore((state) => state.settings.kitId);
  const iconSet = ICON_SETS[iconSetId ?? kitId] ?? DEFAULT_ICON_SET;

  return (
    <IconSetContext.Provider value={iconSet}>{children}</IconSetContext.Provider>
  );
}

/** Renders an icon from the active icon set. */
export function ProxyIcon({ name, size = 20, strokeWidth = 1.8, className }: IconProps) {
  const iconSet = useContext(IconSetContext);
  const Icon = iconSet[name] ?? DEFAULT_ICON_SET[name];

  return (
    <Icon
      aria-hidden="true"
      className={className}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}
