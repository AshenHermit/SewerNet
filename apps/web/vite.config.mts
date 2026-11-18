/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { lingui } from '@lingui/vite-plugin';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Absolute path of the stylesheet that must reach tests as raw text: it is the
 * single source of the wide breakpoint.
 *
 * `libs/ui` declares the same plugin for its own root — keep the two in step.
 */
const RAW_CSS_TARGET = join(import.meta.dirname, '../../libs/ui/src/layout-tokens.css').replace(
  /\\/g,
  '/',
);

/**
 * Makes `?raw` stylesheet imports work under Vitest.
 *
 * Vitest injects a `pre` plugin (`vitest:css-disable`) that replaces every
 * `.css` import — its regex matches `?raw` suffixes too — with an empty string,
 * and its `pre` plugins run before user ones. Pair this plugin with
 * `test.css.include` for {@link RAW_CSS_TARGET}: that stops Vitest blanking it,
 * and the `transform` here hands the source back verbatim, so no CSS pipeline
 * rewrite or `__vite__updateStyle` injection happens.
 */
function rawCssPlugin(): Plugin {
  return {
    name: 'sn-raw-css',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith(RAW_CSS_TARGET)) return null;
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

/** `test.css.include` value matching only {@link RAW_CSS_TARGET}. */
function rawCssInclude(): RegExp {
  return new RegExp(RAW_CSS_TARGET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: 4200,
    host: 'localhost',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [
    // Keep `?raw` layout tokens intact in tests.
    rawCssPlugin(),
    react(),
    lingui({ macroTransform: true }),
    tailwindcss(),
    nxReadySignal(),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    css: { include: [rawCssInclude()] },
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
