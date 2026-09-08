import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Lint rules for the client.
 *
 * The hooks rules matter most here: a missing dependency in a query or effect
 * is how a screen ends up showing stale data without anyone noticing.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Browser storage is unreliable in the contexts this app runs in, and
      // anything durable belongs on the server.
      'no-restricted-globals': ['error', { name: 'event', message: 'Use the handler argument.' }],

      'eqeqeq': ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
);
