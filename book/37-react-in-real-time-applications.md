# React in Real-Time Applications

## Declarative UI Meets Imperative Rendering

React was designed for UI — forms, lists, modals, buttons. It renders declaratively: you describe what the screen should look like, and React figures out the minimal DOM mutations to get there. This model works beautifully for the Properties Panel, the Layer Panel, the Timeline, the Toolbar. But the canvas — the 60fps WebGL render loop that draws shapes, handles pointer events, evaluates IK chains, steps physics, and composites effects — operates in a fundamentally different paradigm. It's imperative, frame-driven, and latency-sensitive. It reads state continuously, not in response to events. It creates GPU resources that must be explicitly freed. It runs inside `requestAnimationFrame`, outside React's render cycle.

Making these two worlds coexist requires specific adaptations. React's rules — hooks must be called in the same order every render, effects run twice in StrictMode, synthetic events are passive by default, closures capture state at render time — interact with real-time rendering in ways that produce silent failures. A hook called after an early return crashes the app. A WebGL resource created during render leaks when StrictMode double-invokes the component. A wheel handler attached via React's `onWheel` can't prevent the browser's native zoom. A `useMemo` that reads `getState()` shows stale data until something else triggers a re-render. Each of these failures is silent: no error message, no exception, just a visual glitch or a behavior that doesn't match what the code says.

## The Hooks Ordering Constraint

React requires that hooks are called in the same order on every render. You cannot call a hook after a conditional return. This rule exists because React identifies hooks by their call order — the first `useState` on render N must correspond to the first `useState` on render N+1. If a conditional return skips a hook call, React's internal linked list of hook states gets misaligned, and every subsequent hook reads the wrong state.

In a graphic editor, components subscribe to many store values. The Properties Panel needs the selected node IDs, the current frame, the auto-keyframe flag, the timeline, the aspect ratio lock, the active tool, symbol definitions, IK chains, dynamic chains, and dozens of store actions. Each subscription is a `useEditorStore` hook call. The component also has early returns — if nothing is selected, it renders a placeholder. If the scene graph is empty, it returns null.

The rule: **all hook calls must come before any early return.**

The Canvas component demonstrates this with approximately forty selector hooks at the top:

```typescript
export function Canvas() {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const clipboard = useEditorStore((state) => state.clipboard);
  const copySelection = useEditorStore((state) => state.copySelection);
  const pasteClipboard = useEditorStore((state) => state.pasteClipboard);
  const duplicateSelection = useEditorStore((state) => state.duplicateSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const selectAll = useEditorStore((state) => state.selectAll);
  const groupSelection = useEditorStore((state) => state.groupSelection);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const bringForward = useEditorStore((state) => state.bringForward);
  const sendBackward = useEditorStore((state) => state.sendBackward);
  const bringToFront = useEditorStore((state) => state.bringToFront);
  const sendToBack = useEditorStore((state) => state.sendToBack);
  const booleanUnion = useEditorStore((state) => state.booleanUnion);
  // ... ~25 more selectors ...
  const createIKChain = useEditorStore((state) => state.createIKChain);
  const removeIKChain = useEditorStore((state) => state.removeIKChain);

  // Only after ALL hooks: refs, state, effects, early returns
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ...
```

The Properties Panel follows the same discipline — over thirty hooks before any derived state:

```typescript
export function PropertiesPanel() {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const aspectRatioLocked = useEditorStore((state) => state.aspectRatioLocked);
  const toggleAspectRatioLock = useEditorStore((state) => state.toggleAspectRatioLock);
  const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
  const currentFrame = useEditorStore((state) => state.currentFrame);
  const addKeyframeAtFrame = useEditorStore((state) => state.addKeyframeAtFrame);
  const removeKeyframeAtFrame = useEditorStore((state) => state.removeKeyframeAtFrame);
  const timeline = useEditorStore((state) => state.timeline);
  // ... 25 more selectors ...
  const symbols = useEditorStore((state) => state.symbols);

  // Only after ALL hooks: derive state
  const selectedId = selectedNodeIds.size > 0
    ? [...selectedNodeIds][0]
    : null;
  const node = selectedId ? sceneGraph.getNode(selectedId) : null;
```

