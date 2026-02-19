# Project Architecture & Monorepo Setup

## Structuring for Long-Term Success

A graphic editor is one of the most architecturally demanding applications you can build for the web. It combines real-time rendering, complex state management, low-level GPU programming, mathematical algorithms, and an interactive UI — all in one codebase. If you start with a flat directory of files and no plan, you will drown before you draw your first rectangle.

This chapter sets up the project structure that will carry us through 39 chapters and thousands of tests. We'll create a monorepo with strict package boundaries, configure TypeScript for maximum safety, set up a testing strategy that scales, and wire up code quality tools that catch problems before they reach the main branch.

None of this is glamorous. All of it is essential.

## Why a Monorepo

A graphic editor has natural subsystems. The math that evaluates Bezier curves doesn't care about React. The rendering engine that draws shapes doesn't need to import Zustand. The export pipeline that writes binary files doesn't know about the UI layer.

You could build all of this in one package, and many projects do. But as the codebase grows, two problems emerge:

**Accidental coupling.** A developer working on the export pipeline imports a React hook because it's convenient. Now the export package can't be tested without JSDOM. A month later, someone imports a WebGL utility into the type definitions package. Now your types depend on a browser runtime.

**Untestable architecture.** When everything lives in one package, it's hard to test a subsystem in isolation. You end up mocking half the application to test one function. Tests become slow, brittle, and nobody writes them.

A monorepo solves both problems. Each package has its own `package.json`, its own dependencies, and its own test suite. If a package doesn't list `react` in its dependencies, nobody in that package can import React. The package boundary is enforced by the module system itself, not by discipline.

For a graphic editor, the natural packages are:

| Package       | Responsibility                             | Dependencies      |
| ------------- | ------------------------------------------ | ----------------- |
| **types**     | Shared TypeScript interfaces               | None              |
| **core**      | Scene graph, rendering, tools, math, paths | types             |
| **animation** | Timeline, easing, keyframes, playback      | types, core       |
| **rigging**   | Bones, IK, skinning, weight painting       | types, core       |
| **export**    | PNG, SVG, Lottie, binary file format       | types, core       |
| **ui**        | Design system components                   | None (pure React) |
| **web**       | The application (React + all packages)     | Everything        |

Notice the dependency direction: it flows downward. `types` depends on nothing. `core` depends on `types`. `export` depends on `types` and `core`. The web application sits at the top and depends on everything. No package depends on the web application.

This isn't just organizational tidiness — it's a testability guarantee. When you run `cd packages/core && npx vitest run`, you're testing the core engine in isolation. No React, no browser, no application state. When those tests pass, you know the engine works.

## Setting Up pnpm Workspaces

We use pnpm for monorepo management. It's faster than npm, stricter about dependency hoisting (which prevents phantom dependencies), and has first-class workspace support.

Start with a root `package.json`:

