import { i18n } from '@lingui/core';

export const SUPPORTED_LOCALES = {
  en: 'English',
  ru: 'Русский',
} as const;

export type AppLocale = keyof typeof SUPPORTED_LOCALES;

const LOCALE_STORAGE_KEY = 'sewernet:locale';

export function isAppLocale(value: string): value is AppLocale {
  return value in SUPPORTED_LOCALES;
}

export function detectLocale(): AppLocale {
  const saved =
    typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(LOCALE_STORAGE_KEY);

  if (saved && isAppLocale(saved)) {
    return saved;
  }

  const browser = navigator.language.slice(0, 2);
  return isAppLocale(browser) ? browser : 'en';
}

/**
 * Loads and activates a locale. The `.po` catalogs are compiled on the fly
 * by the Lingui Vite plugin (see vite.config.mts), so no separate compile
 * step is needed — only `nx run web:extract-i18n` after adding new strings.
 */
export async function activateLocale(locale: AppLocale): Promise<void> {
  const { messages } = await import(`./locales/${locale}.po`);
  i18n.loadAndActivate({ locale, messages });
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
