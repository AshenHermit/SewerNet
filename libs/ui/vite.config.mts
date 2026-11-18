import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * Relative path (from this root) of the stylesheet that must reach tests as
 * raw text: it is the single source of the wide breakpoint.
 *
 * `apps/web` declares the same plugin — keep the two copies in step.
 */
const RAW_CSS_FILE = 'src/layout-tokens.css';

/**
 * Makes `?raw` stylesheet imports work under Vitest.
 *
 * Vitest injects a `pre` plugin (`vitest:css-disable`) that replaces every
 * `.css` import — its regex matches `?raw` suffixes too — with an empty string,
 * and its `pre` plugins run before user ones. Pair this plugin with
 * `test.css.include` for {@link RAW_CSS_FILE}: that stops Vitest blanking the
 * file, and the `transform` here hands the source back verbatim so no CSS
 * pipeline rewrite or `__vite__updateStyle` injection happens.
 */
function rawCssPlugin(file: string = RAW_CSS_FILE): Plugin {
  return {
    name: 'sn-raw-css',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith(`/${file}`)) return null;
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

/** `test.css.include` value matching only {@link RAW_CSS_FILE}. */
function rawCssInclude(file: string = RAW_CSS_FILE): RegExp {
  return new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/ui',
  plugins: [rawCssPlugin(), react()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  test: {
    name: 'ui',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Keep `?raw` layout tokens intact instead of letting Vitest blank CSS.
    css: { include: [rawCssInclude()] },
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
