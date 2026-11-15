import { resolveMode, themeToCssVars, type ThemeSettings } from './theme-settings.js';

/**
 * Applies theme settings to a DOM element (document root by default):
 * - `data-theme` drives surface colors in CSS
 * - CSS custom properties drive accent, font and radius
 */
export function applyTheme(
  settings: ThemeSettings,
  target: HTMLElement | null = typeof document === 'undefined'
    ? null
    : document.documentElement,
): void {
  if (!target) return;

  target.dataset['theme'] = resolveMode(settings.mode);
  const vars = themeToCssVars(settings);
  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value);
  }
}
