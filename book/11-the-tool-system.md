# The Tool System

## Why Tools Need Architecture

A graphic editor is a collection of tools. Rectangle, ellipse, pen, brush, eraser, selection — each is a distinct interaction mode with its own mouse behavior, its own keyboard handling, its own cursor, its own visual feedback. At any moment, exactly one tool is active. When the user presses R, the rectangle tool takes over. When they press V, the selection tool does.

The naive approach is a switch statement. One giant `handlePointerDown` that checks which tool is active and branches accordingly. This works for two or three tools. By tool six, it's a nightmare. By tool fourteen, it's unmaintainable. Each tool has different state — the pen tool tracks an in-progress path, the selection tool tracks which handle is being dragged, the brush tool accumulates stroke points with pressure data. Stuffing all of this into one event handler produces a function that's responsible for everything and comprehensible for nothing.

This chapter builds a tool system that solves this problem with three parts: a `BaseTool` abstract class that defines the contract every tool must follow, a `ToolContext` interface that gives tools access to the editor without coupling them to it, and a `ToolManager` that routes events, manages tool switching, and handles keyboard shortcuts. Together they're about 520 lines — the framework that makes the rest of the editor's interaction possible.

## The Tool Contract

Every tool, regardless of what it does, must respond to three events: the user pressed the mouse button, the user moved the mouse, and the user released the mouse button. Some tools also respond to keyboard events. Some display a preview while the user is dragging. Some need to clean up when the user switches to a different tool.

The `BaseTool` abstract class encodes this contract:

```typescript
export abstract class BaseTool {
  abstract readonly type: ToolType;
  abstract readonly cursor: string;

  protected context: ToolContext;
  protected state: ToolState = {
    isActive: false,
    isDragging: false,
    startWorldPos: null,
    currentWorldPos: null,
  };

  constructor(context: ToolContext) {
    this.context = context;
  }

  // Must implement
  abstract onPointerDown(event: CanvasPointerEvent): void;
  abstract onPointerMove(event: CanvasPointerEvent): void;
  abstract onPointerUp(event: CanvasPointerEvent): void;

  // May implement
  onKeyDown?(event: KeyboardEvent): void;
  onKeyUp?(event: KeyboardEvent): void;
  onActivate?(): void;
  onDeactivate?(): void;
  getPreviewNode?(): Node | null;
}
```

The three pointer methods are abstract — every tool must implement them. The keyboard methods, lifecycle hooks, and preview method are optional, declared with `?`. This means TypeScript won't complain if a tool doesn't define them, but the tool manager can check and call them when they exist.

The `type` property is a string literal from a union type — `'selection' | 'rectangle' | 'ellipse' | 'pen' | ...` — that uniquely identifies the tool. The `cursor` property is a CSS cursor string that the canvas element displays when this tool is active. A crosshair for drawing tools, a default arrow for the selection tool, a grab hand for the pan tool.

### The Pointer Event

Tools receive `CanvasPointerEvent`, not the browser's native `PointerEvent`. The browser event contains screen-space pixel coordinates. The tool needs world-space coordinates — the position on the canvas accounting for zoom and pan. The canvas component performs this conversion before forwarding events:

```typescript
export interface CanvasPointerEvent {
  screenPosition: Vector2; // pixel coords relative to canvas element
  worldPosition: Vector2; // world coords after camera transform
  button: number; // 0=left, 1=middle, 2=right
  buttons: number; // bitmask of held buttons
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  pressure: number; // 0-1 for stylus, 0 for mouse
  timestamp: number;
  clickCount?: number; // 1=single, 2=double
}
```

Both screen and world positions are included because different tools need different coordinate spaces. Drawing tools use world coordinates to place shapes. The hand tool uses screen coordinates for panning — a 100-pixel drag should pan 100 pixels regardless of zoom level.

The modifier keys are included directly on the event rather than read from the keyboard state. This is important: when the user drags with Shift held, every move event carries `shiftKey: true`. If the user releases Shift mid-drag, subsequent events carry `shiftKey: false`. The tool sees the modifier state at the exact moment of each pointer event, not at some arbitrary sample time.

### Helper Methods

The base class provides helpers that most tools need:

```typescript
protected isConstrained(event: CanvasPointerEvent): boolean {
  return event.shiftKey;
}

protected isFromCenter(event: CanvasPointerEvent): boolean {
  return event.altKey;
}

protected isAdditive(event: CanvasPointerEvent): boolean {
  return event.ctrlKey || event.metaKey;
}
```

These look trivially simple — and they are. Their value is naming: when a rectangle tool calls `this.isConstrained(event)`, the intent is clear. `event.shiftKey` is cryptic without context.

The `getRectFromPoints` helper is more substantial. It computes a rectangle from two corner points, handling Shift-constrained proportions and Alt-center-origin drawing:

```typescript
protected getRectFromPoints(
  start: Vector2, end: Vector2, constrained: boolean, fromCenter: boolean
): { x: number; y: number; width: number; height: number } {
  let width = end.x - start.x;
  let height = end.y - start.y;

  if (constrained) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = Math.sign(width) * size || size;
    height = Math.sign(height) * size || size;
  }

  if (fromCenter) {
    return {
      x: start.x - width,
      y: start.y - height,
      width: width * 2,
      height: height * 2,
    };
  }

  // Normalize to positive dimensions
  let x = start.x;
  let y = start.y;
  if (width < 0) { x += width; width = -width; }
  if (height < 0) { y += height; height = -height; }

  return { x, y, width, height };
}
```

The constraint logic takes the larger dimension and forces both dimensions to match, preserving the sign (so dragging up-left still works). The center-origin mode doubles the dimensions and shifts the origin. Normalization at the end ensures the returned rectangle always has positive width and height, regardless of drag direction.

This helper is used by the rectangle tool, ellipse tool, and artboard tool. Extracting it into the base class avoids three copies of the same fiddly geometry code.

## The ToolContext: Dependency Injection

Tools need to interact with the rest of the editor. The rectangle tool adds nodes to the scene graph. The selection tool reads and writes the selection. The pen tool triggers tool switching when a path is finalized. But tools shouldn't know about the editor store, the React component tree, or the canvas element. They should know about _capabilities_ — abstract operations they can perform.

The `ToolContext` is that abstraction:

```typescript
export interface ToolContext {
  sceneGraph: SceneGraph;
  camera: Camera;
  getSelectedIds: () => Set<string>;
  setSelectedIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  defaultFill: Fill;
  defaultStroke: Stroke;
  generateId: () => string;
  setActiveTool: (tool: ToolType) => void;
  onTransformStart?: () => void;
  onTransformComplete?: (nodeIds: Set<string>, type: TransformType) => void;
  getSnapToGrid?: () => boolean;
  getGridSize?: () => number;
  getGuides?: () => { id: string; axis: 'x' | 'y'; position: number }[];
  getSnapToGuides?: () => boolean;
  getEnteredGroupId?: () => string | null;
  setEnteredGroupId?: (id: string | null) => void;
  onEnterTextEdit?: (nodeId: string) => void;
  convertShapeToPath?: (nodeId: string) => string | null;
  getSymbolDefinitions?: () => SymbolDefinition[];
}
```

This is dependency injection. Every tool receives the same context through its constructor. The context is assembled by the tool manager from callbacks provided by the canvas component. The tools have no idea whether selection state lives in a Zustand store, a Redux store, or a plain object — they just call `this.context.setSelectedIds([nodeId])` and it works.

### Why Functions, Not Values

Notice that settings like snap-to-grid, grid size, and guides are functions, not properties: `getSnapToGrid?: () => boolean` rather than `snapToGrid: boolean`. This matters for reactivity. The context is created once when the tool manager initializes. If `snapToGrid` were a boolean captured at creation time, it would be stale the moment the user toggles the setting. By storing a function, the tool calls `this.context.getSnapToGrid?.()` at the moment it needs the value, always getting the current state.

The `defaultFill` and `defaultStroke` use JavaScript getters for the same reason:

```typescript
get defaultFill() {
  return options.getDefaultFill();
},
get defaultStroke() {
  return options.getDefaultStroke();
},
```

When a tool reads `this.context.defaultFill`, the getter fires and fetches the current value from the editor store. The tool doesn't need to know this is happening — it just reads a property.

### The Undo Callbacks

Two callbacks connect tools to the undo system: `onTransformStart` and `onTransformComplete`. The first is called at the beginning of a drag operation — it snapshots the scene graph before any changes. The second is called when the drag ends — it records what changed and what type of change it was.

