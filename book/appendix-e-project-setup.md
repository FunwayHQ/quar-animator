# Appendix E — Project Setup Checklist

This appendix provides a step-by-step checklist for recreating the project structure from scratch, covering the monorepo, TypeScript configuration, testing, linting, formatting, git hooks, and CI/CD.

## 1. Initialize the Monorepo

```bash
mkdir graphic-editor && cd graphic-editor
pnpm init
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

Create the package directories:

```bash
mkdir -p packages/types/src
mkdir -p packages/core/src
mkdir -p packages/animation/src
mkdir -p packages/rigging/src
mkdir -p packages/export/src
mkdir -p packages/ui/src
mkdir -p apps/web/src
```

Each package gets its own `package.json` with a scoped name:

```json
{
  "name": "@quar/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

Cross-package dependencies use the `workspace:*` protocol:

```json
{
  "dependencies": {
    "@quar/types": "workspace:*",
    "@quar/core": "workspace:*"
  }
}
```

## 2. TypeScript Configuration

Create a root `tsconfig.json` with strict mode:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

Each package extends the root config:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

The `composite: true` flag enables TypeScript project references for cross-package type checking.

## 3. Vite (Web Application)

Install in the web app:

```bash
cd apps/web
pnpm add -D vite @vitejs/plugin-react
pnpm add react react-dom
```

Create `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, open: true },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@quar/types': path.resolve(__dirname, '../../packages/types/src'),
      '@quar/core': path.resolve(__dirname, '../../packages/core/src'),
      '@quar/animation': path.resolve(__dirname, '../../packages/animation/src'),
      '@quar/rigging': path.resolve(__dirname, '../../packages/rigging/src'),
      '@quar/export': path.resolve(__dirname, '../../packages/export/src'),
    },
  },
});
```

The aliases point directly to source directories so Vite can transpile them with HMR — no separate build step needed during development.

## 4. Vitest (Testing)

Install at the root:

```bash
pnpm add -D vitest @vitest/coverage-v8 jsdom
```

Create `packages/core/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
    alias: {
      'opentype.js': path.resolve(__dirname, 'src/test/__mocks__/opentype.js.ts'),
    },
  },
});
```

The `opentype.js` alias redirects font library imports to a mock file in test environments. This is necessary because JSDOM has no GPU and opentype.js can't load real font files in Node.

Create `src/test/setup.ts`:

```typescript
import { vi } from 'vitest';

// Mock WebGL context for JSDOM
HTMLCanvasElement.prototype.getContext = vi.fn((contextType: string) => {
  if (contextType === 'webgl2' || contextType === 'webgl') {
    return createMockWebGL2Context();
  }
  return null;
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock pointer capture (not available in JSDOM)
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();

function createMockWebGL2Context(): Record<string, unknown> {
  return {
    canvas: document.createElement('canvas'),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    blendFuncSeparate: vi.fn(),
    scissor: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    activeTexture: vi.fn(),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteVertexArray: vi.fn(),
    createFramebuffer: vi.fn(() => ({})),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5), // FRAMEBUFFER_COMPLETE
    // WebGL constants
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403,
    TRIANGLES: 0x0004,
    TRIANGLE_STRIP: 0x0005,
    LINES: 0x0001,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    BLEND: 0x0be2,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    // ... additional constants as needed
  };
}
```

## 5. ESLint

Install:

```bash
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y \
  eslint-config-prettier
```

Create `.eslintrc.cjs`:

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'eslint-config-prettier',
  ],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
  },
  settings: {
    react: { version: 'detect' },
  },
};
```

## 6. Prettier

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "useTabs": false,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

## 7. Husky & lint-staged (Pre-commit Hooks)

Install:

```bash
pnpm add -D husky lint-staged
pnpm exec husky init
```

Create `.husky/pre-commit`:

```bash
npx lint-staged
```

Add to root `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,jsx,json,md,css}": ["prettier --write"]
  }
}
```

## 8. Root Package Scripts

Add to root `package.json`:

```json
{
  "scripts": {
    "dev": "pnpm --filter @quar/web dev",
    "build": "pnpm -r build",
    "lint": "eslint --ext .ts,.tsx .",
    "lint:fix": "eslint --ext .ts,.tsx . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --build",
    "test": "pnpm -r test",
    "clean": "pnpm -r exec rm -rf dist build node_modules",
    "prepare": "husky"
  }
}
```

## 9. CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm format:check

  build:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: |
            apps/web/dist
            packages/*/dist
          retention-days: 7

  test:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: |
            packages/*/coverage
            apps/*/coverage
          retention-days: 14
```