Even small helper components follow the rule. A `LayerRowById` component that renders a single layer needs two store selectors and a scene graph lookup. The early return (when the node doesn't exist) comes after both hook calls:

```typescript
function LayerRowById({ nodeId, ... }) {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const enteredGroupId = useEditorStore((state) => state.enteredGroupId);

  const node = sceneGraph.getNode(nodeId);
  if (!node) return null;  // early return — AFTER all hooks
  // ...
}
```

The Timeline, Layer Panel, and every other component that subscribes to the store follows the same pattern: a block of hook calls at the top of the function, then derived state, then early returns, then effects, then JSX. The ordering constraint transforms component structure into a two-part pattern: hook declarations followed by everything else.

## StrictMode and Resource Creation

React's StrictMode runs every component's render function twice (in development) to catch side effects in rendering. It also runs every `useEffect` twice — mounting, unmounting, then mounting again — to verify that cleanup works correctly. This double-invocation is intentional: it exposes components that create resources during render without cleaning them up.

WebGL resources — renderers, shaders, textures, buffers, VAOs — are expensive to create and must be explicitly destroyed. If a component creates a `WebGLRenderer` during render, StrictMode's double-invocation creates two renderers, but only one is reachable. The first renderer leaks: its GPU resources are never freed, its context occupies one of the browser's limited WebGL context slots, and its event listeners remain attached to the canvas.

The rule: **create WebGL resources inside `useEffect`, never during render.** The effect's cleanup function destroys the resources when the component unmounts (or when StrictMode's double-invocation triggers the first cleanup).

The Canvas component declares all renderer objects as refs initialized to `null`:

```typescript
// Renderer refs (not state to avoid re-renders)
const rendererRef = useRef<WebGLRenderer | null>(null);
const gridRef = useRef<Grid | null>(null);
const cameraRef = useRef<Camera | null>(null);
const shapeRendererRef = useRef<ShapeRenderer | null>(null);
const onionSkinRendererRef = useRef<OnionSkinRenderer | null>(null);
const animationFrameRef = useRef<number>(0);
```

All creation happens inside a single `useEffect` with an empty dependency array:

```typescript
useEffect(() => {
  const canvas = canvasRef.current;
  const container = containerRef.current;
  if (!canvas || !container) return;

  try {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    rendererRef.current = renderer;

    const camera = new Camera({
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomSensitivity: ZOOM_SPEED,
    });
    cameraRef.current = camera;

    const grid = new Grid(renderer, { majorSpacing: 100, minorDivisions: 5 });
    gridRef.current = grid;

    const shapeRenderer = new ShapeRenderer(renderer);
    shapeRendererRef.current = shapeRenderer;

    const onionSkinRenderer = new OnionSkinRenderer(shapeRenderer);
    onionSkinRendererRef.current = onionSkinRenderer;

    // ... ResizeObserver setup, event subscriptions, RAF loop start ...

    // Cleanup: dispose everything on unmount
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      unsubscribe();
      grid.dispose();
      shapeRenderer.dispose();
      renderer.dispose();
    };
  } catch (error) {
    console.error('Failed to initialize WebGL:', error);
    return;
  }
}, []);
```

When StrictMode double-invokes this effect, the first cleanup runs before the second creation. The first renderer is disposed, its GPU resources are freed, and the refs are overwritten with the second instance. The second cleanup runs on actual unmount. No resources leak.

The same pattern appears in `usePlayback`, where the comment explicitly names StrictMode as the motivation:

```typescript
// Create controller + subscribe in one effect for StrictMode compatibility
useEffect(() => {
  const state = useEditorStore.getState();
  const ctrl = new PlaybackController({
    duration: state.timelineDuration,
    frameRate: state.frameRate,
    looping: state.isLooping,
    onFrameChange: (frame: number) => {
      useEditorStore.getState().setCurrentFrame(frame);
      applyAnimations(frame);
    },
  });
  controllerRef.current = ctrl;

  const unsub = useEditorStore.subscribe((curr, prev) => {
    // ... sync settings ...
  });

  return () => {
    unsub();
    ctrl.dispose();
    controllerRef.current = null;
  };
}, [applyAnimations]);
```

And in `useCanvasTools`, where the `ToolManager` is created inside `useEffect` with the camera as a dependency:

