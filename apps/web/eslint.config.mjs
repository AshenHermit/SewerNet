import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    ignores: ['**/dist', '**/out-tsc', '**/dist-types'],
  },
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
