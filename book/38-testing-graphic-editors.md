# Testing Graphic Editors

## 3,000 Tests for Visual Software

How do you test software whose output is visual? You can't screenshot-compare every frame — the tests would be slow, brittle, and impossible to maintain. You can't test the GPU directly — WebGL doesn't run in Node.js. You can't render to a real canvas in a test environment — JSDOM doesn't have a GPU. And yet, the editor has over 3,000 tests that run in seconds, catch real bugs, and give confidence to ship changes.

The strategy is layered. At the bottom, pure function tests verify the mathematical foundations: vector operations, matrix transforms, bezier curve evaluation, path tessellation, boolean geometry. These tests are fast, deterministic, and GPU-independent. In the middle, tool tests simulate pointer events against a real scene graph with a mock rendering context — they verify that clicking, dragging, and releasing produces the correct nodes with the correct geometry. At the top, component tests render React components with mocked stores and scene graph contexts — they verify that the UI responds to state changes, shows the right labels, and fires the right callbacks. Cutting across all layers, a mock infrastructure replaces WebGL with stub functions and opentype.js with a fake font object, letting the entire test suite run in JSDOM without a GPU or font files.

## The Test Pyramid

The test suite distributes across five packages:

| Package              | Tests | What They Cover                                                                             |
| -------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `packages/core`      | 1,606 | Math, paths, beziers, tessellation, tools, scene graph, rendering, SVG, boolean ops, format |
| `packages/animation` | 454   | Easing, timeline, keyframes, property binding, playback, shape tweening                     |
| `apps/web`           | 768   | React components, store actions, hooks, UI panels, context menus                            |
| `packages/rigging`   | 241   | Bones, IK solver, skinning, weight painting, smart bones, dynamic chains                    |
| `packages/export`    | 204   | Sprite sheets, PNG sequences, Lottie conversion, bin packing                                |

The core package has the most tests because it contains the most pure functions. Pure functions are the easiest to test: no setup, no teardown, no mocking, no side effects. Pass inputs, check outputs. The animation package is similar — easing functions, interpolation, keyframe management are all pure math. The web package has fewer tests per line of code because component tests require more setup (providers, store resets, DOM queries) and each test covers more behavior. The rigging and export packages are domain-specific — their tests verify physics simulation, skinning math, and file format conversion.

## Pure Function Testing

The bottom layer tests mathematical functions in isolation. These tests are the fastest, the most reliable, and the most valuable per line of test code.

### Vector and Matrix Tests

Vector operations have well-defined mathematical properties. Tests verify these properties directly:

```typescript
describe('vec2', () => {
  describe('add', () => {
    it('adds two vectors', () => {
      const result = vec2.add({ x: 1, y: 2 }, { x: 3, y: 4 });
      expect(result).toEqual({ x: 4, y: 6 });
    });
  });

  describe('normalize', () => {
    it('normalizes vector to unit length', () => {
      const result = vec2.normalize({ x: 3, y: 4 });
      expect(result.x).toBeCloseTo(0.6);
      expect(result.y).toBeCloseTo(0.8);
    });
    it('returns zero vector for zero input', () => {
      const result = vec2.normalize({ x: 0, y: 0 });
      expect(result).toEqual({ x: 0, y: 0 });
    });
  });

  describe('rotate', () => {
    it('rotates vector by angle', () => {
      const result = vec2.rotate({ x: 1, y: 0 }, Math.PI / 2);
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(1);
    });
  });
});
```

The `toBeCloseTo` matcher is essential for floating-point math. `vec2.rotate` computes `cos(π/2)` which produces `6.12e-17`, not exactly `0`. Strict `toEqual` would fail. `toBeCloseTo(0)` passes because the result is within the default 5 decimal places of precision.

Edge case tests verify guard clauses — division by zero, singular matrices, degenerate inputs:

```typescript
describe('vec2 division-by-zero guards', () => {
  it('throws on divide by zero', () => {
    expect(() => vec2.divide({ x: 10, y: 20 }, 0)).toThrow('Division by zero');
  });
  it('normalize returns zero for near-zero vector', () => {
    const result = vec2.normalize({ x: 1e-12, y: 1e-12 });
    expect(result).toEqual({ x: 0, y: 0 });
  });
});

describe('mat3 singular matrix guards', () => {
  it('invert returns null for singular matrix', () => {
    const m = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };
    expect(mat3.invert(m)).toBeNull();
  });
  it('decompose handles zero-scale matrix gracefully', () => {
    const m = { a: 0, b: 0, c: 0, d: 1, tx: 5, ty: 10 };
    const result = mat3.decompose(m);
    expect(result.position).toEqual({ x: 5, y: 10 });
    expect(result.scale.x).toBe(0);
    expect(result.rotation).toBe(0);
  });
});
```