```json
{
  "name": "graphic-editor",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @quar/web dev",
    "build": "pnpm -r build",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "clean": "pnpm -r clean && rimraf node_modules",
    "prepare": "husky"
  },
  "packageManager": "pnpm@8.14.0",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

The `pnpm -r` flag runs a command recursively across all workspace packages. `pnpm --filter @quar/web dev` runs the `dev` script only in the web application package.

Next, create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

This tells pnpm that every directory under `apps/` and `packages/` is a workspace package. pnpm will link them together so you can import `@quar/core` from `@quar/web` without publishing to npm.

## The Directory Tree

Create the initial directory structure:

```
graphic-editor/
├── apps/
│   └── web/              # React + Vite app
│       ├── src/
│       │   ├── components/
│       │   ├── stores/
│       │   ├── hooks/
│       │   ├── services/
│       │   ├── contexts/
│       │   ├── styles/
│       │   └── test/
│       ├── package.json
│       └── vite.config.ts
├── packages/
│   ├── types/            # Shared TS types
│   │   ├── src/index.ts
│   │   └── package.json
│   ├── core/             # Engine
│   │   ├── src/
│   │   │   ├── rendering/
│   │   │   ├── tools/
│   │   │   ├── path/
│   │   │   ├── selection/
│   │   │   ├── boolean/
│   │   │   ├── svg/
│   │   │   ├── font/
│   │   │   ├── format/
│   │   │   ├── symbols/
│   │   │   ├── gradient/
│   │   │   ├── Camera.ts
│   │   │   ├── SceneGraph.ts
│   │   │   ├── math.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── vitest.config.ts
│   ├── animation/        # Timeline, easing
│   │   └── ...
│   ├── rigging/          # Bones, IK, skinning
│   │   └── ...
│   ├── export/           # PNG, Lottie, binary
│   │   └── ...
│   └── ui/               # Design system
│       └── ...
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── .eslintrc.cjs
├── .prettierrc
└── .husky/pre-commit
```

You won't fill all these directories on day one. Most start empty and grow organically as we build each system. But the structure is in place, and the boundaries are clear.

## Package Configuration

Each package needs its own `package.json`. Here's the pattern.

**The types package** has zero dependencies. It's pure TypeScript interfaces:

```json
{
  "name": "@quar/types",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Notice there's no `build` script and no `test` script. This package contains only type definitions — there's nothing to compile and nothing to test at runtime.

**The core package** depends on types and has its own test suite:

```json
{
  "name": "@quar/core",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@quar/types": "workspace:*",
    "earcut": "^3.0.2"
  },
  "devDependencies": {
    "vitest": "^1.2.0"
  }
}
```

The `workspace:*` syntax tells pnpm to link to the local package rather than looking for it in the npm registry. The `earcut` dependency is a triangulation library we'll need for rendering — it's one of very few third-party runtime dependencies in the core engine.

**The export package** depends on types and core:

```json
{
  "name": "@quar/export",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@quar/types": "workspace:*",
    "@quar/core": "workspace:*"
  }
}
```

**The web application** depends on everything:

```json
{
  "name": "@quar/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "@quar/core": "workspace:*",
    "@quar/export": "workspace:*",
    "@quar/types": "workspace:*",
    "@quar/ui": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.7",
    "lucide-react": "^0.563.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@vitejs/plugin-react": "^4.2.1",
    "jsdom": "^28.0.0",
    "vite": "^5.0.11",
    "vitest": "^1.2.0"
  }
}
```

After creating all the `package.json` files, run `pnpm install` from the root. pnpm will install all dependencies, create symlinks between workspace packages, and generate the lockfile.

## TypeScript Configuration

TypeScript strict mode is non-negotiable for a graphic editor. The kinds of bugs that slip through loose TypeScript — passing `undefined` where a number is expected, accessing a property on a potentially null object, using an uninitialized variable — cause rendering artifacts, invisible shapes, and NaN values that propagate silently through matrix math until something explodes.

The root `tsconfig.json` sets the strictest possible configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@quar/types": ["packages/types/src"],
      "@quar/core": ["packages/core/src"],
      "@quar/ui": ["packages/ui/src"],
      "@quar/export": ["packages/export/src"]
    }
  },
  "references": [
    { "path": "packages/types" },
    { "path": "packages/core" },
    { "path": "packages/ui" },
    { "path": "packages/export" },
    { "path": "apps/web" }
  ]
}
```

A few settings worth discussing:

**`noUncheckedIndexedAccess`** is aggressive but worth it. It means `array[0]` has type `T | undefined`, not `T`. This catches a class of bugs where you access an array element that might not exist. In a graphic editor, you frequently index into vertex arrays, point arrays, and node lists. Off-by-one errors should be caught by the compiler, not by a user seeing a blank canvas.

**`paths`** mapping lets TypeScript resolve `@quar/core` to the local source directory during development. This means your IDE understands cross-package imports, provides autocomplete, and shows type errors — without needing to build the packages first.

**`references`** enables project references, which let TypeScript check packages incrementally. When you change a file in `@quar/types`, TypeScript only rechecks packages that depend on it.

Each package extends the root config:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"],
  "references": [{ "path": "../types" }]
}
```

