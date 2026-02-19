# Architecture Decisions We'd Make Again

## Patterns That Paid Off

Every project accumulates architectural decisions. Some are deliberate — chosen after research and debate. Others are accidental — inherited from a tutorial, a library default, or the first thing that compiled. Over twenty-six sprints and 3,000 tests, certain decisions proved their value repeatedly. They didn't just work once — they shaped how every subsequent feature was built, how bugs were found, and how confidently code was shipped.

This chapter examines eight architectural decisions that we would choose again if we started from scratch. Not because they're theoretically elegant, but because they solved real problems we encountered while building a graphic editor. Each one earned its place by making the next sprint easier than the last.

## Decision 1: Monorepo with Strict Package Boundaries

The project is a pnpm workspace with six packages and one application:

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```
quar-animator/
├── packages/
│   ├── types/      # Shared TS interfaces
│   ├── core/       # Scene graph, rendering, tools
│   ├── animation/  # Timeline, easing, keyframes
│   ├── rigging/    # Bones, IK, skinning
│   ├── export/     # Sprites, PNG, Lottie
│   └── ui/         # Design system components
└── apps/
    └── web/        # React app (Vite, Zustand)
```

The critical rule: `@quar/core` has zero React imports. Its `package.json` depends on `@quar/types`, `@quar/rigging`, `earcut`, `opentype.js`, and `polygon-clipping` — nothing from the React ecosystem:

```json
{
  "name": "@quar/core",
  "dependencies": {
    "@quar/rigging": "workspace:*",
    "@quar/types": "workspace:*",
    "earcut": "^3.0.2",
    "opentype.js": "^1.3.4",
    "polygon-clipping": "^0.15.7"
  }
}
```

Compare with `@quar/ui`, which depends on React because it contains React components:

```json
{
  "name": "@quar/ui",
  "dependencies": {
    "@quar/types": "workspace:*",
    "lucide-react": "^0.563.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

The boundary runs through a React context that bridges the two worlds:

```typescript
// apps/web/src/contexts/SceneGraphContext.tsx
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { SceneGraph } from '@quar/core';

const SceneGraphContext = createContext<SceneGraph | null>(null);

export function SceneGraphProvider({ children }: { children: ReactNode }) {
  const sceneGraphRef = useRef<SceneGraph>(new SceneGraph());
  return (
    <SceneGraphContext.Provider value={sceneGraphRef.current}>
      {children}
    </SceneGraphContext.Provider>
  );
}