## 10. Key Dependencies

### Runtime

| Package          | Version | Purpose                               |
| ---------------- | ------- | ------------------------------------- |
| react            | 18.2+   | UI framework                          |
| react-dom        | 18.2+   | DOM rendering                         |
| zustand          | 4.4+    | State management                      |
| earcut           | 3.0+    | Polygon triangulation                 |
| opentype.js      | 1.3.4   | Font glyph parsing                    |
| polygon-clipping | 0.15+   | Boolean geometry operations           |
| jszip            | 3.10+   | ZIP compression (PNG sequence export) |
| lucide-react     | 0.563+  | Icon library                          |

### Development

| Package             | Version | Purpose                          |
| ------------------- | ------- | -------------------------------- |
| typescript          | 5.3+    | Type system                      |
| vite                | 5.0+    | Dev server and bundler           |
| vitest              | 4.0+    | Test runner                      |
| @vitest/coverage-v8 | 4.0+    | Code coverage                    |
| jsdom               | 28+     | Browser DOM simulation for tests |
| eslint              | 8.56+   | Code linting                     |
| prettier            | 3.2+    | Code formatting                  |
| husky               | 9.0+    | Git hooks                        |
| lint-staged         | 15.2+   | Staged file linting              |

## 11. Directory Structure

```
graphic-editor/
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── .husky/
│   └── pre-commit
├── .github/
│   └── workflows/
│       └── ci.yml
├── package.json              ← Root scripts, devDeps, lint-staged config
├── pnpm-workspace.yaml       ← Workspace package list
├── pnpm-lock.yaml
├── tsconfig.json              ← Base TypeScript config (strict mode)
├── packages/
│   ├── types/                 ← Shared type definitions (no runtime code)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── core/                  ← Rendering engine, scene graph, tools, math
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── math.ts
│   │       ├── rendering/     ← ShapeRenderer, Grid, EffectRenderer, shaders
│   │       ├── scene/         ← SceneGraph, node CRUD, traversal
│   │       ├── tools/         ← BaseTool, SelectionTool, PenTool, etc.
│   │       ├── selection/     ← SelectionManager, TransformHandles
│   │       ├── path/          ← bezier.ts, pathUtils.ts, outlineStroke.ts
│   │       ├── boolean/       ← booleanOps.ts
│   │       ├── font/          ← FontManager, glyphConverter, textMetrics
│   │       ├── svg/           ← svgParser, svgConverter, svgImporter, svgExporter
│   │       ├── symbols/       ← symbolResolver.ts
│   │       ├── format/        ← quarFormat.ts, quarMigration.ts
│   │       └── test/          ← setup.ts, __mocks__/opentype.js.ts
│   ├── animation/             ← Timeline, keyframes, easing, playback
│   ├── rigging/               ← Bones, IK, skinning, smart bones, physics
│   ├── export/                ← Lottie, PNG sequence, sprite sheet, bin packing
│   └── ui/                    ← Shared React components, Storybook
└── apps/
    └── web/                   ← React + Vite web application
        ├── package.json
        ├── tsconfig.json
        ├── vite.config.ts
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── stores/        ← editorStore.ts (Zustand)
            ├── hooks/         ← useCanvasTools, usePlayback, useShortcuts
            ├── components/
            │   ├── layout/    ← Canvas, PropertiesPanel, LayerPanel, etc.
            │   └── common/    ← ColorPicker, ContextMenu, Toast, etc.
            └── services/      ← exportService, projectSerializer
```

## 12. Critical Setup Notes

1. **Path aliases must be synced** in three places: `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`. A mismatch causes either IDE errors, build failures, or test failures.

2. **opentype.js requires a mock** in test environments. Browsers serve WOFF2 from Google Fonts, which opentype.js 1.3.4 cannot parse. The mock provides fake font metrics (`unitsPerEm: 1000`, `ascender: 800`) sufficient for layout tests.

3. **pnpm strict hoisting** means a package can only import dependencies listed in its own `package.json`. If `@quar/export` uses `jszip`, it must declare `jszip` in its own dependencies — the root `node_modules` won't be accessible.

4. **`composite: true` in tsconfig** enables incremental compilation and project references. Without it, `pnpm typecheck` (which runs `tsc --build`) cannot resolve cross-package types.

5. **Vitest globals** (`describe`, `it`, `expect`) are enabled via `globals: true` in the vitest config. Without this, every test file would need explicit imports.

6. **The `prepare` script** runs `husky` on `pnpm install`, which sets up the git hooks directory. If hooks don't fire after cloning, run `pnpm prepare` manually.