Matrix tests verify algebraic properties: identity multiplication, inverse round-tripping, transform application:

```typescript
describe('mat3', () => {
  describe('multiply', () => {
    it('applies transformations correctly', () => {
      const scale = { a: 2, b: 0, c: 0, d: 2, tx: 0, ty: 0 };
      const translate = { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 };
      const result = mat3.multiply(scale, translate);
      expect(result.tx).toBe(20); // 10 * 2
      expect(result.ty).toBe(40); // 20 * 2
    });
  });

  describe('invert', () => {
    it('inverts matrix', () => {
      const m = { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 20 };
      const inv = mat3.invert(m);
      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.a).toBeCloseTo(0.5);
        expect(inv.tx).toBeCloseTo(-5);
      }
    });
  });

  describe('transformPoint', () => {
    it('transforms point by matrix', () => {
      const m = { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 20 };
      const result = mat3.transformPoint(m, { x: 5, y: 5 });
      expect(result).toEqual({ x: 20, y: 30 });
    });
  });
});
```

### Bezier Curve Tests

Bezier functions have known analytical properties: the curve passes through the endpoints at t=0 and t=1, the tangent at t=0 points from P0 toward P1. Tests verify these properties:

```typescript
describe('bezier', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 100 };
  const p2 = { x: 100, y: 100 };
  const p3 = { x: 100, y: 0 };

  it('should return p0 at t=0', () => {
    const result = bezier.cubicPoint(p0, p1, p2, p3, 0);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it('should return p3 at t=1', () => {
    const result = bezier.cubicPoint(p0, p1, p2, p3, 1);
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(0);
  });

  it('should return midpoint approximately at t=0.5', () => {
    const result = bezier.cubicPoint(p0, p1, p2, p3, 0.5);
    expect(result.x).toBeCloseTo(50, 1);
    expect(result.y).toBeCloseTo(75, 1);
  });
});
```

The helper `expectVecNear` standardizes floating-point vector comparisons across the bezier test suite:

```typescript
const expectVecNear = (actual: Vector2, expected: Vector2, epsilon = 0.0001) => {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
};
```

### Parametric Tests for Function Families

The easing system has 28 functions (linear, ease-in/out/inOut for quad, cubic, quart, quint, sine, expo, circ, back, elastic, bounce). Every easing function must satisfy the same boundary conditions: f(0) = 0 and f(1) = 1. A parametric test loop generates 56 test cases from a single block:

```typescript
describe('easing boundary values', () => {
  const allTypes = getEasingTypes();

  for (const type of allTypes) {
    it(`${type}: f(0) should be 0`, () => {
      const fn = getEasingFunction(type);
      expect(fn(0)).toBeCloseTo(0, 5);
    });
    it(`${type}: f(1) should be 1`, () => {
      const fn = getEasingFunction(type);
      expect(fn(1)).toBeCloseTo(1, 5);
    });
  }
});
```

Individual midpoint tests verify the mathematical formulas for specific easing types:

```typescript
it('easeInQuad at 0.5 should be 0.25', () => {
  expect(getEasingFunction('easeInQuad')(0.5)).toBeCloseTo(0.25, 5);
});
it('easeOutQuad at 0.5 should be 0.75', () => {
  expect(getEasingFunction('easeOutQuad')(0.5)).toBeCloseTo(0.75, 5);
});
```

The midpoint values (0.25, 0.75) are computed by hand from the easing formulas (t^2 for easeInQuad, 1-(1-t)^2 for easeOutQuad). These are not regression tests — they verify mathematical correctness against known values.

### Path and Boolean Operation Tests

Path utility tests verify geometry construction and tessellation:

```typescript
describe('createCornerPoint', () => {
  it('should create a corner point with no handles', () => {
    const point = createCornerPoint({ x: 100, y: 200 });
    expect(point.position).toEqual({ x: 100, y: 200 });
    expect(point.handleIn).toBeNull();
    expect(point.handleOut).toBeNull();
    expect(point.type).toBe('corner');
  });
  it('should create an independent copy of position', () => {
    const pos = { x: 50, y: 50 };
    const point = createCornerPoint(pos);
    pos.x = 100;
    expect(point.position.x).toBe(50); // not mutated
  });
});
```