export function useSceneGraph(): SceneGraph {
  const sceneGraph = useContext(SceneGraphContext);
  if (!sceneGraph) {
    throw new Error('useSceneGraph must be used within a SceneGraphProvider');
  }
  return sceneGraph;
}
```

The `SceneGraph` class lives in `@quar/core`. The `SceneGraphProvider` lives in `apps/web`. React components call `useSceneGraph()` to get the instance, but the instance itself knows nothing about React. This means the entire scene graph, rendering pipeline, tool system, and math layer can be tested without JSDOM, without React Testing Library, and without any UI framework at all.

This boundary paid off in three concrete ways:

1. **Test speed.** The 1,606 tests in `@quar/core` run against pure TypeScript classes. No component mounting, no store initialization, no DOM simulation. They complete in seconds.

2. **Reuse potential.** The same `@quar/core` package could drive a Node.js CLI for batch SVG processing, a headless animation renderer, or a different UI framework entirely. Nothing in the math, scene graph, or tool system assumes a browser.

3. **Import discipline.** When a developer accidentally imports a React hook into a core module, the TypeScript compiler fails immediately — React isn't in the dependency graph. This catches architectural violations at compile time, not in code review.

## Decision 2: A Shared Types Package

The `@quar/types` package contains only TypeScript interfaces and type aliases. It has no runtime code, no dependencies, and no build step:

```json
{
  "name": "@quar/types",
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

Every other package depends on it:

```typescript
// packages/types/src/index.ts

export interface Vector2 {
  x: number;
  y: number;
}

export interface Matrix3 {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface Color {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface Transform {
  position: Vector2;
  rotation: number; // Degrees
  scale: Vector2;
  anchor: Vector2; // 0-1 normalized
  skew: Vector2;
}

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
  exports?: ExportSetting[];
}
```

The file continues for 350+ lines, defining every node type (`RectangleNode`, `EllipseNode`, `PathNode`, `BoneNode`, `ArtboardNode`, etc.), every effect type, every fill and stroke variant, and every animation type. All in one package that every other package can import without pulling in any runtime code.

The alternative — defining types alongside their implementations — creates circular dependency pressure. The animation package needs to know about `PathPoint` to interpolate shape tweens. The core package needs to know about `Keyframe` to evaluate property bindings. If each package defines its own types, either they duplicate definitions or they create import cycles. A dedicated types package eliminates both problems. Every package imports from `@quar/types` and never from each other's internal type definitions.

The types package also serves as a contract. When a new node type is added (like `ArtboardNode` in Sprint X), the type definition goes into `@quar/types` first. Then every package that handles nodes — the scene graph, the renderer, the selection manager, the serializer — can be updated to handle the new type. TypeScript's exhaustive checking (`switch` statements on `node.type`) catches any package that forgets to add a case.

## Decision 3: Pure Functions for All Math and Algorithms

Every mathematical operation in the editor is a pure function. No class instances, no internal state, no side effects:

```typescript
// packages/core/src/math.ts

export const vec2 = {
  create(x = 0, y = 0): Vector2 {
    return { x, y };
  },

  add(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  normalize(v: Vector2): Vector2 {
    const len = vec2.length(v);
    if (len < EPSILON) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  distance(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  },
};
```

The `mat3` namespace follows the same pattern — every function takes inputs and returns a new value without modifying its arguments:

```typescript
export const mat3 = {
  multiply(a: Matrix3, b: Matrix3): Matrix3 {
    return {
      a: a.a * b.a + a.c * b.b,
      b: a.b * b.a + a.d * b.b,
      c: a.a * b.c + a.c * b.d,
      d: a.b * b.c + a.d * b.d,
      tx: a.a * b.tx + a.c * b.ty + a.tx,
      ty: a.b * b.tx + a.d * b.ty + a.ty,
    };
  },

  invert(m: Matrix3): Matrix3 | null {
    const det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) < EPSILON) return null;
    const invDet = 1 / det;
    return {
      a: m.d * invDet,
      b: -m.b * invDet,
      c: -m.c * invDet,
      d: m.a * invDet,
      tx: (m.c * m.ty - m.d * m.tx) * invDet,
      ty: (m.b * m.tx - m.a * m.ty) * invDet,
    };
  },

  compose(
    position: Vector2,
    rotation: number,
    scale: Vector2,
    anchor: Vector2 = { x: 0, y: 0 }
  ): Matrix3 {
    const rad = rotation * (Math.PI / 180);
    let m = mat3.identity();
    m = mat3.translate(m, position.x, position.y);
    m = mat3.rotate(m, rad);
    m = mat3.scale(m, scale.x, scale.y);
    m = mat3.translate(m, -anchor.x, -anchor.y);
    return m;
  },
};
```

This pattern extends far beyond basic math. Bezier curve evaluation, path tessellation, boolean operations, easing functions, symbol resolution, shape tweening, IK solving, CPU skinning — all are pure functions that take data in and return data out.

Easing functions are the purest example:

```typescript
// packages/animation/src/Easing.ts

const easeInQuad = (t: number): number => t * t;
const easeOutQuad = (t: number): number => t * (2 - t);
const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

const easeInCubic = (t: number): number => t * t * t;
const easeOutCubic = (t: number): number => (t - 1) * (t - 1) * (t - 1) + 1;
```

A number goes in. A number comes out. No state, no context, no dependencies. The function is its own specification.

Boolean operations follow the same discipline, even though they orchestrate complex multi-step algorithms:

```typescript
// packages/core/src/boolean/booleanOps.ts

export function nodeToPolygon(
  node: Node,
  worldTransform: Matrix3,
  tolerance: number = 1.0
): MultiPolygon | null {
  // Pure: takes a node and transform, returns polygon data
  // No scene graph queries, no side effects
}
```

The benefits compound over time:

- **Testability.** Pure functions need no setup — call with arguments, assert on the return value. The 1,606 tests in `@quar/core` run fast because most of them are testing pure functions.
- **Composability.** `mat3.compose` calls `mat3.translate`, `mat3.rotate`, and `mat3.scale`. Each can be tested independently. Together they form the world transform computation used by every rendering and hit-testing operation.
- **Cacheability.** The symbol resolver caches results keyed by `symbolId + overrides` — it can do this because the function is pure. Same inputs always produce same outputs. Memoization works without invalidation concerns.
- **Debuggability.** When a transform is wrong, you can log the inputs to `mat3.compose` and reproduce the issue in a test. No hidden state to reconstruct, no sequence of method calls to replay.

## Decision 4: Scene Graph as the Single Source of Truth

The editor has one canonical representation of the document: the `SceneGraph` instance. Not the GPU buffers. Not the DOM. Not the Zustand store. The scene graph:

```typescript
// packages/core/src/SceneGraph.ts

export class SceneGraph {
  private nodes: Map<string, Node> = new Map();
  private rootNodeIds: string[] = [];
  private worldTransformCache: Map<string, Matrix3> = new Map();
  private listeners: Map<SceneGraphEventType, Set<EventCallback>> = new Map();
```

Every operation that modifies the document goes through the scene graph's API:

```typescript
  addNode(node: Node, parentId?: string): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id "${node.id}" already exists`);
    }
    this.nodes.set(node.id, node);
    if (parentId) {
      const parent = this.nodes.get(parentId);
      if (!parent) throw new Error(`Parent node "${parentId}" not found`);
      node.parent = parentId;
      parent.children.push(node.id);
    } else {
      node.parent = null;
      this.rootNodeIds.push(node.id);
    }
    this.invalidateWorldTransform(node.id);
    this.emit({ type: 'nodeAdded', nodeId: node.id, parentId });
  }

  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const children = [...node.children];
    for (const childId of children) {
      this.removeNode(childId);
    }
    // ... remove from parent, delete from map, emit event
  }

  updateNode(id: string, updates: Partial<Node>): void {
    const node = this.nodes.get(id);
    if (!node) return;
    Object.assign(node, updates);
    if ('transform' in updates) {
      this.invalidateWorldTransform(id);
    }
    this.emit({ type: 'nodeChanged', nodeId: id });
  }
