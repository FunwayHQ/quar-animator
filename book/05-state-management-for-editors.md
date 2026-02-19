# State Management for Editors

## Why Editors Are Different

Most React state management advice comes from people building CRUD applications. A user fills in a form, clicks submit, the data goes to a server, and the UI refreshes. State is small, changes are infrequent, and the update path is straightforward: user action → API call → state update → render.

A graphic editor turns every one of those assumptions inside out.

State is enormous. Our editor store tracks the active tool, the selection set, the clipboard, brush settings, eraser settings, guide positions, work area boundaries, per-page undo/redo stacks, symbol definitions, gradient editing state, direct selection point indices — and that's just the store. The actual document data lives in the SceneGraph (Chapter 3), which has its own node tree with potentially thousands of nodes.

Changes are continuous. When a user drags a shape, the position updates sixty times per second. When they scrub a value label, every pixel of mouse movement triggers a state change. A CRUD app might do a few state updates per minute. An editor does thousands per second.

Many consumers care about different slices. The toolbar only cares about `activeTool`. The properties panel cares about the selected node's type and all its properties. The canvas cares about everything that affects rendering. If every state change triggers every component to re-render, you get a slideshow instead of a fluid editor.

And there's a requirement you never see in form-based apps: undo. Every mutation to the document must be reversible. You need snapshots of the entire state before each operation, and you need to restore them without corrupting anything.

These requirements rule out most popular state management patterns right away.

## Why Not Redux

Redux was designed for predictable state updates in web applications with well-defined action types. In an editor, this becomes a burden.

First, the action boilerplate. Every new property you add to a node type needs a new action type, a new action creator, and a new reducer case. Our store has over 100 actions. With Redux, that means 100 action type constants, 100 action creator functions, and a reducer with 100 `case` clauses — or splitting into dozens of reducer slices, which adds its own indirection.

Second, Redux encourages immutability at every level. For a CRUD form, that's fine. For an editor where a drag operation might update `transform.position.x` on three nodes per frame at 60fps, you'd be creating thousands of new objects per second through the reducer pipeline. The immutability tax is measurable.

Third, Redux actions are intentionally serializable — plain objects that can be logged, replayed, and time-traveled. That's elegant in theory, but for undo/redo it's the wrong abstraction. You don't want to reverse-replay a sequence of `SET_NODE_POSITION` actions to undo a move. You want to snapshot the entire document before the move and restore it. Snapshot-based undo is simpler, faster, and provably correct — but it doesn't fit the Redux mental model.

## Zustand: The Right Tool for Editors

We use Zustand, a minimal state management library that fits editor workloads. Here's the entire conceptual model:

```typescript
import { create } from 'zustand';

const useEditorStore = create<EditorStore>((set, get) => ({
  // State
  activeTool: 'selection',

  // Action
  setActiveTool: (tool: ToolType) => set({ activeTool: tool }),
}));
```

`create` returns a React hook. Call it in a component with a selector function, and the component re-renders only when the selected slice changes. Call it without a selector, and you get the full state (which you should almost never do in a component).

There's no provider, no context, no reducer, no action types, no dispatch. State and actions live in the same object. Actions have direct access to the current state via `get()` and can update any part of it via `set()`. This is exactly what an editor needs.

### The Store Interface

Our store interface is a single TypeScript interface with state fields and action methods side by side:

```typescript
export interface EditorStore {
  // Tool state
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  // Selection state
  selectedNodeIds: Set<string>;
  lastSelectedNodeId: string | null;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;

  // Undo/redo
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  pushUndo: (sceneGraph: SceneGraphLike) => void;
  undo: (sceneGraph: SceneGraphLike) => void;
  redo: (sceneGraph: SceneGraphLike) => void;

  // ... 100+ more fields and actions
}
```

This is large. Our real store interface is over 500 lines of type declarations. That sounds alarming, but consider the alternative: splitting it into a dozen smaller stores means every action that touches multiple concerns (a page switch touches pages, selection, undo stacks, entered group, clipboard) would need to coordinate across multiple stores. A single store means a single `set()` call can atomically update everything.

### State Categories

The store's state falls into a few categories:

**Tool and interaction state** changes constantly during editing. The active tool, whether the user is drawing, the entered group for Figma-style selection scoping:

```typescript
activeTool: 'selection',
setActiveTool: (tool: ToolType) => set({ activeTool: tool }),

enteredGroupId: null,
enterGroup: (groupId: string) =>
  set({ enteredGroupId: groupId, selectedNodeIds: new Set<string>() }),
exitGroup: () => set({ enteredGroupId: null }),
```

