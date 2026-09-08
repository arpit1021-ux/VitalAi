import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Lint rules for the server.
 *
 * Deliberately narrow. TypeScript already covers most of what a linter would
 * catch here, so these are the rules that encode decisions made during the
 * hardening work — the ones a future change could quietly undo.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      // Every log line is structured JSON with a correlation id. A stray
      // console.log bypasses redaction and can put health data in a log sink.
      'no-console': 'error',

      // Unused values are usually a half-finished edit.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // `any` is permitted where Mongoose's generics force it, but it should
      // be a visible decision rather than a default.
      '@typescript-eslint/no-explicit-any': 'warn',

      // `require-await` is deliberately absent. An async method that
      // implements an async interface — every method on MemoryStore, for
      // instance — is correctly async whether or not its body awaits, and the
      // rule cannot tell the difference. TypeScript already enforces the
      // signature, so the rule only produces noise here.
      'no-return-await': 'off',

      'eqeqeq': ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Scripts are operator tools run from a terminal, where writing to stdout
    // is the point.
    files: ['src/scripts/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
);