```

The scene graph owns traversal, parent-child relationships, world transform computation with caching, and serialization:

```typescript
  getWorldTransform(id: string): Matrix3 {
    const cached = this.worldTransformCache.get(id);
    if (cached) return cached;

    const node = this.nodes.get(id);
    if (!node) return mat3.identity();

    const localMatrix = this.computeLocalMatrix(node.transform);
    let worldMatrix: Matrix3;
    if (node.parent) {
      const parentWorld = this.getWorldTransform(node.parent);
      worldMatrix = mat3.multiply(parentWorld, localMatrix);
    } else {
      worldMatrix = localMatrix;
    }

    this.worldTransformCache.set(id, worldMatrix);
    return worldMatrix;
  }
```

World transforms are cached and invalidated recursively when any transform in the chain changes:

```typescript
  private invalidateWorldTransform(id: string): void {
    this.worldTransformCache.delete(id);
    const node = this.nodes.get(id);
    if (node) {
      for (const childId of node.children) {
        this.invalidateWorldTransform(childId);
      }
    }
  }
```

The scene graph also provides serialization — the only way to save and restore the document:

```typescript
  toJSON(): { nodes: Node[]; rootNodeIds: string[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      rootNodeIds: [...this.rootNodeIds],
    };
  }

  fromJSON(data: { nodes: Node[]; rootNodeIds: string[] }): void {
    // Parse into temp map — validate before destroying current state
    const newNodes = new Map<string, Node>();
    for (const node of data.nodes) {
      if (!node || typeof node.id !== 'string' || node.id.length === 0) {
        continue; // Skip invalid nodes
      }
      this.migrateNodeFillsStrokes(node);
      newNodes.set(node.id, node);
    }

    // Validate parent references
    for (const [, node] of newNodes) {
      if (node.parent && !newNodes.has(node.parent)) {
        node.parent = null;
      }
    }

    // Atomic swap — only after successful parsing
    this.nodes = newNodes;
    this.rootNodeIds = data.rootNodeIds.filter((id) => newNodes.has(id));
    this.worldTransformCache.clear();
  }
```

The `fromJSON` method validates the incoming data, migrates legacy fields, fixes orphan references, and only then swaps the internal state — an atomic operation that either succeeds completely or leaves the previous state intact.

The event system notifies subscribers of changes without coupling the scene graph to any specific consumer:

```typescript
  on(type: SceneGraphEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => {
      const set = this.listeners.get(type);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(type);
      }
    };
  }