Notice that `enterGroup` clears the selection as a side effect. In a single store, this kind of coordinated update is trivial — one `set()` call updates both fields atomically. In a multi-store setup, you'd need to coordinate two stores, worrying about the brief moment when the group is entered but the selection hasn't cleared yet.

**Selection state** uses `Set<string>` rather than an array. This matters for performance: `isSelected` checks a Set with O(1) lookup, not an Array with O(n) scan. When you have 200 shapes and the user clicks one, you don't want to linear-search an array of 200 IDs.

```typescript
selectedNodeIds: new Set<string>(),
lastSelectedNodeId: null,

setSelection: (ids: string[]) =>
  set((state) => {
    const newSet = new Set(ids);
    // Clear gradient editing if the node is deselected
    const editingGradient =
      state.editingGradient && newSet.has(state.editingGradient.nodeId)
        ? state.editingGradient
        : null;
    return {
      selectedNodeIds: newSet,
      lastSelectedNodeId: ids.length > 0 ? ids[ids.length - 1] : null,
      editingGradient,
    };
  }),
```

The updater function form of `set` (taking a callback instead of a plain object) is useful when you need to read current state to compute the next state. Here, `setSelection` checks whether the currently-editing gradient node is still in the new selection set, and clears the gradient editing state if it isn't. This prevents a subtle bug: if you're editing a gradient and then select a different shape, the gradient editor should close.

**Default values and tool settings** persist across shape creation. When the user changes the default fill to red, the next rectangle they draw should be red:

```typescript
defaultFill: DEFAULT_FILL,
defaultStroke: DEFAULT_STROKE,
setDefaultFill: (fill: Fill) => set({ defaultFill: fill }),
setDefaultStroke: (stroke: Stroke) => set({ defaultStroke: stroke }),

brushSize: 5,
brushSmoothing: 50,
setBrushSize: (size: number) =>
  set({ brushSize: Math.max(1, Math.min(100, size)) }),
```

The `setBrushSize` setter clamps the value. This is defensive: instead of trusting every caller to validate, the store enforces bounds at the mutation point. Every path into the state goes through these setters, so the constraint can't be bypassed.

**Page state** tracks the multi-page document structure. Each page stores its own scene graph JSON, selection, and undo/redo stacks:

```typescript
export interface PageData {
  id: string;
  name: string;
  sceneGraphJSON: { nodes: Node[]; rootNodeIds: string[] };
  selectedNodeIds: string[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}
```

## The SceneGraph Gap

You'll notice the store doesn't contain the scene graph itself. The SceneGraph lives in a React ref (via `SceneGraphContext`, Chapter 3) because it's a mutable class instance with its own event system. The store holds _metadata about_ the document — which nodes are selected, what the undo history is — but not the document itself.

This creates an interesting pattern: many store actions need the SceneGraph as a parameter.

```typescript
pushUndo: (sceneGraph: SceneGraphLike) => void;
undo: (sceneGraph: SceneGraphLike) => void;
groupSelection: (sceneGraph: SceneGraphLike) => void;
deleteSelection: (sceneGraph: SceneGraphLike) => void;
copySelection: (sceneGraph: SceneGraphLike) => void;
```

Why not just store the SceneGraph reference in the store? Because the SceneGraph is stateful and mutated in place. It's not a value that changes via `set()` — it's a long-lived object that tools and renderers hold references to. Putting it in the store would mean every `sceneGraph.updateNode()` call should trigger a store update, which defeats the purpose of having the SceneGraph's own event system.

Instead, we define a minimal interface for what store actions need:

```typescript
export interface SceneGraphLike {
  getNode(id: string): Node | undefined;
  getRootNodes(): Node[];
  addNode(node: Node, parentId?: string): void;
  removeNode(id: string): void;
  updateNode(id: string, updates: Partial<Node>): void;
  moveNode(id: string, newParentId: string | null, index?: number): void;
  getDescendants(id: string): Node[];
  traverse(callback: (node: Node, depth: number) => boolean | void): void;
  getWorldTransform(id: string): Matrix3;
  toJSON(): { nodes: Node[]; rootNodeIds: string[] };
  fromJSON(data: { nodes: Node[]; rootNodeIds: string[] }): void;
}
```

This interface has two benefits. First, it documents exactly which SceneGraph capabilities store actions depend on. Second, it makes testing easier — you can pass a mock object that implements this interface without constructing a full SceneGraph.

