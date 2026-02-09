/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  ignorePatterns: [
    'dist',
    'build',
    'node_modules',
    '.eslintrc.cjs',
    'vite.config.ts',
    'vitest.config.ts',
    '*.config.js',
    '*.config.cjs',
    'storybook-static',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/test/setup.ts',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    // Use 'true' to automatically find the nearest tsconfig.json for each file
    // This handles new directories without explicit configuration
    project: true,
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // TypeScript
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // React
    'react/prop-types': 'off',
    'react/display-name': 'off',
    'react/no-unescaped-entities': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Accessibility
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
    {
      files: ['**/*.stories.tsx'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
      },
    },
    {
      // Files that import from workspace packages (@quar/types, @quar/core,
      // @quar/animation) - relax strict type checking until build system
      // generates declaration files for cross-package resolution.
      // Only files with actual workspace imports are listed here.
      files: [
        'apps/web/src/hooks/useToolShortcuts.ts',
        'apps/web/src/hooks/useCanvasTools.ts',
        'apps/web/src/hooks/usePlayback.ts',
        'apps/web/src/hooks/useProjectActions.ts',
        'apps/web/src/hooks/useKeyframeState.ts',
        'apps/web/src/stores/**/*.ts',
        'apps/web/src/contexts/**/*.tsx',
        'apps/web/src/components/canvas/**/*.tsx',
        'apps/web/src/components/layout/Canvas.tsx',
        'apps/web/src/components/layout/Toolbar.tsx',
        'apps/web/src/components/layout/LayerPanel.tsx',
        'apps/web/src/components/layout/PropertiesPanel.tsx',
        'apps/web/src/components/layout/Timeline.tsx',
        'apps/web/src/services/projectSerializer.ts',
        'packages/animation/src/**/*.ts',
        'packages/core/src/selection/SelectionManager.ts',
        'packages/core/src/SceneGraph.ts',
      ],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
};