```

The renderer listens for changes to know when to re-tessellate. The store listens to synchronize selection state. The export system reads the scene graph to generate output frames. None of them own the data — they all read from the same source.

This single-source-of-truth design eliminated an entire class of bugs: state synchronization errors. There's no "the GPU thinks the rectangle is at (100, 200) but the scene graph thinks it's at (100, 300)." The GPU reads from the scene graph every frame. The properties panel reads from the scene graph on every render. The selection overlay reads from the scene graph to compute handle positions. If the scene graph is correct, everything downstream is correct.

## Decision 5: Snapshot-Based Undo

The undo system captures the entire scene graph as a JSON snapshot before each operation:

```typescript
// apps/web/src/stores/editorStore.ts

const MAX_UNDO_STACK_SIZE = 50;

interface HistorySnapshot {
  sceneData: { nodes: Node[]; rootNodeIds: string[] };
  selectedNodeIds: string[];
}
```

The `pushUndo` action captures the current state with `structuredClone` — a deep copy that breaks all references to the live scene graph:

```typescript
pushUndo: (sceneGraph: SceneGraphLike) => {
  const { undoStack, selectedNodeIds } = get();
  const snapshot: HistorySnapshot = {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(selectedNodeIds),
  };
  const newStack = [...undoStack, snapshot];
  if (newStack.length > MAX_UNDO_STACK_SIZE) {
    newStack.shift();
  }
  set({
    undoStack: newStack,
    redoStack: [],
    canUndo: true,
    canRedo: false,
  });
},
```

Undo pushes the current state to the redo stack, then restores the popped snapshot:

```typescript
undo: (sceneGraph: SceneGraphLike) => {
  const { undoStack, redoStack, selectedNodeIds } = get();
  if (undoStack.length === 0) return;

  // Save current state to redo stack
  const currentSnapshot: HistorySnapshot = {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(selectedNodeIds),
  };
  const newRedoStack = [...redoStack, currentSnapshot];

  // Pop and restore from undo stack
  const newUndoStack = [...undoStack];
  const snapshot = newUndoStack.pop()!;
  sceneGraph.fromJSON(structuredClone(snapshot.sceneData));

  set({
    undoStack: newUndoStack,
    redoStack: newRedoStack,
    canUndo: newUndoStack.length > 0,
    canRedo: true,
    selectedNodeIds: new Set(snapshot.selectedNodeIds),
    enteredGroupId: null,
    isDirty: true,
  });
},
```

Redo is the mirror image — push current to undo stack, pop from redo stack, restore.

This approach has one profound advantage over command-based undo: **it's impossible to have inconsistent state after an undo.** A command-based system (the Command pattern from the Gang of Four) requires every operation to implement both `execute()` and `undo()`. If the `undo()` implementation misses a side effect — say, it restores the node's position but forgets to restore its opacity — the scene graph ends up in a state that never existed. With snapshot undo, the restored state is exactly the state that existed before the operation, because it _is_ that state, serialized and deserialized.

The cost is memory. Each snapshot is a full copy of the scene graph. For a document with 500 nodes, each snapshot is roughly 50-100 KB of JSON. With a 50-entry stack, that's 2.5-5 MB of undo history — well within the memory budget of a modern browser tab. For the simplicity and correctness it buys, this is a trade worth making.

The design also simplifies the code at every call site. Every mutation follows the same pattern:

```typescript
// Before any discrete mutation
pushUndo(sceneGraph);

// Perform the mutation
sceneGraph.updateNode(id, { opacity: 0.5 });
// or: sceneGraph.removeNode(id);
// or: sceneGraph.addNode(newNode, parentId);
```

No need to create a `ChangeOpacityCommand` class with `execute` and `undo` methods. No need to track which properties changed. No need to implement reverse operations for complex mutations like boolean operations or group restructuring. Snapshot the scene graph before, mutate it however you want, and undo will restore the snapshot.

For continuous operations like dragging a shape, the snapshot is captured once at drag start (via the `onTransformStart` callback), not on every frame. The undo stack records where the shape was before the drag began, not every intermediate position.

## Decision 6: Zustand over Redux

The editor store uses Zustand, a minimal state management library:

```typescript
// apps/web/src/stores/editorStore.ts