```typescript
useEffect(() => {
  if (!camera) return;

  const manager = new ToolManager({
    sceneGraph: sceneGraphRef.current,
    camera,
    getSelectedIds,
    // ... callbacks ...
  });

  manager.setActiveTool(activeToolRef.current);
  toolManagerRef.current = manager;

  return () => {
    manager.dispose();
    toolManagerRef.current = null;
  };
}, [camera]);
```

The `camera` dependency means the ToolManager is recreated when the camera changes (which happens once, when the WebGL initialization effect creates it). The cleanup sets the ref to `null`, preventing stale references.

Using refs instead of state for these objects is deliberate: storing a `WebGLRenderer` in `useState` would trigger a re-render every time the ref is set, and the renderer object would be included in React's state comparison logic. Refs don't trigger re-renders, and their `.current` property is mutable — exactly what you need for imperative resources that exist outside React's rendering model.

## The Passive Wheel Event Trap

React's synthetic `onWheel` event is passive by default in modern browsers. This means calling `e.preventDefault()` inside a React `onWheel` handler silently fails — the browser ignores it because the listener was registered as passive. The console may show a warning ("Unable to preventDefault inside passive event listener"), but the behavior is wrong: Ctrl+Scroll triggers the browser's native zoom instead of the editor's canvas zoom.

The fix is to bypass React's event system and attach a native wheel listener with `{ passive: false }`:

```typescript
const handleWheel = useCallback((e: WheelEvent) => {
  const camera = cameraRef.current;
  const canvas = canvasRef.current;
  if (!camera || !canvas) return;

  e.preventDefault(); // Works because listener is non-passive

  const rect = canvas.getBoundingClientRect();
  const screenPos: Vector2 = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };

  const zoomDelta = -e.deltaY;
  camera.zoomAt(screenPos, zoomDelta);
}, []);

// Attach wheel listener as non-passive
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  return () => canvas.removeEventListener('wheel', handleWheel);
}, [handleWheel]);
```

The canvas element in JSX has no `onWheel` prop. The native listener in the `useEffect` is the only wheel handler. The cleanup removes the listener on unmount.

This pattern appears in three places across the codebase:

**The canvas** uses it for zoom (Ctrl+Scroll zooms toward the cursor position, Shift+Scroll pans horizontally).

**The Graph Editor** uses the identical pattern for its own pan/zoom:

```typescript
container.addEventListener('wheel', handleWheel, { passive: false });
```

**Numeric inputs in the Properties Panel** use it for scroll-to-increment. When a numeric input is focused, scrolling up increments the value, scrolling down decrements it. This requires `preventDefault()` to stop the page from scrolling:

```typescript
function numericInputProps(getValue: () => number, onChange: (v: string) => void) {
  return {
    onKeyDown: (e) => handleNumericInputKeyDown(e, getValue(), onChange),
    ref: (el) => {
      if (!el) return;
      // Avoid duplicate listeners via a data attribute marker
      if ((el as Record<string, unknown>).__numWheel) return;
      (el as Record<string, unknown>).__numWheel = true;
      el.addEventListener(
        'wheel',
        (we: WheelEvent) => {
          if (document.activeElement !== el) return;
          we.preventDefault();
          const delta = (we.deltaY < 0 ? 1 : -1) * (we.shiftKey ? 10 : 1);
          onChange(String(getValue() + delta));
        },
        { passive: false }
      );
    },
  };
}
```

The `__numWheel` sentinel flag on the DOM element prevents duplicate listeners. React's ref callbacks fire on every render — without the sentinel, each render would add another wheel listener, and scrolling would apply the delta multiple times.

The ref callback pattern (returning an object with a `ref` function) is an alternative to `useRef` + `useEffect`. It's more concise for attaching native listeners to specific DOM elements, but it requires the deduplication guard.

## Global Keyboard Shortcuts via Native Listeners

React's `onKeyDown` event only fires when a React element has focus. For global keyboard shortcuts (V for Selection tool, P for Pen tool, Space for play/pause), the handler must fire regardless of what's focused — even if focus is on the canvas or on nothing at all.

The solution is `window.addEventListener('keydown', ...)` inside a `useEffect`:

```typescript
useEffect(() => {
  window.addEventListener('keydown', handleKeyDown);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}, [handleKeyDown]);
```

