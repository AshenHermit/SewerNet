export type ThemeMode = 'light' | 'dark' | 'system';

export type FontId = 'inter' | 'system' | 'serif' | 'mono';

/**
 * User-configurable appearance. Stored locally (per device) for now,
 * later synced through Matrix account data.
 */
export interface ThemeSettings {
  /** Id of the UI kit (component library) to render proxy components with. */
  kitId: string;
  mode: ThemeMode;
  /** Accent color in hex, e.g. #22c55e. */
  accent: string;
  font: FontId;
  /** Corner radius in pixels. */
  radius: number;
}

export const FONT_STACKS: Record<FontId, string> = {
  inter: "'Inter', 'Segoe UI', system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Cascadia Code', ui-monospace, monospace",
};

export const FONT_LABELS: Record<FontId, string> = {
  inter: 'Inter',
  system: 'System',
  serif: 'Serif',
  mono: 'Mono',
};

export interface AccentPreset {
  id: string;
  label: string;
  value: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'sewer', label: 'Sewer Green', value: '#22c55e' },
  { id: 'matrix', label: 'Matrix Blue', value: '#3b82f6' },
  { id: 'plum', label: 'Plum', value: '#a855f7' },
  { id: 'rust', label: 'Rust', value: '#f97316' },
  { id: 'rose', label: 'Rose', value: '#f43f5e' },
];

export const DEFAULT_THEME: ThemeSettings = {
  kitId: 'shadcn',
  mode: 'dark',
  accent: '#22c55e',
  font: 'inter',
  radius: 10,
};

/** Converts a hex color to a readable foreground color (black or white). */
export function accentContrast(hex: string): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  // Relative luminance approximation (sRGB).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0a0a0a' : '#ffffff';
}

export function resolveMode(
  mode: ThemeMode,
  prefersDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true,
): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

/** CSS custom properties consumed by proxy components and app styles. */
export function themeToCssVars(
  settings: ThemeSettings,
): Record<string, string> {
  return {
    '--sn-accent': settings.accent,
    '--sn-accent-contrast': accentContrast(settings.accent),
    '--sn-font-sans': FONT_STACKS[settings.font],
    '--sn-radius': `${settings.radius}px`,
  };
}