export const useEditorStore = create<EditorStore>((set, get) => ({
  // State
  activeTool: 'selection',
  selectedNodeIds: new Set<string>(),
  currentFrame: 0,
  isPlaying: false,

  // Actions are just functions that call set()
  setActiveTool: (tool: ToolType) => set({ activeTool: tool }),

  enterGroup: (groupId: string) =>
    set({ enteredGroupId: groupId, selectedNodeIds: new Set<string>() }),

  exitGroup: () => set({ enteredGroupId: null }),
}));
```

The entire store is defined in a single `create` call. State and actions live together. There are no action creators, no reducers, no action types, no middleware configuration, no `dispatch` calls. A React component subscribes with a selector hook:

```typescript
const activeTool = useEditorStore((s) => s.activeTool);
const selectedIds = useEditorStore((s) => s.selectedNodeIds);
```

Actions are called directly:

```typescript
useEditorStore.getState().setActiveTool('pen');
```

This directness matters for a graphic editor. The render loop runs in `requestAnimationFrame`, outside React's render cycle. Redux would require dispatching actions and waiting for the reducer to produce new state. Zustand's `getState()` and `setState()` work synchronously from any context — RAF callbacks, pointer event handlers, async file operations:

```typescript
// Inside a requestAnimationFrame callback
const { currentFrame, isPlaying } = useEditorStore.getState();
if (isPlaying) {
  useEditorStore.setState({ currentFrame: nextFrame });
}
```

No dispatch. No action creator. No thunk. Read the state, compute the next value, write it back.

Zustand's subscription model also enables the ref-sync pattern described in the previous chapter. The ToolManager subscribes to store changes and copies values into refs, keeping the imperative tool system synchronized without React re-renders:

```typescript
useEditorStore.subscribe((state) => {
  toolManagerRef.current?.setOption('snapToGrid', state.snapToGrid);
  toolManagerRef.current?.setOption('gridSize', state.gridSize);
});
```

The store file is large — over 3,000 lines — but it's a single, greppable file. Every piece of editor state, every action, every derived computation lives in one place. When you need to understand what happens when the user presses Delete, you search for `deleteSelection` in one file. When you need to add a new piece of state (like `timelineViewMode` for the graph editor), you add a field and an action in the same file. There's no ceremony, no boilerplate, no indirection through action types and reducer switches.

Redux's strengths — time-travel debugging, middleware pipelines, action logging — are less valuable in a graphic editor than they are in a form-heavy web application. The editor already has time-travel via snapshot undo. Middleware pipelines aren't needed because most actions are direct state mutations. And action logging is less useful when the interesting events are pointer coordinates at 60fps, not form submissions.

## Decision 7: CSS Custom Properties for Design Tokens

The entire visual theme is defined as CSS custom properties in a single file:

```css
/* apps/web/src/styles/globals.css */