The `handleKeyDown` callback is wrapped in `useCallback` with stable dependencies, so the listener is reattached only when the callback identity changes — which in practice is never, because the dependencies are stable store actions.

Each global shortcut handler checks whether focus is in an input element:

```typescript
const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key !== 'g' && e.key !== 'G') return;
  const tag = (document.activeElement as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  if (e.shiftKey) {
    ungroupSelection(sceneGraph);
  } else {
    groupSelection(sceneGraph);
  }
};
```

Without the `activeElement` check, pressing "V" while typing in a text field would switch to the Selection tool and swallow the keystroke. The check ensures shortcuts only fire when no text input has focus.

## Refs as the Bridge Between React and RAF

The `requestAnimationFrame` render loop runs 60 times per second, outside React's render cycle. If it closes over React state (from `useState` or `useEditorStore` hooks), it captures whatever value was current when the effect created the loop function. State changes during the next render don't reach the RAF callback — it's reading a stale closure.

The solution is to bridge React's declarative world and the imperative RAF loop using refs. React state updates write to refs at the top of the component; the RAF loop reads from refs:

```typescript
// Keep preview node in a ref for the render loop
const previewNodeRef = useRef(previewNode);
previewNodeRef.current = previewNode;

// Keep selectedNodeIds in a ref for the render loop
const selectedNodeIdsRef = useRef(selectedNodeIds);
selectedNodeIdsRef.current = selectedNodeIds;
```

These two lines — declare a ref, update it on every render — are the complete synchronization mechanism. The RAF loop reads `selectedNodeIdsRef.current` and always gets the latest value:

```typescript
const render = () => {
  // ...
  shapeRenderer.render(
    sceneGraphRef.current,
    viewProjectionMatrix,
    selectedNodeIdsRef.current, // always current, never stale
    useEditorStore.getState().editingTextNodeId,
    morphOffsetsMap
  );
  animationFrameRef.current = requestAnimationFrame(render);
};
```

For store state that the RAF loop needs but the component doesn't render, `getState()` is the right choice. The render loop calls `useEditorStore.getState()` directly — not a hook, just a function call that returns the current store state:

```typescript
const render = () => {
  // ...

  // Read live store state (not stale closure)
  const {
    onionSkin,
    isPlaying: playing,
    timeline: tl,
    currentFrame: frame,
    timelineDuration: tlDuration,
  } = useEditorStore.getState();

  // IK evaluation
  const { ikChains, isPlaying: ikPlaying } = useEditorStore.getState();

  // Dynamic chains
  const {
    dynamicChains,
    globalWind,
    isPlaying: dcPlaying,
    currentFrame: dcFrame,
    frameRate: dcFrameRate,
  } = useEditorStore.getState();

  // Smart Bones
  const { smartBoneActions, smartBoneRecordingActionId } = useEditorStore.getState();

  // ...
};
```

Each `getState()` call is cheap — it returns the current state object, no subscription overhead. The RAF loop never subscribes to the store (which would trigger React re-renders at 60fps); it polls on demand.

## The Subscribe-to-Ref Pattern