```typescript
onTransformStart?: () => void;
onTransformComplete?: (nodeIds: Set<string>, type: TransformType) => void;
```

The `TransformType` is `'move' | 'resize' | 'rotate' | 'vertex-move'`. The canvas component uses this to decide what to do after the transform — for example, marking the project as dirty or updating the properties panel display.

This separation — snapshot before, record after — means tools don't need to know anything about undo. They call `onTransformStart` when the user starts dragging and `onTransformComplete` when they stop. The undo system handles the rest.

### Optional vs. Required

The required fields (`sceneGraph`, `camera`, `getSelectedIds`, etc.) are what every tool needs. The optional fields (marked with `?`) are capabilities that only some tools use. The selection tool uses `getEnteredGroupId` for group nesting. The text tool uses `onEnterTextEdit` to trigger inline editing. The direct selection tool uses `convertShapeToPath` to convert shapes to editable paths.

Making these optional keeps the context interface honest about what's universal and what's specialized. It also means the context can be constructed without providing everything — useful in tests where you only need to verify that a tool calls `addToSelection`, not that it handles text editing.

## The Tool Manager

The `ToolManager` is the central dispatcher. It creates all tools, routes events to the active one, handles keyboard shortcuts for tool switching, and manages the activation/deactivation lifecycle.

### Tool Registration

All tools are created in the constructor, sharing a single `ToolContext`:

```typescript
export class ToolManager {
  private tools: Map<ToolType, BaseTool> = new Map();
  private activeTool: BaseTool | null = null;
  private activeToolType: ToolType = 'selection';

  constructor(options: ToolManagerOptions) {
    const context = this.createToolContext();

    this.tools.set('selection', new SelectionTool(context));
    this.tools.set('direct-selection', new DirectSelectionTool(context));
    this.tools.set('rectangle', new RectangleTool(context));
    this.tools.set('ellipse', new EllipseTool(context));
    this.tools.set('polygon', new PolygonTool(context));

    const starTool = new PolygonTool(context);
    starTool.setStarMode(true);
    this.tools.set('star', starTool);

    this.tools.set('hand', new HandTool(context));
    this.tools.set('pen', new PenTool(context));
    this.tools.set('brush', new BrushTool(context));
    this.tools.set('eraser', new EraserTool(context));
    this.tools.set('text', new TextTool(context));
    this.tools.set('artboard', new ArtboardTool(context));

    this.setActiveTool('selection');
  }
```

Twelve tools, all pre-created. The star tool is the polygon tool with a flag flipped — they share implementation, just different default geometry. All tools share the same context object. The default active tool is selection — the tool you're in when you're not drawing.

### Event Routing

The event routing methods are almost comically simple:

```typescript
handlePointerDown(event: CanvasPointerEvent): void {
  this.activeTool?.onPointerDown(event);
}

handlePointerMove(event: CanvasPointerEvent): void {
  this.activeTool?.onPointerMove(event);
}

handlePointerUp(event: CanvasPointerEvent): void {
  this.activeTool?.onPointerUp(event);
}
```

Three one-liners. The optional chaining (`?.`) handles the edge case where no tool is active (after disposal). The tool manager doesn't inspect the events, transform them, or make decisions about them. It's a pure dispatcher — events go in, the active tool handles them.

This simplicity is the point. The complexity lives in the individual tools, where it can be understood in isolation. The routing layer is trivially correct.

### Keyboard Shortcuts

The keyboard handler has one extra responsibility: checking for tool-switching shortcuts before passing events to the active tool.

```typescript
handleKeyDown(event: KeyboardEvent): void {
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    const newTool = this.getToolForShortcut(event.key);
    if (newTool) {
      this.setActiveTool(newTool);
      return;
    }
  }

  this.activeTool?.onKeyDown?.(event);
}
```

The modifier guard is critical. Without it, pressing Ctrl+R (browser refresh) would switch to the rectangle tool. Ctrl+P (print) would switch to pen. Shift+G (toggle guides) would switch to... nothing useful, but modifier shortcuts would misfire constantly. The guard ensures that only bare key presses — no Ctrl, Alt, Shift, or Meta — trigger tool switching.

