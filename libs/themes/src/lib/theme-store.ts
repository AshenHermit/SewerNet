import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_THEME,
  type FontId,
  type ThemeMode,
  type ThemeSettings,
} from './theme-settings.js';

interface ThemeState {
  settings: ThemeSettings;
  setKit: (kitId: string) => void;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: string) => void;
  setFont: (font: FontId) => void;
  setRadius: (radius: number) => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      settings: DEFAULT_THEME,
      setKit: (kitId) =>
        set((state) => ({ settings: { ...state.settings, kitId } })),
      setMode: (mode) =>
        set((state) => ({ settings: { ...state.settings, mode } })),
      setAccent: (accent) =>
        set((state) => ({ settings: { ...state.settings, accent } })),
      setFont: (font) =>
        set((state) => ({ settings: { ...state.settings, font } })),
      setRadius: (radius) =>
        set((state) => ({ settings: { ...state.settings, radius } })),
      reset: () => set({ settings: DEFAULT_THEME }),
    }),
    { name: 'sewernet:theme', version: 1 },
  ),
);