For values consumed by the `ToolManager` (which lives in a ref, created in a `useEffect`), a different synchronization pattern is needed. The ToolManager can't read React hooks, and its callbacks can't close over hook values (they'd be stale). Instead, the hook initializes refs from `getState()` and keeps them fresh via a subscription:

```typescript
// Initial values from getState()
const autoKeyframeRef = useRef(useEditorStore.getState().autoKeyframe);
const addKeyframeAtFrameRef = useRef(useEditorStore.getState().addKeyframeAtFrame);
const currentFrameRef = useRef(useEditorStore.getState().currentFrame);
const snapToGridRef = useRef(useEditorStore.getState().snapToGrid);
const gridSizeRef = useRef(useEditorStore.getState().gridSize);

// Subscribe to store to keep refs fresh
useEffect(() => {
  return useEditorStore.subscribe((state) => {
    autoKeyframeRef.current = state.autoKeyframe;
    addKeyframeAtFrameRef.current = state.addKeyframeAtFrame;
    currentFrameRef.current = state.currentFrame;
    snapToGridRef.current = state.snapToGrid;
    gridSizeRef.current = state.gridSize;
  });
}, []);
```

The `subscribe` method runs the callback on every store change. The callback copies the latest values into refs. The ToolManager reads these refs during pointer events and gets current values.

This pattern is more precise than `getState()` in the RAF loop because it only runs when the store actually changes, not on every frame. It's appropriate for values that change infrequently (the user toggles snap-to-grid occasionally, not 60 times per second).

ToolManager options that need live state use a different approach — arrow-function callbacks that call `getState()` at invocation time:

```typescript
const manager = new ToolManager({
  getEnteredGroupId: () => useEditorStore.getState().enteredGroupId,
  setEnteredGroupId: (id: string | null) => {
    if (id === null) {
      useEditorStore.getState().exitGroup();
    } else {
      useEditorStore.getState().enterGroup(id);
    }
  },
  onEnterTextEdit: (nodeId: string) => {
    useEditorStore.getState().setEditingTextNodeId(nodeId);
  },
  getGuides: () => useEditorStore.getState().guides,
  getSnapToGuides: () => useEditorStore.getState().snapToGuides,
  getSymbolDefinitions: () => useEditorStore.getState().symbols,
});
```

Each callback is a tiny closure over `useEditorStore` (a module-level import, always stable). When the ToolManager calls `getEnteredGroupId()`, it executes `useEditorStore.getState().enteredGroupId` and gets the current value. No subscription, no ref, no stale closure — just a function that reads the store on demand.

## The getState() Anti-Pattern in Render

Using `getState()` inside render or `useMemo` is an anti-pattern. The value is read once and never updated by React's subscription system. The component only re-renders when its hook subscriptions change — and `getState()` is not a subscription.

An example of this anti-pattern in the codebase: the symbol editing banner reads `editingSymbolId` via `getState()` inside JSX:

```typescript
{useEditorStore.getState().editingSymbolId &&
  (() => {
    const symId = useEditorStore.getState().editingSymbolId!;
    const symDef = useEditorStore
      .getState()
      .symbols.find((s) => s.id === symId);
    return (
      <div data-testid="symbol-editing-banner">
        Editing Symbol: {symDef?.name ?? 'Unknown'}
      </div>
    );
  })()}
```

This banner doesn't update reactively when `editingSymbolId` changes. It only updates when some other subscribed state (like `selectedNodeIds`) triggers a re-render. The correct version would subscribe via a hook:

```typescript
const editingSymbolId = useEditorStore((state) => state.editingSymbolId);
const symbols = useEditorStore((state) => state.symbols);
```

The rule: **use `getState()` in event handlers, callbacks, and the RAF loop — never inside render, `useMemo`, or JSX.** Event handlers execute in response to user actions and need the current state at that moment. Render functions execute when React decides to re-render, and they need reactive subscriptions to trigger re-renders when state changes.

The `shouldKeyframe` helper demonstrates correct `getState()` usage — it's a standalone function called from event handlers, not from render:

```typescript
function shouldKeyframe(autoKeyframe: boolean, nodeId: string, property: string): boolean {
  if (autoKeyframe) return true;
  const { timeline } = useEditorStore.getState();
  if (!timeline) return false;
  const track = findTrack(timeline, nodeId, property);
  return track != null && track.keyframes.length > 0;
}
```

This function is called inside `onChange` handlers in the Properties Panel — not during render. The `getState()` reads the current timeline at the moment the user changes a property value. This is correct because the function needs the state at interaction time, not at render time.

## The Ref-as-Data, State-as-Signal Pattern

Some data needs to be shared between the RAF loop and React's render cycle, but updating it shouldn't cause unnecessary re-renders. The deformed bounds system demonstrates the pattern: the RAF loop computes bounds for skinned mesh nodes after IK evaluation, and the selection overlay needs those bounds to draw handles in the right place.

Storing the bounds in React state would trigger a re-render every frame (at 60fps during playback). Instead, the actual data lives in a ref, and a version counter in React state acts as an invalidation signal:

```typescript
// The data (ref — no re-renders)
const deformedBoundsRef = useRef(new Map<string, Rect>());
const deformedBoundsVersionRef = useRef(0);

// The signal (state — triggers re-render)
const [deformedBoundsVersion, setDeformedBoundsVersion] = useState(0);
```

The RAF loop updates the ref and only bumps the state counter when the bounds actually change:

```typescript
// Inside RAF render loop
if (newBounds.size > 0) {
  const prev = deformedBoundsRef.current;
  let changed = newBounds.size !== prev.size;
  if (!changed) {
    for (const [k, v] of newBounds) {
      const pv = prev.get(k);
      if (!pv || pv.x !== v.x || pv.y !== v.y || pv.width !== v.width || pv.height !== v.height) {
        changed = true;
        break;
      }
    }
  }
  if (changed) {
    deformedBoundsRef.current = newBounds;
    deformedBoundsVersionRef.current++;
    setDeformedBoundsVersion(deformedBoundsVersionRef.current);
  }
}
```

The `useMemo` for selection display depends on `deformedBoundsVersion`:

```typescript
const selectionDisplay = useMemo(() => {
  if (!sceneGraphRef.current || selectedNodeIds.size === 0) return null;

  for (const nodeId of selectedNodeIds) {
    const deformedRect = deformedBoundsRef.current.get(nodeId);
    if (deformedRect) {
      return { bounds: { rect: deformedRect, ... }, rotation: 0 };
    }
  }
  // ...
}, [selectedNodeIds, sceneGraphVersion, deformedBoundsVersion]);
```

When bounds change, the version counter increments, `useMemo` recomputes, and the selection overlay reads the latest bounds from the ref. When bounds don't change (the common case during idle), no re-render occurs.

This pattern — ref for data, state for invalidation — minimizes re-renders while keeping React's overlay in sync with the imperative render loop. The version counter is a one-way signal from imperative code to React: "something changed, please re-render."

## Native Pointer Events for Drag Operations

React's synthetic pointer events work for single interactions — clicks, hovers, context menus. But drag operations need to capture the pointer outside the originating element. When you start dragging a scrub label in the Properties Panel, the pointer moves across the timeline, the canvas, the toolbar — far outside the label element. React's `onPointerMove` on the label element wouldn't fire.

The `ScrubLabel` component uses React for the initial `onPointerDown`, then switches to native `document.addEventListener` for the drag:

```typescript
const handlePointerDown = useCallback(
  (e: React.PointerEvent) => {
    e.preventDefault();
    onScrubStart?.();
    startXRef.current = e.clientX;
    startValueRef.current = value;
    setIsScrubbing(true);
  },
  [value, onScrubStart]
);

useEffect(() => {
  if (!isScrubbing) return;

  const handlePointerMove = (e: PointerEvent) => {
    const dx = e.clientX - startXRef.current;
    const delta = dx * sensitivity;
    const newValue = Math.round(Math.min(max, Math.max(min, startValueRef.current + delta)));
    onChange(newValue);
  };

  const handlePointerUp = () => {
    setIsScrubbing(false);
  };

  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerUp);

  return () => {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
  };
}, [isScrubbing, sensitivity, min, max, onChange]);
```

The `isScrubbing` state drives the effect: when `pointerDown` sets it to `true`, the effect runs and attaches document-level listeners. When `pointerUp` sets it to `false`, the cleanup removes them. The starting position and value are in refs (`startXRef`, `startValueRef`), not state, so the `handlePointerMove` closure reads the correct initial values even though the effect is recreated on each scrub start.

## The SVG Overlay: React Over WebGL

The selection overlay — the blue rectangle with resize handles that appears when you select a shape — is a pure React SVG component layered on top of the WebGL canvas using CSS absolute positioning:

```typescript
export function SelectionOverlay({
  bounds,
  handles,
  handleSize = DEFAULT_HANDLE_SIZE,
  rotation = 0,
  onHandlePointerDown,
}: SelectionOverlayProps) {
  if (!bounds) return null;

  const { rect, center } = bounds;
  if (rect.width <= 0 || rect.height <= 0) return null;

  const halfHandle = handleSize / 2;
  const rotationTransform =
    rotation !== 0
      ? `rotate(${-rotation} ${center.x} ${center.y})`
      : undefined;

  return (
    <svg className={styles.overlay} data-testid="selection-overlay">
      <g transform={rotationTransform}>
        <rect
          className={styles.selectionBounds}
          x={rect.x} y={rect.y}
          width={rect.width} height={rect.height}
        />
        {handles
          .filter((h) => !h.position.startsWith('rotate-'))
          .map((handle) => (
            <rect
              key={handle.position}
              className={styles.handle}
              x={handle.screenPosition.x - halfHandle}
              y={handle.screenPosition.y - halfHandle}
              width={handleSize} height={handleSize}
              style={{ cursor: handle.cursor }}
              onPointerDown={(e) => onHandlePointerDown?.(handle, e)}
            />
          ))}
      </g>
    </svg>
  );
}
```

This component is purely declarative — it receives screen-space coordinates and renders SVG rectangles. It doesn't know about WebGL, the scene graph, or world coordinates. The coordinate transformation happens in `useMemo` blocks inside the Canvas component, triggered by a `cameraVersion` counter that increments whenever the camera pans or zooms:

```typescript
const screenBounds = useMemo(() => {
  if (!selectionBounds || !cameraRef.current) return null;
  const camera = cameraRef.current;
  // world → screen coordinate transform
  return { rect: { x: screenX, y: screenY, ... }, ... };
}, [selectionBounds, cameraVersion]);
```

The `cameraVersion` counter is bumped by the camera's `change` event (subscribed in the initialization `useEffect`). When the user pans or zooms, the counter increments, the `useMemo` recomputes screen coordinates, and the SVG overlay re-renders at the new position. This is React doing what it's good at — reactive updates in response to state changes — while the WebGL render loop independently redraws the canvas at 60fps.

The overlay doesn't flicker during zoom because the `useMemo` recomputation and React's re-render happen synchronously within the same browser frame as the camera change event. The WebGL canvas and the SVG overlay update together.

## Zustand setState from Async and RAF Contexts

Zustand's `setState` is safe to call from any context — event handlers, RAF callbacks, async functions, timeouts. Unlike React's `useState` setter (which batches updates within event handlers but can cause issues when called from external contexts in older React versions), Zustand's `setState` is a plain synchronous function that updates the store and notifies subscribers immediately.

The playback controller fires `onFrameChange` from inside `requestAnimationFrame`. It calls `getState()` to read the current store, then calls `setCurrentFrame` — a Zustand action:

```typescript
const ctrl = new PlaybackController({
  onFrameChange: (frame: number) => {
    useEditorStore.getState().setCurrentFrame(frame);
    applyAnimations(frame);
  },
});
```

This is safe because `getState()` always returns the current state (not a stale closure), and `setCurrentFrame` is a Zustand action that calls `set()` internally. The state update triggers subscribers (React hooks), which queue a React re-render for the next microtask.

Async contexts use the same pattern. After a file reader completes (SVG import, image paste), `setState` updates the selection directly:

```typescript
// After SVG import (inside FileReader.onload)
useEditorStore.setState({ selectedNodeIds: new Set([groupId]) });

// After image paste (inside Image.onload)
useEditorStore.setState({ selectedNodeIds: new Set([nodeId]) });
```

These calls happen outside any React component — there's no component instance, no hooks, no render cycle. `useEditorStore.setState()` is a module-level function that can be called from anywhere. The subscribers (components with `useEditorStore` hooks) re-render when the state changes.

## Zustand Selector Granularity

Zustand re-renders a component only when its selected slice of state changes. Each `useEditorStore((state) => state.foo)` call creates a subscription to `foo`. If `bar` changes but `foo` doesn't, the component doesn't re-render.

This is why the store selectors are per-value:

```typescript
const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
const currentFrame = useEditorStore((state) => state.currentFrame);
```

If you combined them into a single selector — `useEditorStore((state) => ({ selectedNodeIds: state.selectedNodeIds, autoKeyframe: state.autoKeyframe }))` — the component would re-render whenever _any_ selected value changes, because Zustand compares the selector's return value by reference, and the object literal creates a new reference every time.

The store's action pattern uses both `set()` forms strategically. Independent updates use the direct form:

```typescript
setActiveTool: (tool: ToolType) => set({ activeTool: tool }),
```

Updates that depend on previous state use the updater form:

```typescript
addToSelection: (id: string) =>
  set((state) => ({
    selectedNodeIds: new Set([...state.selectedNodeIds, id]),
    lastSelectedNodeId: id,
  })),
```

The updater form `set((state) => ...)` receives the current state as an argument, avoiding the stale closure issue that would arise from reading a captured `state` variable.

## Lessons

**All hooks must precede early returns.** React identifies hooks by call order. A conditional return that skips hook calls misaligns React's internal state tracking, corrupting every subsequent hook in the component. The pattern is: declare every hook at the top of the function body, derive conditional values from hook results, and only then branch on those values. This produces a distinctive two-part component structure — hook block followed by logic block.

**Create imperative resources in useEffect, never during render.** StrictMode double-invokes components and effects to catch side effects in rendering. WebGL resources created during render leak on the first invocation. Resources created in `useEffect` are cleaned up by the effect's return function. The cleanup runs on the first invocation's unmount, and the second invocation creates fresh resources. Use refs (not state) to hold these resources — state triggers re-renders, refs don't.

**Use native event listeners when React's synthetic events are insufficient.** React's `onWheel` is passive and can't `preventDefault`. React's `onKeyDown` only fires when a React element has focus. React's `onPointerMove` only fires when the pointer is over the element. For canvas zoom, global keyboard shortcuts, and drag operations, bypass React's event system with `addEventListener` inside `useEffect`, and remove the listener in the cleanup function.

**Bridge React and RAF via refs, not state.** The RAF loop runs outside React's render cycle. If it closes over hook values, it captures stale state. Two patterns keep it current: write React state into refs at the top of the component (the ref-sync pattern), and call `getState()` directly inside the RAF callback (the poll pattern). Use the ref-sync pattern for values that React renders; use the poll pattern for values that only the RAF loop needs.

**Never call getState() during render or inside useMemo.** These contexts run when React decides to re-render, and `getState()` is not a subscription — it reads the store once without registering for updates. The value goes stale until something else triggers a re-render. Use hook selectors (`useEditorStore((s) => s.foo)`) for values that affect JSX output. Reserve `getState()` for event handlers, callbacks, and the RAF loop — contexts that execute on demand and need the current state at that moment.

**Separate data from invalidation signals.** When the RAF loop produces data that React needs to render (like deformed mesh bounds), store the data in a ref and the invalidation signal in state. The ref holds the actual Map of bounds. The state holds a version counter. The RAF loop updates the ref and only bumps the counter when the data actually changes. `useMemo` depends on the counter, reads from the ref, and recomputes only when the signal fires. This minimizes re-renders while keeping the overlay in sync.

## What We Built

This chapter covered the adaptations required to make React work as the UI framework for a 60fps interactive graphic editor:

- **Hooks ordering discipline** places all `useEditorStore` selector calls before any early returns or conditional logic, preventing React's hook state tracking from becoming misaligned across renders.
- **StrictMode-safe resource creation** moves all WebGL renderer, camera, grid, and shape renderer initialization into `useEffect` with cleanup functions that dispose GPU resources, preventing leaks during StrictMode's double-invocation.
- **Non-passive wheel listeners** bypass React's synthetic `onWheel` (which is passive by default) with native `addEventListener('wheel', handler, { passive: false })`, enabling `preventDefault()` to block the browser's native Ctrl+Scroll zoom.
- **Refs as the RAF bridge** synchronize React state with the imperative render loop: the component writes hook values into refs on every render, and the RAF callback reads `ref.current` for always-current data or calls `getState()` directly for store values.
- **The subscribe-to-ref pattern** keeps ToolManager callbacks current by subscribing to the Zustand store and copying values into refs, avoiding stale closures in `useEffect`-created objects.
- **The ref-as-data, state-as-signal pattern** stores deformed mesh bounds in a ref and bumps a version counter in state only when bounds actually change, minimizing re-renders while keeping the selection overlay synchronized with the WebGL canvas.
- **Zustand's getState() and setState()** provide safe escape hatches for async callbacks (file readers, image decoders) and RAF callbacks that need current state without React subscriptions — but must never be used during render or inside `useMemo`.

The next chapter turns to testing — how to write and organize 3,000+ tests for visual software. From pure function testing of math and path operations to tool testing with mock pointer events, component testing with mocked stores, and the opentype.js mock pattern for JSDOM environments, testing a graphic editor requires strategies that differ fundamentally from testing a typical web application.