The `references` array lists only the direct dependencies of this package. The core package references `types`. The export package references `types` and `core`. This creates an explicit dependency graph that TypeScript enforces.

## The Types Package

Before writing any logic, define the types that every package will share. This is `packages/types/src/index.ts` — the foundation that everything else builds on.

Start with the mathematical primitives:

```typescript
export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Then colors and visual properties:

```typescript
export interface Color {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface Fill {
  type: 'solid' | 'gradient' | 'none';
  color?: Color;
  gradient?: Gradient;
  opacity: number;
  visible: boolean;
}

export interface Stroke {
  color: Color;
  width: number;
  opacity: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  visible: boolean;
}
```

Then the transform type that every node will carry:

```typescript
export interface Transform {
  position: Vector2;
  rotation: number; // Degrees
  scale: Vector2;
  anchor: Vector2; // 0-1 normalized
  skew: Vector2;
}
```

And the node hierarchy — the most important types in the entire project:

```typescript
export type NodeType =
  | 'group'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'path'
  | 'text'
  | 'image'
  | 'artboard';

export interface BaseNode {
  id: string;
  name: string;
  type: NodeType;
  parent: string | null;
  children: string[];
  transform: Transform;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  effects?: Effect[];
}
```

Every visual object in the editor is a node. Every node has an `id`, a `type`, a `transform`, and a `parent`/`children` relationship. The `BaseNode` is extended by specific node types:

```typescript
export interface RectangleNode extends BaseNode {
  type: 'rectangle';
  width: number;
  height: number;
  cornerRadius: [number, number, number, number];
  fills: Fill[];
  strokes: Stroke[];
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  radiusX: number;
  radiusY: number;
  fills: Fill[];
  strokes: Stroke[];
}

export interface PathNode extends BaseNode {
  type: 'path';
  points: PathPoint[];
  closed: boolean;
  fills: Fill[];
  strokes: Stroke[];
}
```

The discriminated union over `type` lets TypeScript narrow node types in switch statements and if-checks:

```typescript
export type Node =
  | GroupNode
  | RectangleNode
  | EllipseNode
  | PolygonNode
  | PathNode
  | TextNode
  | ImageNode
  | ArtboardNode;
```

You won't need all these node types on day one. Start with `RectangleNode`, `EllipseNode`, and `GroupNode`. Add others as you build the tools that create them. But having the union type and the `BaseNode` interface from the start means every subsystem can accept any node — the renderer, the selection manager, the serializer, the undo system — without knowing the specific type.

A common temptation is to skip the types package and define types inline where they're used. Resist it. When the renderer in `@quar/core` and the properties panel in `@quar/web` both need to know what a `RectangleNode` looks like, they should import the same definition from `@quar/types`. Duplicate type definitions drift apart and cause subtle bugs.

## Vite Configuration for the Web Application

The web application uses Vite for development and builds. Vite is fast, supports React out of the box, and handles the monorepo's workspace imports with a bit of alias configuration.

```typescript
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@quar/types': path.resolve(__dirname, '../../packages/types/src'),
      '@quar/core': path.resolve(__dirname, '../../packages/core/src'),
      '@quar/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@quar/export': path.resolve(__dirname, '../../packages/export/src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

The `resolve.alias` section is critical. It tells Vite to resolve imports like `import { SceneGraph } from '@quar/core'` to the actual source directory `packages/core/src`. Without this, Vite would try to resolve `@quar/core` as an npm package and fail.

This approach — importing source directly rather than compiled output — is what makes the monorepo feel seamless during development. You change a file in `packages/core/src`, and the Vite dev server picks it up immediately via hot module replacement. No build step in between.

## Testing Strategy

Our testing philosophy is simple: **test where the logic is, at the level the logic operates.**

Pure math functions get unit tests. A function that subdivides a Bezier curve gets tested with specific input curves and verified output points. There is no mocking — the function takes numbers in and produces numbers out.

Tool classes get integration-style tests with a mock `ToolContext`. The context provides a real `SceneGraph` and `Camera` but mocked UI callbacks. You simulate pointer events and assert that the right nodes were created or modified. This tests the tool's logic without needing a browser.

React components get rendering tests with React Testing Library. You render a component, simulate user interactions, and assert on the DOM output. The store is mocked or provided with test data.

WebGL is _not_ tested through pixel comparison. We mock the WebGL context to verify that the right GL calls happen (correct shader used, correct uniforms set, correct draw calls made). Pixel-perfect rendering tests are fragile across GPUs and operating systems — we test the data flow, not the pixels.

### Vitest Configuration

Each package that has tests gets a `vitest.config.ts`:

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
```

**`globals: true`** makes `describe`, `it`, and `expect` available without importing them. Less boilerplate per test file.

**`environment: 'jsdom'`** simulates a browser DOM. We need this even in the core package because some tests create canvas elements for mock WebGL contexts.

The web application's tests use the same Vitest via the Vite config (Vite's `test` section is Vitest), and add React-specific setup:

```typescript
// apps/web/vite.config.ts (test section)
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  include: ['src/**/*.test.{ts,tsx}'],
  alias: {
    '@quar/types': path.resolve(__dirname, '../../packages/types/src'),
    '@quar/core': path.resolve(__dirname, '../../packages/core/src'),
    '@quar/ui': path.resolve(__dirname, '../../packages/ui/src'),
    '@quar/export': path.resolve(__dirname, '../../packages/export/src'),
  },
},
```

Note that test aliases must be specified separately from Vite's `resolve.alias`. This is a common gotcha — without the test-specific aliases, Vitest can't resolve cross-package imports during test runs.

### Test Setup Files

Each package needs a setup file that configures the test environment. For the core package, this means mocking WebGL:

```typescript
// packages/core/src/test/setup.ts
import { vi } from 'vitest';

export function createMockWebGL2Context(): WebGL2RenderingContext {
  const mockProgram = {} as WebGLProgram;
  const mockShader = {} as WebGLShader;
  const mockBuffer = {} as WebGLBuffer;
  const mockVAO = {} as WebGLVertexArrayObject;

  return {
    // Constants
    ARRAY_BUFFER: 34962,
    FLOAT: 5126,
    TRIANGLES: 4,
    // ... all constants used by the renderer

    // State management
    enable: vi.fn(),
    disable: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    viewport: vi.fn(),

    // Shader operations
    createShader: vi.fn().mockReturnValue(mockShader),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn().mockReturnValue(true),
    // ... all shader methods

    // Buffer operations
    createBuffer: vi.fn().mockReturnValue(mockBuffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    // ... all buffer methods

    // Draw operations
    drawArrays: vi.fn(),
    drawElements: vi.fn(),

    canvas: document.createElement('canvas'),
  } as unknown as WebGL2RenderingContext;
}
```

This mock is verbose but necessary. Every WebGL call the renderer makes must be present here, or tests will fail with "undefined is not a function." The `as unknown as WebGL2RenderingContext` cast is the pragmatic escape hatch — we're providing only the methods we use, not the hundreds of methods in the full WebGL spec.

For the web application, the setup also mocks `ResizeObserver` (not available in JSDOM) and configures `@testing-library/jest-dom` for DOM assertions:

```typescript
// apps/web/src/test/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// ResizeObserver isn't available in JSDOM
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock canvas.getContext for WebGL
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(function (
  this: HTMLCanvasElement,
  contextType: string
) {
  if (contextType === 'webgl2') {
    return createMockWebGL2Context();
  }
  // Return 2D context mock for text measurement, etc.
  return {
    fillRect: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    // ... minimal 2D context mock
  };
});
```

### Writing Your First Test

Let's verify the monorepo is wired correctly with a simple test. In `packages/types/src`, the `Vector2` interface doesn't need testing (it's just a type), but we can test that types are importable from other packages.

Create a simple utility in the core package and test it:

```typescript
// packages/core/src/math.ts
import type { Vector2 } from '@quar/types';

export function vec2Add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Sub(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vec2Scale(v: Vector2, s: number): Vector2 {
  return { x: v.x * s, y: v.y * s };
}

export function vec2Length(v: Vector2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vec2Distance(a: Vector2, b: Vector2): number {
  return vec2Length(vec2Sub(a, b));
}
```

```typescript
// packages/core/src/math.test.ts
import { describe, it, expect } from 'vitest';
import { vec2Add, vec2Sub, vec2Scale, vec2Length, vec2Distance } from './math';

describe('vec2 utilities', () => {
  it('adds two vectors', () => {
    const result = vec2Add({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(result).toEqual({ x: 4, y: 6 });
  });

  it('subtracts two vectors', () => {
    const result = vec2Sub({ x: 5, y: 7 }, { x: 2, y: 3 });
    expect(result).toEqual({ x: 3, y: 4 });
  });

  it('scales a vector', () => {
    const result = vec2Scale({ x: 3, y: 4 }, 2);
    expect(result).toEqual({ x: 6, y: 8 });
  });

  it('computes vector length', () => {
    expect(vec2Length({ x: 3, y: 4 })).toBe(5);
  });

  it('computes distance between two points', () => {
    expect(vec2Distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
```

Run it:

```bash
cd packages/core
npx vitest run
```

If you see green checkmarks, your monorepo is wired correctly. The core package imported a type from the types package, the test runner found and executed the test file, and the math works.

This might seem like a trivial test, but it validates the entire toolchain: pnpm workspace linking, TypeScript path resolution, Vitest configuration, and cross-package imports. If any of those are broken, this test fails.

## Code Quality: ESLint, Prettier, and Husky

A large codebase needs automated quality enforcement. We configure three tools that work together:

**Prettier** handles formatting. No debates about semicolons, indentation, or line length:

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

**ESLint** handles correctness. Our configuration extends the recommended TypeScript rules and adds React-specific checks:

```javascript
// .eslintrc.cjs
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'prettier', // Must be last — disables rules that conflict with Prettier
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  rules: {
    // Catch unused variables (prefix with _ to intentionally skip)
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],

    // Async safety — catch floating promises and misused async
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // React hooks must follow rules (no conditional hooks)
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // General quality
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
  },
};
```

A few rules are especially important for editor development:

- **`no-floating-promises`** catches async functions whose return value is ignored. In an editor, a forgotten `await` on a save operation can silently fail.
- **`react-hooks/rules-of-hooks`** prevents hooks from being called inside conditionals or loops. We'll see in later chapters how this rule catches real bugs in complex components.
- **`eqeqeq`** with `{ null: 'ignore' }` forces `===` everywhere except `== null` checks, which are the idiomatic way to check for both `null` and `undefined` in one expression.

Test files get relaxed rules — `no-explicit-any` and `no-non-null-assertion` are turned off because test code frequently uses `as any` casts and `result!.value` assertions for brevity.

**Husky** runs lint-staged on every commit:

```bash
# .husky/pre-commit
npx lint-staged
```

```json
// In root package.json
"lint-staged": {
  "*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write"
  ],
  "*.{js,jsx,json,md,css}": [
    "prettier --write"
  ]
}
```

Every commit runs ESLint and Prettier on the staged files. If ESLint finds an error, the commit is rejected. This means the main branch always has consistent formatting and no linting errors.

## The Dependency Rule

The most important architectural decision in the monorepo isn't the directory layout or the TypeScript config. It's this rule:

> **Dependencies flow one way: from the application toward the foundation. Never the reverse.**

Concretely:

- `@quar/types` imports from **nothing**.
- `@quar/core` imports from `@quar/types`. Never from `@quar/animation`, `@quar/export`, `@quar/web`, or any React package.
- `@quar/animation` imports from `@quar/types` and `@quar/core`. Never from `@quar/web`.
- `@quar/rigging` imports from `@quar/types` and `@quar/core`. Never from `@quar/web`.
- `@quar/export` imports from `@quar/types` and `@quar/core`. Never from `@quar/web`.
- `@quar/web` imports from **everything**.

This rule has two consequences:

**1. Library packages are framework-agnostic.** The core engine doesn't know React exists. It could be used in a Vue application, a Svelte application, or a Node.js script. This isn't theoretical — our test suites for `@quar/core` and `@quar/export` run without any browser framework.

**2. Library packages are independently testable.** When you run `cd packages/core && npx vitest run`, you're testing the engine with zero framework overhead. The tests in the core package run in seconds, not minutes. If they were entangled with React components and browser state, they'd be an order of magnitude slower.

The web application is the integration point. It imports all the library packages, wraps them in React components, connects them to Zustand state, and renders them in the browser. This is the only place where React hooks, DOM events, and browser APIs appear.

## Running the Full Suite

With everything configured, here are the commands you'll use daily:

```bash
# Start the dev server
pnpm dev

# Run all tests across all packages
pnpm test

# Run tests for one package
cd packages/core && npx vitest run

# Run tests in watch mode for one package
cd packages/core && npx vitest

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Format all files
pnpm format
```

At this point, `pnpm test` runs your handful of math tests and completes in under a second. By the end of the book, it will run thousands of tests across dozens of test files. The monorepo structure and per-package test isolation keep it fast even as the codebase grows.

## Lessons

**Package boundaries enforce architectural discipline better than code review ever can.** When `@quar/core` literally cannot import React because it's not in its `package.json`, no developer — no matter how rushed — can accidentally couple the rendering engine to the UI framework. The module system enforces what documentation can only request.

**Dependencies must flow one way: from the application toward the foundation.** The types package imports nothing. The core engine imports types. The web application imports everything. This one-directional flow guarantees that library packages are independently testable and framework-agnostic. Violating this rule even once creates a dependency cycle that contaminates every package in the chain.

**Strict TypeScript catches the bugs that matter most in visual applications.** `noUncheckedIndexedAccess` finds off-by-one errors in vertex arrays. `strictNullChecks` catches undefined positions before they become NaN values that silently propagate through matrix math. The type system is your first line of defense against invisible rendering artifacts.

**Define shared types in a dedicated package from day one.** When the renderer and the properties panel both need to know what a `RectangleNode` looks like, they must import the same definition. Inline types drift apart across packages, producing subtle serialization bugs that surface weeks later when a user loads a saved file.

**A trivial first test validates the entire toolchain, not just the code it exercises.** Five lines of vector addition testing verify pnpm workspace linking, TypeScript path resolution, Vitest configuration, and cross-package imports all at once. If any link in that chain is broken, the simplest possible test will tell you.

**Automate code quality enforcement at the commit boundary.** Husky running lint-staged on every commit means the main branch always has consistent formatting and zero linting errors. Developers who skip the linter "just this once" are the ones who introduce the `== null` comparison that breaks three months later.

## What We Built

This chapter produced no visible output — no canvas, no shapes, no UI. What it produced is more important: a project structure that will scale from 5 tests to 3,000 without collapsing under its own weight.

You now have:

- A pnpm monorepo with seven packages and clear dependency boundaries
- TypeScript strict mode catching null errors, unused variables, and unsafe indexing at compile time
- A types package with the foundational interfaces every subsystem will share
- Vitest configured with JSDOM and WebGL mocks for each package
- ESLint and Prettier enforced on every commit via Husky

In the next chapter, we'll build the editor shell — the menubar, toolbar, canvas, properties panel, and layer panel that frame the workspace. It won't do anything yet, but it will give us the visual structure where everything else will live.