## Reactive Selectors: The Key to Performance

The single most important pattern in the store is the selector:

```typescript
// Good: component re-renders only when activeTool changes
const activeTool = useEditorStore((state) => state.activeTool);

// Bad: component re-renders on ANY state change
const state = useEditorStore();
```

Zustand uses `Object.is` equality checking on selector results. If you select `state.activeTool` and the brush size changes, your component doesn't re-render because the string `'selection'` is still the same reference.

This is why every component in our editor subscribes to exactly the fields it needs:

```typescript
export function PropertiesPanel() {
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const aspectRatioLocked = useEditorStore((state) => state.aspectRatioLocked);
  const pushUndo = useEditorStore((state) => state.pushUndo);
  const activeTool = useEditorStore((state) => state.activeTool);
  const defaultFill = useEditorStore((state) => state.defaultFill);
  const defaultStroke = useEditorStore((state) => state.defaultStroke);
  const guides = useEditorStore((state) => state.guides);
  // ... 15 more selectors
```

Yes, that's a lot of `useEditorStore` calls. It looks verbose. But each one creates a precise subscription. When `brushSize` changes, none of these selectors fire because none of them select `brushSize`. The PropertiesPanel doesn't re-render.

Compare this to the pattern you'd see with React Context:

```typescript
// With React Context, this re-renders on ANY state change
const { selectedNodeIds, aspectRatioLocked, activeTool } = useEditorContext();
```

React Context has no selector mechanism. Every consumer re-renders when the context value changes, which means every state update re-renders every consumer. For an editor with dozens of consumers and thousands of updates per second, that's a death sentence for performance.

### The Set Equality Trap

There's a subtle gotcha with Set selectors:

```typescript
const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
```

