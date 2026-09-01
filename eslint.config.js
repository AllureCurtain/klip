import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src-tauri/**',
      '.claude/**',
      '.worktrees/**',
      'e2e/.tmp/**',
      // Local scratch dir for one-off verification scripts (git-ignored).
      '.temp/**',
      'coverage/**',
      'outputs/**',
      '软件著作权申请资料/**',
      '软著补正重做/**',
      'web-klip/**',
      // Vendored design-tool working files (GSAP examples, detect.mjs). Not
      // app code, not part of the build; linting them as app sources fails.
      'finesse-ui/**',
      '*.tsbuildinfo',
      'vite.config.js',
      'vite.config.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
  }
);