The immutability test (verifying the original position isn't mutated) catches a common bug in geometry code where shared references cause action-at-a-distance mutations.

Boolean operation tests build typed node objects inline:

```typescript
function makeRect(id: string, x: number, y: number, w: number, h: number): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: w,
    height: h,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  } as unknown as Node;
}
```

The `as unknown as Node` cast is necessary because TypeScript's type system expects every field of the union type, but the test only needs the fields relevant to the function being tested. This is the test factory pattern: build minimal-but-complete objects that satisfy the function's runtime requirements.

### Property Binding Tests

The animation system's `getProperty` and `setProperty` functions use dot-notation paths to read and write nested node properties. Tests verify the traversal:

```typescript
describe('getProperty', () => {
  const node = makeRectNode();

  it('gets top-level property', () => {
    expect(getProperty(node, 'opacity')).toBe(1);
    expect(getProperty(node, 'width')).toBe(50);
  });
  it('gets nested property', () => {
    expect(getProperty(node, 'transform.position.x')).toBe(100);
  });
  it('gets deeply nested property', () => {
    expect(getProperty(node, 'fills.0.color.r')).toBe(255);
  });
  it('returns undefined for non-existent path', () => {
    expect(getProperty(node, 'nonexistent')).toBeUndefined();
  });
});

describe('setProperty', () => {
  it('sets top-level property immutably', () => {
    const node = makeRectNode();
    const updated = setProperty(node, 'opacity', 0.5);
    expect(updated.opacity).toBe(0.5);
    expect(node.opacity).toBe(1); // original unchanged
  });
});
```

The immutability test for `setProperty` is critical — the animation system must produce new node objects (for React's referential equality checks) rather than mutating existing ones.

## Tool Testing: Mock ToolContext

Tool tests sit between pure function tests and component tests. They need a real scene graph (because tools perform hit testing against geometry), a real camera (because tools convert screen coordinates to world coordinates), and real pointer events (because tools respond to drag sequences). But they don't need a real canvas, a real WebGL context, or a real React component tree.

The `createMockToolContext` factory provides this middle ground:

```typescript
export function createMockToolContext(): ToolContext {
  const selectedIds = new Set<string>();
  let idCounter = 0;
  let enteredGroupId: string | null = null;

  return {
    sceneGraph: new SceneGraph(),
    camera: new Camera(),
    getSelectedIds: () => selectedIds,
    setSelectedIds: (ids: string[]) => {
      selectedIds.clear();
      ids.forEach((id) => selectedIds.add(id));
    },
    addToSelection: (id: string) => selectedIds.add(id),
    clearSelection: () => selectedIds.clear(),
    defaultFill: mockDefaultFill,
    defaultStroke: mockDefaultStroke,
    generateId: () => `node-${++idCounter}`,
    setActiveTool: () => {},
    getEnteredGroupId: () => enteredGroupId,
    setEnteredGroupId: (id) => {
      enteredGroupId = id;
    },
    getGuides: () => [],
    getSnapToGuides: () => false,
  };
}
```

The key design decision: `sceneGraph` and `camera` are real instances, not mocks. The scene graph needs to actually store nodes, compute bounds, and report hit test results. The camera needs to actually convert coordinates. If these were mocked, the tests would verify that the tool calls the right methods in the right order — but not that the geometry math produces correct results.

The "UI bridge" callbacks — `setActiveTool`, `generateId`, `getGuides` — are stubs. They don't need real behavior for most tool tests. `generateId` produces sequential IDs for predictable test assertions.

### The Mock Pointer Event

```typescript
export function createMockPointerEvent(
  overrides: Partial<CanvasPointerEvent> = {}
): CanvasPointerEvent {
  return {
    worldPosition: { x: 0, y: 0 },
    screenPosition: { x: 0, y: 0 },
    button: 0,
    buttons: 1,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    pressure: 0.5,
    timestamp: Date.now(),
    ...overrides,
  };
}
```

The spread `...overrides` pattern lets tests specify only the fields they care about. A test for Shift+Click selection passes `{ worldPosition: { x: 200, y: 50 }, shiftKey: true }` and inherits sensible defaults for everything else.

### Tool Test Anatomy

Every tool test follows the same pattern: create a context, create a tool, add nodes to the scene graph, simulate pointer events, check the result:

```typescript
describe('SelectionTool', () => {
  let context: ToolContext;
  let tool: SelectionTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new SelectionTool(context);
  });

  it('should select node when clicking on it', () => {
    const rect = createTestRectangle('rect1', 50, 50, 100, 100);
    context.sceneGraph.addNode(rect);

    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      })
    );

    expect(context.getSelectedIds().has('rect1')).toBe(true);
  });

  it('should clear selection when clicking empty space', () => {
    const rect = createTestRectangle('rect1', 50, 50, 100, 100);
    context.sceneGraph.addNode(rect);
    context.setSelectedIds(['rect1']);

    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: { x: 200, y: 200 },
        button: 0,
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: { x: 200, y: 200 },
        button: 0,
      })
    );

    expect(context.getSelectedIds().size).toBe(0);
  });

  it('should add to selection with Ctrl+click', () => {
    const rect1 = createTestRectangle('rect1', 50, 50, 100, 100);
    const rect2 = createTestRectangle('rect2', 200, 50, 100, 100);
    context.sceneGraph.addNode(rect1);
    context.sceneGraph.addNode(rect2);

    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: { x: 50, y: 50 },
        button: 0,
      })
    );

    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
        ctrlKey: true,
        button: 0,
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: { x: 200, y: 50 },
        ctrlKey: true,
        button: 0,
      })
    );

    expect(context.getSelectedIds().has('rect1')).toBe(true);
    expect(context.getSelectedIds().has('rect2')).toBe(true);
  });
});
```

Shape creation tools test the full drag-to-create gesture:

```typescript
describe('RectangleTool', () => {
  it('should create rectangle on drag', () => {
    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      })
    );
    tool.onPointerMove(
      createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        button: 0,
      })
    );

    expect(context.sceneGraph.getNodeCount()).toBe(1);
    const node = Array.from(context.sceneGraph.getNodes())[0];
    expect(node.type).toBe('rectangle');
    expect((node as any).width).toBe(100);
    expect((node as any).height).toBe(50);
  });

  it('should constrain to square when shift is held', () => {
    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: { x: 100, y: 50 },
        shiftKey: true,
        button: 0,
      })
    );

    const rect = Array.from(context.sceneGraph.getNodes())[0] as any;
    expect(rect.width).toBe(rect.height);
  });

  it('should enforce minimum size', () => {
    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: { x: 0.5, y: 0.5 },
        button: 0,
      })
    );

    expect(context.sceneGraph.getNodeCount()).toBe(0);
  });
});
```

The minimum-size test verifies that tiny drags (sub-pixel movement) don't create degenerate rectangles. This catches a real class of bugs: a user who clicks without dragging shouldn't produce a zero-width shape.

## WebGL Mocking

WebGL can't run in JSDOM — there's no GPU. The test infrastructure provides a mock WebGL2 context that stubs every GL function:

```typescript
export function createMockWebGL2Context(): WebGL2RenderingContext {
  const mockProgram = { __isProgram: true } as unknown as WebGLProgram;
  const mockShader = { __isShader: true } as unknown as WebGLShader;
  const mockBuffer = { __isBuffer: true } as unknown as WebGLBuffer;
  const mockVAO = { __isVAO: true } as unknown as WebGLVertexArrayObject;

  return {
    // Constants
    ARRAY_BUFFER: 34962,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    COLOR_BUFFER_BIT: 16384,
    // ... 20+ more constants ...

    // State management
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    viewport: vi.fn(),

    // Shader operations
    createShader: vi.fn().mockReturnValue(mockShader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn().mockReturnValue(true),
    // ... 30+ more methods ...

    canvas: document.createElement('canvas'),
  } as unknown as WebGL2RenderingContext;
}
```

The sentinel objects (`{ __isProgram: true }`) are opaque handles. Real WebGL programs are opaque too — you never inspect their contents, only pass them to other GL functions. The sentinels satisfy TypeScript's type system and provide identity for equality checks in tests.

The mock is wired to the canvas element so that `canvas.getContext('webgl2')` returns it:

```typescript
export function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const mockGL = createMockWebGL2Context();
  canvas.getContext = vi.fn().mockImplementation((contextType: string) => {
    if (contextType === 'webgl2') return mockGL;
    return null;
  });
  return canvas;
}
```

For the web app's global test setup, `HTMLCanvasElement.prototype.getContext` is patched globally:

```typescript
// apps/web/src/test/setup.ts
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(function (
  this: HTMLCanvasElement,
  contextType: string
) {
  if (contextType === 'webgl2') {
    const gl = createMockWebGL2Context();
    gl.canvas = this;
    return gl;
  }
  // Canvas 2D mock for text measurement
  return {
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    save: vi.fn(),
    restore: vi.fn(),
    // ...
  };
});
```

The 2D context mock is necessary for `textMetrics.ts`, which uses `CanvasRenderingContext2D.measureText()` as a fallback when opentype.js metrics aren't available. The mock returns `{ width: 0 }` — sufficient for tests that verify the calling pattern without needing accurate text measurements.

### What to Mock vs. What to Test

The WebGL mock makes a deliberate tradeoff: it stubs everything at the GL call level but tests everything at the application level. You can't test that a shader program produces correct pixel output — there's no GPU. But you can test that:

- The renderer compiles the expected number of shaders:

  ```typescript
  expect(gl.shaderSource).toHaveBeenCalledTimes(20);
  expect(gl.compileShader).toHaveBeenCalledTimes(20);
  ```

- Buffer allocation uses the right usage hint:

  ```typescript
  expect(gl.bufferData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, expect.any(Number), gl.DYNAMIC_DRAW);
  ```

- Tessellation produces the correct number of vertices and indices (the input to `gl.bufferData`).

- The scene graph traversal visits nodes in the correct order.

- Hit testing returns the correct node for a given world coordinate.

These tests verify everything up to the GPU boundary. The GPU itself is trusted — its behavior is defined by the OpenGL ES specification and implemented by the graphics driver. Testing the driver is the driver vendor's job. Testing the data that flows into the driver is ours.

## The opentype.js Mock

opentype.js is a JavaScript font parser that reads TrueType and OpenType font files. It's used for text-to-path conversion, glyph outline extraction, and text metrics. But it can't load in JSDOM: the library uses `Object.defineProperty` on module exports in a way that conflicts with Vitest's module transformation.

The fix is a Vitest `alias` that redirects the import:

```typescript
// packages/core/vitest.config.ts
export default defineConfig({
  test: {
    alias: {
      'opentype.js': path.resolve(__dirname, 'src/test/__mocks__/opentype.js.ts'),
    },
  },
});
```

The mock provides a fake font object with realistic metrics:

```typescript
import { vi } from 'vitest';

const mockFont = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  getPath: vi.fn().mockReturnValue({
    commands: [],
  }),
  charToGlyph: vi.fn().mockReturnValue({
    advanceWidth: 500,
    path: { commands: [] },
    getPath: vi.fn().mockReturnValue({ commands: [] }),
  }),
  stringToGlyphs: vi.fn().mockReturnValue([]),
  getKerningValue: vi.fn().mockReturnValue(0),
  forEachGlyph: vi.fn(),
};

export const parse = vi.fn().mockReturnValue(mockFont);
export const load = vi.fn();

export default {
  parse,
  load,
  Font: vi.fn(),
  Glyph: vi.fn(),
  Path: vi.fn(),
};
```

The metrics matter: `unitsPerEm: 1000`, `ascender: 800`, `descender: -200` are realistic values for a standard font. Tests that compute text bounds or line height use these numbers and get plausible results. If the metrics were `0` or `undefined`, the tests would pass but the bounds calculations would produce NaN — hiding real bugs.

The web app doesn't duplicate this mock. Its `vite.config.ts` points to the core package's mock file:

```typescript
// apps/web/vite.config.ts
test: {
  alias: {
    'opentype.js': path.resolve(
      __dirname,
      '../../packages/core/src/test/__mocks__/opentype.js.ts'
    ),
  },
},
```

One mock, two packages. When the mock needs updating (adding a new method like `forEachGlyph`), the change happens in one file and applies everywhere.

## Component Testing

React component tests use React Testing Library to render components, query the DOM, and simulate user interactions. The challenge is providing the infrastructure that components depend on: the scene graph context, the Zustand store, and the WebGL canvas.

### The SceneGraphProvider Wrapper

Components that call `useSceneGraph()` need a `SceneGraphProvider` ancestor. The wrapper pattern:

```typescript
function renderWithProvider(ui: ReactNode) {
  return render(
    <SceneGraphProvider>{ui}</SceneGraphProvider>
  );
}
```

### The SceneGraphCapture Pattern

Tests that need to manipulate the scene graph directly face a problem: the `SceneGraph` instance lives inside React context, accessible only via the `useSceneGraph` hook. You can't call hooks outside a component. The solution is a tiny capture component:

```typescript
function SceneGraphCapture({
  onCapture,
}: {
  onCapture: (sg: SceneGraph) => void;
}) {
  const sg = useSceneGraph();
  onCapture(sg);
  return null;
}

function renderWithSceneGraph() {
  let sg: SceneGraph | null = null;
  render(
    <SceneGraphProvider>
      <SceneGraphCapture onCapture={(s) => (sg = s)} />
      <PropertiesPanel />
    </SceneGraphProvider>
  );
  return sg!;
}
```

The `SceneGraphCapture` component renders inside the provider, calls `useSceneGraph()` during render, and passes the instance to the test via the callback. The test now has a direct reference to the same `SceneGraph` that the component uses.

### Store Reset in beforeEach

Zustand's store persists across test cases within a file. If test A selects a node and test B expects no selection, test B fails unless the store is reset:

```typescript
beforeEach(() => {
  useEditorStore.getState().clearSelection();
  if (useEditorStore.getState().aspectRatioLocked) {
    useEditorStore.getState().toggleAspectRatioLock();
  }
});
```

More comprehensive resets use `useEditorStore.setState()` with the full state shape:

```typescript
beforeEach(() => {
  useEditorStore.setState({
    activeTool: 'selection',
    selectedNodeIds: new Set<string>(),
    timeline: createTimeline({ duration: 300, frameRate: 30 }),
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    // ... 30+ more fields ...
  });
});
```

This brute-force reset is verbose but safe. It catches state leaks from previous tests that a targeted reset might miss.

### Component Test Anatomy

A component test adds nodes to the scene graph, sets store state, and queries the DOM:

```typescript
describe('PropertiesPanel', () => {
  it('shows empty state when nothing is selected', () => {
    renderWithProvider(<PropertiesPanel />);
    expect(
      screen.getByText('Select an object to view properties')
    ).toBeInTheDocument();
  });

  it('shows transform section when node is selected', () => {
    const sg = renderWithSceneGraph();
    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });
    expect(screen.getByText('Transform')).toBeInTheDocument();
    expect(screen.getByText('Position')).toBeInTheDocument();
  });
});
```

The `act()` wrapper is required because scene graph mutations trigger React state updates (via event subscriptions). Without `act()`, the test reads stale DOM before React processes the updates.

Layer panel tests verify that the scene graph and the layer list stay in sync:

```typescript
it('renders layers from SceneGraph', () => {
  let sg: SceneGraph | null = null;
  render(
    <SceneGraphProvider>
      <SceneGraphCapture onCapture={(s) => (sg = s)} />
      <LayerPanel />
    </SceneGraphProvider>
  );

  act(() => {
    sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
    sg!.addNode(createTestEllipse('ellipse1', 'Ellipse 1'));
  });

  expect(screen.getByText('Rectangle 1')).toBeInTheDocument();
  expect(screen.getByText('Ellipse 1')).toBeInTheDocument();
});
```

### Mocking External Dependencies

Some tests mock entire modules to isolate the component under test. The `vi.mock` factory function pattern:

```typescript
// Mock project storage service
const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/projectStorage', () => ({
  saveProject: (...args: unknown[]) => mockSave(...args),
  loadProject: vi.fn().mockResolvedValue(null),
  listProjects: vi.fn().mockResolvedValue([]),
}));
```

The partial mock pattern preserves real implementations while overriding specific exports:

```typescript
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  };
});
```

The stateful mock class pattern simulates a `PlaybackController` with observable behavior:

```typescript
vi.mock('@quar/animation', async () => {
  const actual = await vi.importActual('@quar/animation');
  return {
    ...(actual as object),
    PlaybackController: vi.fn().mockImplementation((opts) => {
      let currentFrame = 0;
      let playing = false;
      return {
        get currentFrame() {
          return currentFrame;
        },
        get isPlaying() {
          return playing;
        },
        play: vi.fn(() => {
          playing = true;
        }),
        pause: vi.fn(() => {
          playing = false;
        }),
        goToFrame: vi.fn((f: number) => {
          currentFrame = f;
          opts.onFrameChange?.(f);
        }),
      };
    }),
  };
});
```

This mock is a miniature state machine: calling `play()` sets `playing = true`, calling `goToFrame(5)` updates `currentFrame` and invokes the callback. The test can verify that the hook responds correctly to playback state changes without running a real RAF loop.

### The Fake Timer for Animation Tests

The `PlaybackController` uses `requestAnimationFrame` internally. Tests need deterministic control over time. A fake timer provides manual frame stepping:

```typescript
function createFakeTimer() {
  let callback: FrameRequestCallback | null = null;
  let currentId = 0;
  return {
    requestFrame: (cb: FrameRequestCallback): number => {
      callback = cb;
      return ++currentId;
    },
    cancelFrame: vi.fn(),
    tick: (timestamp: number) => {
      const cb = callback;
      callback = null;
      cb?.(timestamp);
    },
    get pending() {
      return callback !== null;
    },
  };
}

// Usage
const { controller, timer } = createController({}, createFakeTimer());
controller.play();
timer.tick(0); // frame 0
timer.tick(1000 / 30); // frame 1 (at 30fps, 33.3ms per frame)
expect(onFrameChange).toHaveBeenCalledWith(1);
```

The fake timer captures the RAF callback and exposes a `tick()` method that invokes it with a chosen timestamp. This makes time deterministic — no flaky tests from real-time variance, no waiting for actual milliseconds to pass.

## Performance Benchmarks as Tests

Some tests verify performance using `performance.now()` with explicit time budgets:

```typescript
it('serialize 200 shapes: < 100ms', () => {
  const project = makeProject(200);
  const start = performance.now();
  const binary = writeQuarFile(project);
  const elapsed = performance.now() - start;

  expect(elapsed).toBeLessThan(100);
  expect(binary.byteLength).toBeGreaterThan(0);
});

it('deserialize 200 shapes: < 100ms', () => {
  const project = makeProject(200);
  const binary = writeQuarFile(project);

  const start = performance.now();
  const parsed = parseQuarFile(binary);
  const elapsed = performance.now() - start;

  expect(elapsed).toBeLessThan(100);
});
```

The time budgets are generous — 100ms for 200 shapes, 500ms for 10 large images. These aren't micro-benchmarks trying to measure nanosecond differences. They're regression guards that catch catastrophic performance degradation: if someone accidentally introduces an O(n^2) loop in the serializer, the test fails because 200 shapes now takes 2 seconds instead of 10ms.

Comparative benchmarks verify the binary format's size advantage over JSON:

```typescript
it('binary format smaller than JSON for image projects', () => {
  const project = makeProject(5);
  for (let i = 0; i < 5; i++) {
    project.pages[0].sceneGraph.nodes.push(makeImageNode(`img-${i}`, 50));
  }
  const jsonSize = JSON.stringify(project).length;
  const binarySize = writeQuarFile(project).byteLength;

  expect(binarySize).toBeLessThan(jsonSize);
  const savings = ((jsonSize - binarySize) / jsonSize) * 100;
  expect(savings).toBeGreaterThan(10);
});
```

And deduplication tests verify memory efficiency:

```typescript
it('no duplicate buffers for identical images', () => {
  const img = makeImageNode('img-shared', 50);
  project.pages[0].sceneGraph.nodes.push({ ...img, id: 'img-a' }, { ...img, id: 'img-b' });
  const binary = writeQuarFile(project);
  const decoded = decodeQuarBinary(binary);

  expect(decoded.buffers.length).toBe(1); // deduped
});
```

`performance.now()` is available natively in both Node.js and JSDOM — no polyfill or setup required. The measurements include GC pauses and other runtime overhead, which is why the budgets are generous. The goal isn't precision timing; it's catching regressions that would be visible to users.

## Test Configuration

Each package has its own Vitest configuration. The core package runs in JSDOM (for DOM API access in path parsing and text metrics), with the opentype.js alias:

```typescript
// packages/core/vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    alias: {
      'opentype.js': path.resolve(__dirname, 'src/test/__mocks__/opentype.js.ts'),
    },
  },
});
```

The animation package runs in pure Node — no DOM needed for math:

```typescript
// packages/animation/vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
```

The web app adds React Testing Library setup and all the package aliases:

```typescript
// apps/web/vite.config.ts (test section)
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  include: ['src/**/*.test.{ts,tsx}'],
  alias: {
    'opentype.js': path.resolve(
      __dirname,
      '../../packages/core/src/test/__mocks__/opentype.js.ts'
    ),
  },
},
```

The `globals: true` setting makes `describe`, `it`, `expect`, `vi`, `beforeEach`, and `afterEach` available without explicit imports. This reduces boilerplate — every test file saves six import lines.

The web app's setup file also mocks `ResizeObserver` (not available in JSDOM):

```typescript
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

And runs `cleanup()` after each test to unmount React components:

```typescript
import { cleanup } from '@testing-library/react';
afterEach(() => {
  cleanup();
});
```

## What Not to Test

Not everything in a graphic editor benefits from automated tests:

**Pixel-perfect rendering**: Shader output, anti-aliasing quality, gradient smoothness, blend mode visual accuracy. These depend on the GPU, the driver, and the operating system. They change between machines. Screenshot comparison tests would be fragile and slow. Instead, verify the data flowing into the GPU (vertex positions, uniform values, texture coordinates) and trust the GPU to render it correctly.

**Interactive feel**: Whether a drag gesture feels smooth, whether a bezier handle responds naturally, whether a zoom animation eases in correctly. These are subjective and time-dependent. Manual testing with a real browser catches these issues faster than any automated test.

**Third-party library internals**: Whether `polygon-clipping` handles a specific edge case, whether opentype.js parses a particular font format. Test the integration (your code calling the library with your data), not the library's internal logic.

**Layout aesthetics**: Whether a panel looks right at 1920x1080 vs. 1366x768, whether the dark theme has sufficient contrast. Visual regression tools (Storybook + Chromatic) serve this purpose better than unit tests.

The testing strategy focuses on where automated tests provide the highest value: pure math (cheap to test, expensive if wrong), tool behavior (complex state machines with many branches), and component state (reactive updates that are hard to verify manually across all combinations).

## Lessons

**Test pure functions exhaustively.** Math functions are the foundation of a graphic editor. A bug in `vec2.normalize` affects every tool, every selection, every transform. These functions are cheap to test (no setup, instant execution), and the tests serve as living documentation of the mathematical specification. Include edge cases: zero vectors, singular matrices, degenerate inputs.

**Use real objects where behavior matters, mocks where behavior doesn't.** Tool tests use a real `SceneGraph` and `Camera` because hit testing and coordinate conversion must actually work. They mock `setActiveTool` and `generateId` because the tool doesn't care what those functions do internally. The principle: mock the boundary, not the core.

**Parametric tests catch invariant violations.** A loop that generates test cases for every easing function, every node type, or every SVG command catches bugs across the entire family. When a new easing function is added, it automatically gets boundary-condition tests. When the parametric test fails for one member, it reveals a systematic issue.

**Reset all shared state between tests.** Zustand stores, scene graph instances, and DOM state persist across test cases. Incomplete resets produce order-dependent failures — test B passes in isolation but fails when test A runs first. The brute-force `setState` reset with every field is verbose but eliminates this class of flakiness.

**Performance benchmarks guard against regression, not precision.** Use generous time budgets (2-5x the expected duration) to account for CI variance and GC pauses. The goal is to catch O(n^2) regressions that would be visible to users, not to measure microsecond differences between implementations.

**Mock at the boundary, not at every layer.** The WebGL mock replaces the GPU context but preserves everything above it: tessellation, scene graph traversal, transform computation, hit testing. This means bugs in any of those layers are caught by tests, even though the pixels never reach a screen. If you mocked the ShapeRenderer too, you'd lose coverage of the tessellation pipeline.

## What We Built

This chapter covered the testing strategy for a 3,000+ test suite across a graphic editor with five packages:

- **Pure function tests** verify math, paths, beziers, boolean operations, easing functions, and property binding with direct input-output assertions and edge case coverage for degenerate inputs like zero vectors and singular matrices.
- **Tool tests** use `createMockToolContext` with a real `SceneGraph` and `Camera` but stubbed UI callbacks, simulating complete pointer event sequences (down, move, up) to verify selection, creation, drag, and keyboard modifier behavior.
- **The WebGL mock** provides a `createMockWebGL2Context` function with 50+ stubbed GL methods and constants, wired to `HTMLCanvasElement.prototype.getContext` globally, enabling renderer initialization tests without a GPU.
- **The opentype.js mock** redirects imports via a Vitest `alias` to a file that exports `vi.fn()` stubs with realistic font metrics (`unitsPerEm: 1000`, `ascender: 800`), shared between the core and web packages from a single source.
- **Component tests** use the `SceneGraphCapture` pattern to extract the live scene graph reference from React context, `act()` for scene graph mutations, and `useEditorStore.setState()` for brute-force store resets between test cases.
- **Performance benchmarks** use `performance.now()` with generous time budgets to guard against regression — catching O(n^2) serialization bugs and verifying binary format size savings over JSON.
- **Fake timers** give deterministic control over `requestAnimationFrame` in animation tests, with a `tick(timestamp)` method that advances the playback controller by exactly one frame.

The next chapter — the final chapter — steps back to look at the architecture decisions that shaped the project. From monorepo boundaries and pure function design to snapshot-based undo and Zustand over Redux, these are the patterns we'd choose again if we started from scratch.