If a store action creates a new `Set` with the same contents, `Object.is` returns false (it's a different object), so the component re-renders even though the selection hasn't meaningfully changed. We accept this trade-off because selection changes are infrequent compared to, say, drag-to-move position updates. If it became a problem, you'd add a custom equality function:

```typescript
const selectedNodeIds = useEditorStore(
  (state) => state.selectedNodeIds,
  (a, b) => a.size === b.size && [...a].every((id) => b.has(id))
);
```

We haven't needed this in practice.

## The getState() Trap

Zustand provides `useEditorStore.getState()` for reading state outside of React's render cycle. It returns the current snapshot — no subscription, no re-render. This is critical for event handlers that run at high frequency:

```typescript
// In useCanvasTools hook
const onTransformStart = useCallback(() => {
  useEditorStore.getState().pushUndo(sceneGraphRef.current);
}, []);
```

This is correct. `onTransformStart` fires once when the user starts dragging, and it needs the current `pushUndo` function. Since it's inside a `useCallback` with no dependencies, using a selector would capture a stale reference.

But `getState()` becomes a trap when used in render-time code:

```typescript
// BUG: this reads state once during render but never re-renders
function BadComponent() {
  const tool = useEditorStore.getState().activeTool;
  return <span>{tool}</span>;
}
```

This renders with the tool name at mount time and never updates. The `<span>` shows a stale value permanently. The fix is simple:

```typescript
// CORRECT: reactive subscription, re-renders when activeTool changes
function GoodComponent() {
  const tool = useEditorStore((state) => state.activeTool);
  return <span>{tool}</span>;
}
```

The rule: use reactive selectors in components and `useMemo`/`useCallback` dependency arrays. Use `getState()` in event handlers, `requestAnimationFrame` callbacks, and other imperative code that runs outside React's render cycle.

### The useRef Bridge

There's a middle ground for high-frequency code that needs both React reactivity and imperative access. The `useCanvasTools` hook demonstrates this pattern:

```typescript
// Subscribe reactively (component re-renders when activeTool changes)
const activeTool = useEditorStore((state) => state.activeTool);

// Mirror into a ref for stable callbacks
const activeToolRef = useRef(activeTool);
activeToolRef.current = activeTool;

// High-frequency refs that skip reactive rendering entirely
const snapToGridRef = useRef(useEditorStore.getState().snapToGrid);
const gridSizeRef = useRef(useEditorStore.getState().gridSize);

// Subscribe imperatively to keep refs fresh
useEffect(() => {
  return useEditorStore.subscribe((state) => {
    snapToGridRef.current = state.snapToGrid;
    gridSizeRef.current = state.gridSize;
  });
}, []);
```

For `activeTool`, we need both: the reactive value triggers ToolManager recreation when the tool changes, and the ref gives stable callbacks access to the current tool without recreating the callback.

For `snapToGrid` and `gridSize`, we skip reactive rendering entirely. These values don't affect the component's visual output — the useCanvasTools hook doesn't need to re-render when they change — it just needs the latest value when a pointer event arrives. The imperative `subscribe` keeps the refs fresh without triggering any React re-renders.

This pattern — reactive selector for things that affect render, imperative ref for things that affect event handlers — is the core technique for keeping a React editor responsive.

## Store Actions as the Mutation Path

Every modification to editor state goes through a store action. No component directly calls `set()` — they call named actions that encapsulate the mutation logic.

Simple actions are one-liners:

```typescript
setActiveTool: (tool: ToolType) => set({ activeTool: tool }),
toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
```

Complex actions coordinate multiple state changes and SceneGraph mutations:

```typescript
groupSelection: (sceneGraph: SceneGraphLike) => {
  const { selectedNodeIds } = get();
  if (selectedNodeIds.size < 2) return;

  // Snapshot for undo
  get().pushUndo(sceneGraph);

  // Flatten scene graph order, filter to selected IDs
  const orderedSelected: string[] = [];
  sceneGraph.traverse((node) => {
    if (selectedNodeIds.has(node.id)) {
      orderedSelected.push(node.id);
    }
  });
  if (orderedSelected.length < 2) return;

  // Find common parent
  const firstNode = sceneGraph.getNode(orderedSelected[0]!);
  if (!firstNode) return;
  const commonParent = orderedSelected.every((id) => {
    const n = sceneGraph.getNode(id);
    return n && n.parent === firstNode.parent;
  })
    ? firstNode.parent
    : null;

  // Create group, move children into it
  const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const group = createGroupNode(groupId, 'Group');
  sceneGraph.addNode(group, commonParent ?? undefined);

  for (const id of orderedSelected) {
    sceneGraph.moveNode(id, groupId);
  }

  // Update store atomically
  set({ selectedNodeIds: new Set([groupId]), isDirty: true });
},
```

This action does five things: validates, snapshots for undo, reads the scene graph, mutates the scene graph, and updates the store. All in one place, all in sequence. There's no action dispatch, no reducer, no middleware — just imperative code that reads the current state and makes the changes.

The `get().pushUndo(sceneGraph)` pattern at the start of destructive operations is the single undo rule: snapshot before you mutate. We'll cover this in detail in Chapter 18, but the pattern is visible here: every action that modifies the scene graph calls `pushUndo` first.

### Page Switching: The Hardest Action

The most complex store action is `switchPage`. It has to save the current page's state, load the target page's state, and clear all transient state — atomically:

```typescript
switchPage: (pageId: string, sceneGraph: SceneGraphLike) => {
  const state = get();
  if (pageId === state.activePageId) return;

  const targetPage = state.pages.find((p) => p.id === pageId);
  if (!targetPage) return;

  // Save current page state (immutable update)
  const updatedPages = state.pages.map((p) => {
    if (p.id !== state.activePageId) return p;
    return {
      ...p,
      sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
      selectedNodeIds: Array.from(state.selectedNodeIds),
      undoStack: state.undoStack,
      redoStack: state.redoStack,
    };
  });

  // Load target page into scene graph
  sceneGraph.fromJSON(structuredClone(targetPage.sceneGraphJSON));

  // Atomic state update — everything changes at once
  set({
    pages: updatedPages,
    activePageId: pageId,
    selectedNodeIds: new Set(targetPage.selectedNodeIds),
    undoStack: targetPage.undoStack,
    redoStack: targetPage.redoStack,
    canUndo: targetPage.undoStack.length > 0,
    canRedo: targetPage.redoStack.length > 0,
    enteredGroupId: null,
    clipboard: null,
    isDirty: true,
  });
},
```

Count the fields that change: pages, activePageId, selectedNodeIds, undoStack, redoStack, canUndo, canRedo, enteredGroupId, clipboard, isDirty. Ten fields in one `set()` call. With Redux, this would be ten separate actions or a god-action that does everything. With separate stores, it would be five coordinated updates across three stores. With Zustand, it's one object literal.

The `structuredClone` calls are critical. Without them, the saved page data would share references with the store's current state. Later mutations would silently corrupt the saved page's data. `structuredClone` creates a deep, independent copy. It's the same function we use for undo snapshots, and it's one of the most important functions in the entire editor.

## structuredClone: Your Best Friend

The `structuredClone` global function creates a deep copy of any structured-clonable value. It handles nested objects, arrays, `Set`s, `Map`s, `Date`s, `ArrayBuffer`s, and typed arrays. It does not handle functions, DOM nodes, or class instances — which is fine, because our serializable state doesn't contain those.

We use it everywhere:

**Undo snapshots:**

```typescript
pushUndo: (sceneGraph: SceneGraphLike) => {
  const snapshot: HistorySnapshot = {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(selectedNodeIds),
  };
  // ...
},
```

**Clipboard copies:**

```typescript
copySelection: (sceneGraph: SceneGraphLike) => {
  const { selectedNodeIds } = get();
  if (selectedNodeIds.size === 0) return;
  const clones: Node[] = [];
  for (const id of selectedNodeIds) {
    const node = sceneGraph.getNode(id);
    if (node) clones.push(structuredClone(node));
  }
  if (clones.length > 0) set({ clipboard: clones });
},
```

**Page saving:**

```typescript
sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
```

The alternative is writing custom deep-copy functions for every data type. We tried that early on and it was a constant source of bugs — miss one nested object, and you get shared-reference mutations that are nearly impossible to track down. `structuredClone` is slower than a custom copier (it doesn't know your object shape), but it's correct by default, and correctness matters more than micro-optimization in undo/redo code that runs once per user action.

One gotcha: `structuredClone` can't copy `Set` or `Map` instances into plain arrays. That's why `selectedNodeIds` in `HistorySnapshot` is stored as `string[]` (via `Array.from`) rather than `Set<string>`. The store converts back to a Set on restore:

```typescript
selectedNodeIds: new Set(snapshot.selectedNodeIds),
```

## Testing the Store

Zustand stores are testable without React. Import the store, call `setState` to set up initial conditions, call actions directly, and assert on the result:

```typescript
import { useEditorStore } from './editorStore';

describe('EditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      // ... reset all fields
    });
  });

  it('should set the active tool', () => {
    useEditorStore.getState().setActiveTool('pen');
    expect(useEditorStore.getState().activeTool).toBe('pen');
  });

  it('should toggle selection', () => {
    const store = useEditorStore.getState();
    store.toggleSelection('node-1');
    expect(useEditorStore.getState().selectedNodeIds.has('node-1')).toBe(true);

    store.toggleSelection('node-1');
    expect(useEditorStore.getState().selectedNodeIds.has('node-1')).toBe(false);
  });
});
```

No `renderHook`, no `act()`, no component tree. The store is just a JavaScript object with methods. For actions that need a SceneGraph, you pass a mock:

```typescript
it('should push undo snapshot', () => {
  const mockSceneGraph: SceneGraphLike = {
    toJSON: () => ({ nodes: [], rootNodeIds: [] }),
    fromJSON: vi.fn(),
    // ... other methods
  };

  useEditorStore.getState().pushUndo(mockSceneGraph);
  expect(useEditorStore.getState().undoStack.length).toBe(1);
  expect(useEditorStore.getState().canUndo).toBe(true);
});
```

The `SceneGraphLike` interface pays off here. You don't need to construct a real SceneGraph with WebGL dependencies and event systems. You pass an object with the methods the action actually calls, and the test runs in milliseconds.

## The Dirty Flag

A small but important pattern: the `isDirty` flag tracks whether the project has unsaved changes.

```typescript
isDirty: false,
markDirty: () => set({ isDirty: true }),
```

Every action that modifies the document sets `isDirty: true` in its `set()` call. The save action sets it to `false`. The title bar shows an asterisk when dirty. The browser's `beforeunload` handler warns the user if they try to close the tab with unsaved changes.

This is trivial to implement with Zustand — just add `isDirty: true` to every mutation's `set()` call. It would be much harder with Redux, where you'd either add it to every reducer case or write middleware to detect mutations.

## Serializing Editor State

When saving a project, we need to capture the full editor state — not just the scene graph, but guides, symbols, and per-page data. The `getEditorSnapshot` function in `useProjectActions` reads everything from the store:

```typescript
const getEditorSnapshot = useCallback(() => {
  const state = useEditorStore.getState();
  return {
    guides: state.guides,
    pages: state.pages,
    activePageId: state.activePageId,
    symbols: state.symbols,
  };
}, []);
```

This is `getState()` used correctly — in an imperative callback triggered by a user action (clicking Save), not during render. The snapshot captures exactly the fields that need to be persisted to disk. Transient state like `activeTool`, `isDrawing`, `clipboard`, and `enteredGroupId` is excluded.

The inverse — `applyEditorState` — takes the deserialized data and pushes it into the store:

```typescript
const applyEditorState = useCallback((state: Record<string, unknown>) => {
  useEditorStore.setState(state);
}, []);
```

One `setState` call with all the fields. Every subscribed component re-renders once with the new values. The scene graph is restored separately via `sceneGraph.fromJSON()`.

## What the Store Doesn't Hold

Not everything belongs in the store. A few categories of state live elsewhere:

**The SceneGraph** is a class instance in a React ref (Chapter 3). It has its own mutation methods, event system, and lifecycle. The store tracks _metadata about_ the document; the SceneGraph _is_ the document.

**The Camera** is a class instance in a React ref (Chapter 4). It updates at 60fps during pan/zoom and has its own event system. Putting camera state in the store would cause every zoom step to re-render every subscribed component.

**WebGL state** (shaders, textures, VAOs, framebuffers) lives in renderer class instances. These are GPU resources that can't be serialized or cloned.

**Transient tool state** (is the user mid-drag, where did the drag start, what's the current preview shape) lives in tool class instances and local React state (`useState` in `useCanvasTools`). This state exists for milliseconds and has no meaning outside the current interaction.

The principle: if state needs to survive a re-render, be persisted to disk, or be shared across unrelated components, it goes in the store. If state is transient, high-frequency, or tied to a specific subsystem's lifecycle, it lives in that subsystem.

## Lessons

**One big store beats many small stores for editors.** The number of cross-cutting concerns in an editor (page switch touches 14 fields across 7 concerns) makes store coordination a bigger problem than store size. Zustand's selector system handles the performance concern.

**Selectors are not optional.** Every component must subscribe to exactly the fields it needs. Subscribing to the entire store turns your editor into a slideshow. This is the single highest-impact performance pattern in the entire UI layer.

**`getState()` is for event handlers, not render.** If you read state during render without subscribing, you get stale values that never update. If you subscribe to state in an event handler, you get unnecessary re-renders and stale closures. Match the access pattern to the usage context.

**`structuredClone` everything you store for later.** Undo snapshots, clipboard contents, saved page data — if you'll read it after more mutations have happened, clone it at save time. Shared references between current state and saved state will produce bugs that are nearly impossible to reproduce because they depend on the exact sequence of mutations between save and restore.

**Actions belong in the store.** Don't scatter mutation logic across components. If three components can group nodes, the grouping logic should be one store action, not three component methods that each call `sceneGraph.addNode` and `set({ selectedNodeIds: ... })` independently.

**The store is the source of truth for editor metadata.** Which nodes are selected, what tool is active, what the undo history is — these are questions the store answers. The scene graph is the source of truth for document data. The camera is the source of truth for viewport state. Keeping these responsibilities separate means each system can optimize for its own access patterns.

## What We Built

This chapter covered the state management layer — about 800 lines in `editorStore.ts` that orchestrate every mutable aspect of the editor:

- **One Zustand store for the entire editor**: All state and mutations co-located, using standard immutable update patterns via `set()` and `get()`. No multi-store coordination overhead.
- **100+ actions**: Tool switching, selection CRUD, clipboard operations, keyframe management, page switching, undo/redo, guide management, symbol library — all co-located in one store.
- **Selector-based subscriptions**: Every component subscribes to exactly the fields it needs. No unnecessary re-renders from unrelated state changes.
- **`getState()` discipline**: Imperative access in event handlers and callbacks, reactive hooks in render. Mixing the two produces stale state or wasted renders.
- **`structuredClone` snapshots**: Undo history, clipboard, and page data all cloned at save time to prevent shared-reference mutation bugs.
- **Per-page state isolation**: Page switching saves the current page's scene graph, timeline, selection, and undo/redo stacks, then restores the target page's state. Fourteen fields across seven concerns, all in one atomic operation.
- **Dirty flag**: Tracks unsaved changes for the "save before closing?" prompt.
- **Serialization boundary**: `getEditorSnapshot` captures persistable state; transient state (active tool, drag state, clipboard) is excluded.

The next chapter drops from the React layer to the GPU layer — building a `WebGLRenderer` that manages the WebGL 2 context, caches state to avoid redundant GPU calls, compiles shaders, and handles context loss gracefully.
