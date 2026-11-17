import { type AppLocale } from '@sewer-net/types';
export declare function isAppLocale(value: string): value is AppLocale;
export declare function detectLocale(): AppLocale;
/**
 * Loads and activates a locale. The `.po` catalogs are compiled on the fly
 * by the Lingui Vite plugin (see vite.config.mts), so no separate compile
 * step is needed — only `nx run web:extract-i18n` after adding new strings.
 */
export declare function activateLocale(locale: AppLocale): Promise<void>;
//# sourceMappingURL=i18n.d.ts.map