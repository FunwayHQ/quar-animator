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
    'tsup.config.ts',
    '*.config.js',
    '*.config.cjs',
    'storybook-static',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/test/setup.ts',
    // Scripts that make the promo video, not part of the app
    'marketing',
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
      // 'detect' looks for React from the root, which has none
      version: '18.3',
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
    // With noUncheckedIndexedAccess, `xs[i]!` is how an index known to be in
    // range is read: those are fine. Any other `!` (a map lookup, a find, a
    // ref) should be narrowed instead.
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-restricted-syntax': [
      'warn',
      {
        selector:
          "TSNonNullExpression:not([expression.type='MemberExpression'][expression.computed=true])",
        message:
          'Narrow this (a check, ?? or a guard) rather than asserting it with `!`. Only index reads (xs[i]!) may assert.',
      },
    ],
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
        'no-restricted-syntax': 'off',
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
        'apps/web/src/components/common/ColorPicker.tsx',
        'apps/web/src/components/common/GradientEditor.tsx',
        'apps/web/src/components/layout/Canvas.tsx',
        'apps/web/src/components/layout/Toolbar.tsx',
        'apps/web/src/components/layout/LayerPanel.tsx',
        'apps/web/src/components/layout/PropertiesPanel.tsx',
        'apps/web/src/components/layout/Timeline.tsx',
        'apps/web/src/services/projectSerializer.ts',
        'packages/animation/src/**/*.ts',
        'packages/core/src/rendering/ShapeRenderer.ts',
        'packages/core/src/selection/SelectionManager.ts',
        'packages/core/src/SceneGraph.ts',
        'packages/core/src/tools/BoneTool.ts',
        'packages/core/src/tools/BrushTool.ts',
        'packages/core/src/tools/WeightPaintTool.ts',
        'packages/core/src/tools/SelectionTool.ts',
        'packages/rigging/src/**/*.ts',
        'packages/export/src/**/*.ts',
        'apps/web/src/components/common/ExportDialog.tsx',
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