When a shortcut matches, the handler returns immediately. The key event doesn't reach the active tool. This prevents the old tool from processing the key and the new tool from not processing it — which would happen if both the switch and the dispatch occurred.

The shortcut map itself is a simple object:

```typescript
private getToolForShortcut(key: string): ToolType | null {
  const shortcuts: Record<string, ToolType> = {
    v: 'selection',
    a: 'direct-selection',
    h: 'hand',
    r: 'rectangle',
    o: 'ellipse',
    u: 'polygon',
    s: 'star',
    p: 'pen',
    b: 'brush',
    e: 'eraser',
    t: 'text',
    f: 'artboard',
  };

  return shortcuts[key.toLowerCase()] ?? null;
}
```

The `toLowerCase()` handles Caps Lock being on. The null return for unknown keys means the event passes through to the active tool — where it might trigger tool-specific behavior like Delete to remove a selection or Escape to cancel a drawing operation.

### Tool Switching

Tool switching is a lifecycle event. The old tool must clean up before the new tool takes over. The `setActiveTool` method manages this:

```typescript
setActiveTool(type: ToolType): void {
  if (type === this.activeToolType && this.activeTool !== null) return;

  const tool = this.tools.get(type);
  if (!tool) {
    console.warn(`Tool "${type}" not found`);
    return;
  }

  if (this.activeTool) {
    this.activeTool.onDeactivate?.();
  }

  this.activeTool = tool;
  this.activeToolType = type;
  this.activeTool.onActivate?.();

  this.options.onToolChange?.(type);
}
```

The no-op check at the top prevents redundant switches — pressing V when the selection tool is already active shouldn't trigger a deactivate/activate cycle. The `onToolChange` callback at the bottom notifies the editor store, which updates the toolbar UI to highlight the active tool button and sets the canvas cursor.

### Dynamic Cursors

Most tools have a static cursor — crosshair for drawing, default for selection. But some tools change their cursor based on state. The hand tool shows `grab` when idle and `grabbing` when dragging. The selection tool changes its cursor when hovering over different transform handles — a horizontal resize cursor over the left and right edges, a diagonal cursor over corners, a rotation cursor outside the bounds.

The tool manager supports this with a dynamic cursor check:

```typescript
getCursor(): string {
  if (this.activeTool) {
    const tool = this.activeTool as BaseTool & { getCursor?: () => string };
    if (typeof tool.getCursor === 'function') {
      return tool.getCursor();
    }
    return this.activeTool.cursor;
  }
  return 'default';
}
```

If the tool defines a `getCursor()` method, use it. Otherwise, fall back to the static `cursor` property. The canvas component polls this on every pointer move to update the CSS cursor. A tool like the hand tool just needs to implement one extra method:

```typescript
export class HandTool extends BaseTool {
  readonly cursor = 'grab';
  private currentCursor = 'grab';

  getCursor(): string {
    return this.currentCursor;
  }

  onPointerDown(event: CanvasPointerEvent): void {
    this.state.isDragging = true;
    this.lastScreenPos = { x: event.screenPosition.x, y: event.screenPosition.y };
    this.currentCursor = 'grabbing';
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    this.state.isDragging = false;
    this.lastScreenPos = null;
    this.currentCursor = 'grab';
  }
}
```

The `cursor` property is still there for the default. `getCursor()` overrides it at runtime.

## The onDeactivate Contract

When a user switches tools, the old tool may be in the middle of something. The pen tool might have a half-drawn path. The selection tool might be inside a nested group. The brush tool might be mid-stroke. Each tool needs a chance to clean up.

The `onDeactivate` hook is that chance. It's called by the tool manager just before the new tool activates. What each tool does with it varies:

**The pen tool** has the most complex cleanup. If a path is in progress with at least two points, it finalizes it — adding the path to the scene graph as a completed shape. If the path has fewer than two points, it discards it. Either way, the pen state is fully reset:

```typescript
// PenTool
onDeactivate(): void {
  if (this.isDrawing && this.currentPath.length >= 2) {
    this.finalizePath(false);
  } else {
    this.cancelPath();
  }
}
```

**The selection tool** clears the entered group. Without this, switching from selection to rectangle while inside a group would leave `enteredGroupId` set, and the next time the selection tool activates, it would think the user is still inside that group:

```typescript
// SelectionTool
onDeactivate(): void {
  this.mode = 'idle';
  this.startPoint = null;
  this.marqueeRect = null;
  this.moveStartPositions.clear();
  this.resizeState = null;
  this.rotationState = null;
  this.context.setEnteredGroupId?.(null);
}
```

**The brush tool** cancels any in-progress stroke. If the user is mid-stroke and presses V, the partial stroke is discarded rather than committed:

```typescript
// BrushTool
onDeactivate(): void {
  if (this.isDrawing) {
    this.cancelStroke();
  }
}
```

**The hand tool** resets its cursor state. Without this, the cursor would stick on `grabbing` if the user switches tools mid-pan:

```typescript
// HandTool
onDeactivate(): void {
  this.state.isDragging = false;
  this.lastScreenPos = null;
  this.currentCursor = 'grab';
}
```

The pattern is consistent: **clean up anything that wouldn't make sense if the tool became active again later.** A tool might be deactivated and reactivated multiple times during an editing session. Each activation should start from a clean state.

Tools that don't need cleanup — like the rectangle tool and ellipse tool — simply don't implement `onDeactivate`. The optional method declaration `onDeactivate?(): void` means there's no burden on simple tools to provide an empty implementation.

## Why Tools Should Not Store Permanent State

Notice that every `onDeactivate` resets everything. The pen tool doesn't remember its last path. The selection tool doesn't remember which handle was being dragged. The brush tool doesn't remember its last stroke.

This is deliberate. Tools are interaction modes, not data stores. The permanent state of the editor — shapes, selections, undo history — lives in the scene graph and the editor store. Tools hold only transient state: where did the drag start, what's the current preview, which point is being edited. This transient state exists for the duration of a single gesture and is discarded when the gesture ends or the tool deactivates.

The benefit is predictability. When a user presses R to switch to the rectangle tool, the tool is in the same state it was in the first time they used it. There's no hidden state from three tool switches ago that might cause unexpected behavior. Each activation is a fresh start.

The one apparent exception is the context itself — tools store a reference to their `ToolContext`. But the context is not tool state. It's a shared dependency that outlives any individual tool's activation. The scene graph, camera, and selection are editor state accessed through the context, not owned by it.

## A Complete Tool: The Rectangle

To see how these pieces fit together, here's the complete rectangle tool — the simplest shape tool, and the template for all the others:

```typescript
export class RectangleTool extends BaseTool {
  readonly type = 'rectangle' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: RectangleNode | null = null;

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.previewNode = this.createRectangleNode(event.worldPosition.x, event.worldPosition.y, 0, 0);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint || !this.previewNode) return;

    const rect = this.getRectFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

    this.previewNode.transform.position = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
    this.previewNode.width = rect.width;
    this.previewNode.height = rect.height;
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) {
      this.resetState();
      return;
    }

    const rect = this.getRectFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isConstrained(event),
      this.isFromCenter(event)
    );

    if (rect.width >= this.getMinimumSize() && rect.height >= this.getMinimumSize()) {
      const node = this.createRectangleNode(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width,
        rect.height
      );

      this.context.onTransformStart?.();
      this.context.sceneGraph.addNode(node);
      this.context.setSelectedIds([node.id]);
      this.context.setActiveTool('selection');
    }

    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.isDragging) {
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
    }
  }

  getPreviewNode(): RectangleNode | null {
    return this.previewNode;
  }

  private createRectangleNode(cx: number, cy: number, width: number, height: number) {
    const transform = createDefaultTransform();
    transform.position = { x: cx, y: cy };
    transform.anchor = { x: 0.5, y: 0.5 };

    return {
      id: this.context.generateId(),
      name: 'Rectangle',
      type: 'rectangle' as const,
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      width,
      height,
      cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
      fills: [this.context.defaultFill],
      strokes: [this.context.defaultStroke],
    };
  }
}
```

The lifecycle is: `pointerDown` captures the start point and creates a preview. `pointerMove` updates the preview as the user drags. `pointerUp` creates the final node, adds it to the scene, selects it, and switches to the selection tool. Escape cancels at any point. The preview node is rendered by the canvas during the drag — the canvas calls `getPreviewNode()` every frame and, if it returns something, passes it to the shape renderer.

Four key behaviors are visible:

1. **Left-button only**: `if (event.button !== 0) return` ignores right-clicks and middle-clicks.
2. **Minimum size**: Shapes smaller than 1 world unit are discarded. This prevents accidental creation of invisible shapes from tiny or zero-length drags.
3. **Auto-select**: The new shape is immediately selected, so the user can move or resize it.
4. **Auto-switch**: The tool switches to selection after creating the shape. The user draws one rectangle, then is back in selection mode. This matches Figma and Illustrator behavior — shape tools are "one-shot."

## Connecting to React

The tool system lives in `packages/core` — pure TypeScript with no React dependency. The React integration happens in a hook called `useCanvasTools` that creates the tool manager, constructs the context from editor state, and bridges events between the DOM and the tool system.

The key challenge is reactivity. The editor store updates frequently — the user changes the fill color, toggles snap-to-grid, switches pages. But the tool manager is a persistent object (stored in a `useRef`) that shouldn't be recreated on every state change. The solution is ref-based callback forwarding:

```typescript
// Store current state in refs (updated by Zustand subscription)
const getSelectedIdsRef = useRef(() => new Set<string>());
const addToSelectionRef = useRef((id: string) => {});

// Create ToolManager once, using refs for callbacks
useEffect(() => {
  const manager = new ToolManager({
    sceneGraph: sceneGraphRef.current,
    camera,
    getSelectedIds: () => getSelectedIdsRef.current(),
    addToSelection: (id) => addToSelectionRef.current(id),
    getDefaultFill: () => getDefaultFillRef.current(),
    getSnapToGrid: () => getSnapToGridRef.current(),
    // ... remaining options
    onTransformStart: () => pushUndoRef.current(),
    onToolChange: (tool) => setActiveToolRef.current(tool),
  });

  toolManagerRef.current = manager;
  return () => manager.dispose();
}, [camera]); // Only recreated when camera changes
```

The `useEffect` dependency array contains only `camera`. The tool manager is created once when the camera becomes available and destroyed on cleanup. All the other dependencies — selection, fill color, snap settings — flow through refs that are updated by a Zustand store subscription. The tool manager's context indirects through these refs, so it always sees current values without being recreated.

This pattern avoids two problems. First, it prevents the tool manager from being destroyed and recreated on every state change, which would lose the active tool's transient state (like a mid-drag operation). Second, it avoids stale closures — the refs are always updated to the latest callbacks.

### Event Forwarding

The canvas component translates DOM events into `CanvasPointerEvent` objects and forwards them:

```typescript
const handleMouseDown = (e: React.MouseEvent) => {
  if (e.button === 1 || (e.button === 0 && isSpaceHeld)) {
    // Middle mouse or space+click: pan camera directly
    return;
  }

  if (e.button === 0) {
    const worldPos = camera.screenToWorld(screenPos);
    toolPointerDown(screenPos, worldPos, e, e.detail);
  }
};
```

The `camera.screenToWorld()` call does the critical coordinate transform — converting pixel coordinates to world coordinates that account for the current zoom and pan offset. The `e.detail` field carries the click count (1 for single-click, 2 for double-click), which tools use for double-click behaviors like entering a group or starting text editing.

For drag operations that might extend beyond the canvas element, global listeners are attached to the document:

```typescript
document.addEventListener('pointermove', handleGlobalMove);
document.addEventListener('pointerup', handleGlobalUp);
```

Without these, releasing the mouse button outside the canvas would leave the tool in a dragging state — the `pointerUp` event would fire on whatever element the cursor happens to be over, not on the canvas. The global listeners ensure the tool always receives its `pointerUp`, regardless of where the cursor ends up.

## ID Generation

Every node in the scene graph needs a unique ID. The tool manager provides this through the context:

```typescript
private idCounter: number = 0;

private generateId(): string {
  return `node_${Date.now()}_${this.idCounter++}`;
}
```

