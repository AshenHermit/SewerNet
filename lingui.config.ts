import { defineConfig } from '@lingui/cli';

export default defineConfig({
  locales: ['en', 'ru'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: '<rootDir>/apps/web/src/locales/{locale}',
      include: ['<rootDir>/apps/web/src'],
    },
  ],
});