:root {
  /* Colors - Background */
  --color-bg-primary: #0a0a0b;
  --color-bg-secondary: #111113;
  --color-bg-tertiary: #18181b;
  --color-bg-elevated: #1f1f23;
  --color-bg-hover: rgba(255, 255, 255, 0.04);
  --color-bg-active: rgba(255, 255, 255, 0.08);

  /* Colors - Text */
  --color-text-primary: #fafaf9;
  --color-text-secondary: #a1a1aa;
  --color-text-tertiary: #71717a;
  --color-text-disabled: #3f3f46;

  /* Colors - Accent */
  --color-accent-primary: #a855f7;
  --color-accent-primary-hover: #c084fc;
  --color-accent-primary-active: #9333ea;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;

  /* Typography */
  --font-family-ui: 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-family-mono: 'IBM Plex Mono', 'SF Mono', 'Consolas', monospace;
  --font-size-xs: 10px;
  --font-size-sm: 11px;
  --font-size-md: 13px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25);

  /* Animation */
  --duration-fast: 120ms;
  --duration-normal: 200ms;
  --easing-default: cubic-bezier(0.2, 0, 0, 1);

  /* Z-index scale */
  --z-overlay: 1000;
  --z-context-menu: 1010;
  --z-popover: 1020;
  --z-modal: 1030;
  --z-color-picker: 1040;
  --z-tooltip: 1050;
}
```

Components consume these variables directly:

```css
.panel-header {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-family: var(--font-family-ui);
  font-size: var(--font-size-sm);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border-default);
}
```

The alternative was CSS-in-JS — styled-components, Emotion, or Stitches. We chose CSS custom properties for three reasons:

**Zero runtime cost.** CSS custom properties are resolved by the browser's CSS engine, not by JavaScript. There's no runtime overhead for reading a variable, no style recalculation triggered by a JavaScript library, no serialization of styles into the DOM. In a graphic editor where every millisecond of frame time matters, eliminating a JavaScript style engine from the critical path is valuable.

**Instant theme switching.** To switch from dark theme to light theme, you reassign the variables on `:root`. Every component updates simultaneously in a single browser style recalculation. CSS-in-JS libraries achieve the same result by re-rendering every styled component — which can cause a visible flash as React reconciles hundreds of components.

**DevTools transparency.** CSS custom properties are visible in the browser's DevTools Elements panel. You can see exactly which variable a color resolves to, change it live, and see the result instantly. CSS-in-JS generates class names like `.sc-bdVTJa` that require source maps to trace back to the component that created them.

The z-index scale deserves special mention. Without a central scale, z-index values accumulate organically — someone adds `z-index: 999` to fix an overlap, then someone else adds `z-index: 9999` to fix another. The CSS variable scale establishes a hierarchy: overlays < context menus < popovers < modals < color pickers < tooltips. Every component uses the variable, not a magic number. When a new layer is needed (the color picker needed to appear above modals but below tooltips), it gets a slot in the scale, and every component that uses the scale respects the new ordering automatically.

## Decision 8: Test Each Sprint Before Moving On

This isn't a code architecture decision — it's a process decision that shaped the code architecture. Every sprint ended with tests before the next sprint began. Sprint 3 (Canvas Foundation) shipped with 310 tests. Sprint 4 (Vector Drawing) added tool tests and reached 622. By Sprint 12, the count was 1,317. By Sprint 26, it was 3,273.

The rule was simple: no sprint is complete until its features have tests. Not 100% coverage — that would slow progress to a crawl. But the core algorithms, the tool behaviors, the component interactions, and the store actions all get tests before the sprint is marked done.

This had a compounding effect on architecture. Features that are hard to test get refactored until they're testable. The reason the math layer is pure functions is partly because pure functions are trivially testable. The reason the scene graph has `toJSON`/`fromJSON` is partly because snapshot undo needs it — but also because tests need to set up complex node hierarchies quickly. The reason tools accept a `ToolContext` interface is partly for dependency injection — but also because tests can provide a mock context without a real canvas.

The test suite also served as a regression safety net that enabled aggressive refactoring. When GPU skinning (Sprint 16) replaced CPU rendering for fills, the existing tests caught three regressions that would have been invisible without them. When the easing convention changed from outgoing to incoming (the easing fix), the 101 easing tests confirmed that all 30 easing functions still satisfied their boundary conditions.

The cost was real — writing tests takes time, and some sprints spent 30-40% of their effort on testing. But the payoff was also real: later sprints built on a foundation they could trust. Sprint 22 (Symbols) added a new node type that flowed through the entire pipeline — scene graph, renderer, selection, serialization, tools. Without the existing test suite catching regressions, adding a new node type would have been a week of manual testing instead of an afternoon of writing targeted tests.

## Decisions We'd Reconsider

Honesty requires acknowledging decisions that worked but might not be optimal:

**Single store file.** The editor store grew to over 3,000 lines. Zustand supports splitting stores with `create` slices, and the store would benefit from being split into logical sections (tool state, timeline state, undo state, page state, rigging state). The single file is greppable but increasingly hard to navigate.

**SceneGraph as a class.** The scene graph is the only non-pure-function core abstraction. A functional approach — where the scene graph is a plain data structure and operations are functions that return new scene graphs — would align better with the snapshot undo system and make the code more testable. The class approach was chosen for performance (mutating a Map is faster than copying one), but the performance difference likely doesn't matter for documents under 10,000 nodes.

**No asset pipeline.** Images are stored as data URIs in the scene graph (extracted to binary buffers in the `.quar` format). A proper asset pipeline with content-addressable storage, lazy loading, and thumbnail generation would reduce memory usage for image-heavy documents. The current approach is simple but doesn't scale to documents with hundreds of high-resolution images.

**Manual WebGL.** The rendering pipeline uses raw WebGL 2 calls with a thin state-caching wrapper. A library like regl or twgl would have reduced the surface area for bugs like the VAO cache desync and the clearColor state leak. We chose raw WebGL for maximum control and zero dependencies, but the bugs described in the WebGL chapter suggest that the abstraction layer we built by hand is the same one a library would have provided — just with fewer eyes on the code.

These aren't regrets — every decision was reasonable given the constraints at the time. But a second implementation would weigh these trade-offs differently.

## Lessons

**Enforce package boundaries at the dependency level.** Don't rely on code review to catch architectural violations. If `@quar/core` shouldn't import React, make sure React isn't in its `package.json`. The TypeScript compiler will reject the import, and the violation is caught at build time, not in a pull request. pnpm's strict hoisting makes this enforcement even stronger — a package can't accidentally use a dependency that's installed by a sibling.

**Pure functions are the best unit of software.** They're trivially testable (no setup, no teardown, no mocks). They're composable (pipe the output of one into the input of another). They're cacheable (same inputs always produce same outputs). They're debuggable (log the arguments, reproduce the issue in isolation). Build as much of the system as possible from pure functions, and reserve classes for the few things that genuinely need encapsulated state — like the scene graph and the renderer.

**A single source of truth eliminates synchronization bugs.** When the scene graph is the only representation of the document, there's no possibility of the renderer, the properties panel, and the selection overlay disagreeing about where a shape is. Every consumer reads from the same source. The scene graph's event system notifies consumers of changes, but the data flows in one direction: from the scene graph outward.

**Snapshot undo trades memory for correctness.** Command-based undo is more memory-efficient but requires every operation to correctly implement its reverse. Snapshot undo requires no reverse implementations — the restored state is the actual state that existed before the operation, deep-cloned and preserved. For a graphic editor where operations include complex boolean geometry, group restructuring, and bone hierarchy manipulation, correctness is worth more than the memory savings.

**Choose state management for the access patterns, not the ecosystem.** Redux is excellent for applications with complex middleware needs, action logging, and time-travel debugging. Zustand is excellent for applications that need synchronous state access from imperative code — exactly the pattern a graphic editor requires. The render loop, the tool system, and async file operations all need to read and write state outside React's render cycle. Zustand's `getState()` and `setState()` serve these patterns directly.

**CSS custom properties are design tokens that the browser understands.** They have zero runtime cost, instant theme switching, full DevTools visibility, and they work without a build step. For a dark-theme-default application with a fixed visual language, they provide everything a CSS-in-JS library would — without the JavaScript overhead.

## What We Built

This chapter examined the architectural decisions that shaped a graphic editor across twenty-six sprints, and the reasoning behind each choice:

- **A pnpm monorepo with strict package boundaries** keeps the core engine (math, scene graph, tools, rendering) free of framework dependencies, enabling fast testing, reuse potential, and compile-time enforcement of the architecture.
- **A dedicated types package** provides shared TypeScript interfaces to every other package without creating circular dependencies, and TypeScript's exhaustive checking catches unhandled node types at compile time.
- **Pure functions for all math and algorithms** deliver testability (no setup needed), composability (pipe outputs to inputs), cacheability (same inputs produce same outputs), and debuggability (log arguments, reproduce in isolation).
- **The scene graph as the single source of truth** eliminates state synchronization bugs — the renderer, properties panel, and selection overlay all read from the same canonical data, and changes flow outward through an event system.
- **Snapshot-based undo** trades memory for correctness, using `structuredClone` to capture the entire scene graph before each operation, making it impossible for undo to produce an inconsistent state.
- **Zustand over Redux** provides synchronous `getState()` and `setState()` for the RAF loop, tool system, and async callbacks, eliminating the dispatch ceremony that a graphic editor's imperative patterns don't need.
- **CSS custom properties** serve as zero-runtime-cost design tokens with instant theme switching, full DevTools visibility, and a centralized z-index scale that prevents layering conflicts.

This is the final content chapter of the book. The appendices that follow provide reference material — a complete keyboard shortcut table, a node type reference, the WebGL shader source code, the file format specification, and a project setup checklist. But the story of building a graphic editor ends here, with the same observation it began with: the hard part isn't any single algorithm or feature. It's the architecture that lets hundreds of features coexist without interfering with each other. Get the boundaries right, keep the functions pure, maintain a single source of truth, and the features will follow.