The timestamp prevents collisions across sessions (if a project is saved and reloaded, old IDs won't conflict with new ones). The counter prevents collisions within a frame (if two shapes are created in the same millisecond). The `node_` prefix is cosmetic — it makes IDs readable when debugging.

This generator is bound to the tool manager instance and shared through the context:

```typescript
generateId: this.generateId.bind(this),
```

All tools call `this.context.generateId()`, which routes through the same counter. No tool can produce a duplicate ID because they all share the same source.

## Preview Rendering

While the user drags to create a shape, they need to see what they're creating. The preview system works by polling:

```typescript
// ToolManager
getPreviewNode() {
  return this.activeTool?.getPreviewNode?.() ?? null;
}
```

The canvas component calls this every frame during the render loop. If the active tool returns a node, the canvas passes it to the shape renderer, which draws it with the same pipeline as committed nodes. The preview looks identical to the final shape — same fills, same strokes, same rendering code.

The tool creates the preview node on `pointerDown`, updates its geometry on every `pointerMove`, and nullifies it on `pointerUp`. The canvas sees a node during the drag and `null` before and after. No special "preview mode" in the renderer, no overlay system, no separate draw call. The preview is just a node that temporarily exists in the tool's memory.

## Disposal

When the canvas component unmounts — navigating away from the page, or React's StrictMode double-mounting — the tool manager must clean up:

```typescript
dispose(): void {
  if (this.activeTool) {
    this.activeTool.onDeactivate?.();
  }
  this.tools.clear();
  this.activeTool = null;
}
```

The active tool gets one last `onDeactivate` call to finalize any in-progress operations. Then the tools map is cleared and the active tool reference is nullified. After disposal, all event routing methods are no-ops (the optional chaining on `this.activeTool?.` short-circuits to `undefined`).

The tool manager doesn't own any WebGL resources, DOM listeners, or subscriptions — those belong to the canvas component and the editor store. Disposal is just about ensuring a clean lifecycle for the tools themselves.

## Lessons

**Dependency injection decouples tools from the world they operate in.** The ToolContext interface gives every tool access to the scene graph, camera, selection, and undo system without knowing where those capabilities live. Tools can be tested with a mock context, swapped between editor implementations, or extended with new capabilities by adding optional fields to the interface.

**Use functions for values that change, not snapshots captured at creation time.** The ToolContext stores `getSnapToGrid: () => boolean` instead of `snapToGrid: boolean` because the context is created once but the setting can change at any time. The getter pattern ensures the tool always reads the current value without requiring context recreation.

**Transient state belongs in the tool, permanent state belongs in the store.** Tools hold only what they need for the current gesture — a start point, a preview node, a drag offset. When the gesture ends or the tool deactivates, that state is discarded. The scene graph and editor store own everything that survives across interactions.

**The onDeactivate contract prevents ghost state from haunting the next activation.** Every tool cleans up anything that wouldn't make sense if it became active again later. The pen tool finalizes or discards its in-progress path. The selection tool clears its entered group. Without this discipline, switching tools would accumulate invisible state that causes bugs minutes later.

**Event routing should be trivially correct.** The ToolManager's pointer forwarding methods are one-liners. The complexity lives in the individual tools, where it can be understood in isolation. When the dispatcher is simple enough to verify by inspection, entire categories of routing bugs disappear.

**Ref-based callback forwarding bridges persistent objects and reactive state.** The ToolManager lives in a `useRef` and is created once. React state changes flow through refs that the tool manager's context indirects through, avoiding both stale closures and unnecessary recreation of the tool manager during a drag.

## What We Built

This chapter covered the tool system — about 520 lines across two files, plus the type definitions:

- **BaseTool**: Abstract class with three required pointer methods, four optional lifecycle hooks, and geometry helpers for constrained/centered drawing
- **ToolContext**: Dependency injection interface with 20+ fields connecting tools to the scene graph, camera, selection, undo, snapping, and editor settings
- **ToolManager**: Event dispatcher, keyboard shortcut handler, tool lifecycle manager, preview poller
- **CanvasPointerEvent**: Custom event type with both screen and world coordinates, modifier keys, and pressure
- **The onDeactivate contract**: Every tool cleans up its transient state when switching away
- **Ref-based React integration**: Tool manager persists across state changes, callbacks flow through refs
- **ID generation**: Timestamp + counter, shared through context, collision-free

The architecture supports twelve tools today and can accommodate more without touching any of the infrastructure code. Adding a new tool means: extend `BaseTool`, implement the three pointer methods, register in the tool manager constructor, and add a keyboard shortcut to the map. Everything else — event routing, lifecycle management, preview rendering, undo integration — comes for free.

The next chapter puts this architecture to work with the shape creation tools — rectangle, ellipse, polygon, and star — showing the concrete interaction patterns for drag-to-create drawing.
