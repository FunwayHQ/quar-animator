# The Pen Tool

## Why the Pen Tool Is Different

The shape tools from the previous chapter follow a simple lifecycle: press, drag, release, done. One gesture creates one shape. The pen tool breaks this pattern. It's a multi-click tool — each click adds a point, and the path isn't finalized until the user explicitly closes it or presses Enter. Between clicks, the tool must maintain state: the accumulated path points, whether the user is currently dragging a handle, which point they're adjusting. The user might place ten points, drag handles on three of them, delete one, convert another from smooth to corner, and then close the path by clicking the first point.

This makes the pen tool the most stateful tool in the system. Shape tools store a single `startPoint` and a `previewNode`. The pen tool stores an entire path under construction, a handle drag state machine, and multiple interaction modes. It's about 400 lines — not enormous, but dense with edge cases.

## Path Points and Handles

Before diving into the tool, we need to understand the data it produces. A `PathPoint` represents one point on a Bezier path:

```typescript
export interface PathPoint {
  position: Vector2;
  handleIn: Vector2 | null;
  handleOut: Vector2 | null;
  type: 'corner' | 'smooth' | 'symmetric';
  cornerRadius?: number;
}
```

The `position` is the point itself — the location on the path where the curve passes through. The `handleIn` and `handleOut` are control points for the cubic Bezier curves that connect adjacent points. They're stored as offsets relative to the position, not absolute coordinates. A `handleIn` of `{ x: -30, y: 0 }` means the incoming control point is 30 units to the left of the point's position.

This relative representation is deliberate. When you move a point, its handles move with it automatically — you only update `position`, and the handles stay at the same offset. If handles were stored as absolute coordinates, every point move would require updating two additional coordinates.

The `type` field controls how the handles relate to each other:

- **`corner`**: Handles are independent. `handleIn` and `handleOut` can be `null` (straight line segments) or point in completely different directions. This creates sharp corners or cusps.
- **`smooth`**: Handles are colinear — they point in opposite directions — but can have different lengths. The curve flows smoothly through the point, but the speed of approach and departure can differ.
- **`symmetric`**: Handles are colinear and equal in length. The curve is symmetric on both sides of the point. This is the default when the user drags during point placement.

In practice, the pen tool only creates `corner` and `smooth` points. `symmetric` is used internally by the ellipse path generation (the four control points of a Bezier-approximated circle), but the pen tool treats newly-dragged handles as `smooth`.

## The State Machine

The pen tool has three distinct states, managed by boolean flags rather than an explicit state enum:

```typescript
export class PenTool extends BaseTool {
  readonly type = 'pen' as const;
  readonly cursor = 'crosshair';

  private currentPath: PathPoint[] = [];
  private isDrawing: boolean = false;
  private isDraggingHandle: boolean = false;
  private previewNode: PathNode | null = null;

  private handleDragState: HandleDragState = {
    mode: 'none',
    pointIndex: -1,
    handleType: 'out',
  };
}
```

**Idle** (`isDrawing === false`): The tool is waiting for the first click. No path exists yet.

**Drawing** (`isDrawing === true`, `isDraggingHandle === false`): A path is under construction. The user has placed at least one point and can click to add more. The preview node shows the current path.

**Dragging handle** (`isDrawing === true`, `isDraggingHandle === true`): The user is holding the mouse button down after placing a point, dragging to create Bezier handles. When they release, the tool returns to the Drawing state.

The `handleDragState` adds a sub-mode: is the user dragging a handle on the point they just placed (`mode: 'new-point'`), or adjusting a handle on a previously placed point (`mode: 'existing-handle'`)? The distinction matters because new-point drags always create symmetric handles from scratch, while existing-handle drags use the `updateHandleWithSymmetry` function to preserve the point's handle relationship.

### Why Not an Explicit State Enum?

Using booleans instead of a `type State = 'idle' | 'drawing' | 'dragging'` enum was a pragmatic choice. The states don't transition in a strict linear sequence — you can go from Drawing to Dragging Handle and back multiple times, and both "cancel" and "close path" need to work from either Drawing or Dragging. An enum would require a switch statement in every event handler. The booleans are checked independently where they matter, which turns out to be simpler for this specific tool.

## Adding Points

The `onPointerDown` handler does most of the work:

```typescript
onPointerDown(event: CanvasPointerEvent): void {
  if (event.button !== 0) return;

  const worldPos = { ...event.worldPosition };

  if (!this.isDrawing) {
    // Start new path
    this.isDrawing = true;
    this.currentPath = [];
    this.previewNode = this.createPathNode([]);
  }

  // Alt+click on existing point to convert point type
  if (event.altKey && this.currentPath.length > 0) {
    const hitIndex = this.hitTestCurrentPathPoint(worldPos);
    if (hitIndex !== -1) {
      this.convertPointType(hitIndex);
      return;
    }
  }

  // Check if clicking near the first point to close the path
  if (this.currentPath.length > 2) {
    const firstPoint = this.currentPath[0].position;
    const distance = vec2.distance(worldPos, firstPoint);
    const closeThreshold = 10 / this.context.camera.zoom;

    if (distance < closeThreshold) {
      this.finalizePath(true);
      return;
    }
  }

  // Add new point
  const newPoint: PathPoint = {
    position: worldPos,
    handleIn: null,
    handleOut: null,
    type: 'corner',
  };

  this.currentPath.push(newPoint);
  this.isDraggingHandle = true;
  this.state.startWorldPos = worldPos;

  this.updatePreviewNode();
}
```

Every new point starts as a `corner` — no handles, straight line segments. The point is added to the `currentPath` array and the preview node is updated. Then `isDraggingHandle` is set to `true`, which means the subsequent `onPointerMove` events will create handles if the user drags.

This is the fundamental interaction: click for a corner, drag for a curve. If the user clicks and releases without moving, the point stays as a corner with `null` handles. If they click and drag, the `onPointerMove` handler creates handles:

```typescript
onPointerMove(event: CanvasPointerEvent): void {
  if (!this.isDrawing) return;

  const worldPos = { ...event.worldPosition };

  if (this.isDraggingHandle && this.currentPath.length > 0) {
    if (this.handleDragState.mode === 'existing-handle') {
      this.updateExistingHandle(worldPos);
    } else {
      // Creating handles on the last-placed point
      const lastPoint = this.currentPath[this.currentPath.length - 1];
      const handleOut = vec2.subtract(worldPos, lastPoint.position);

      if (vec2.length(handleOut) > 1) {
        lastPoint.handleOut = handleOut;
        lastPoint.handleIn = { x: -handleOut.x, y: -handleOut.y };
        lastPoint.type = 'smooth';
      }
    }

    this.updatePreviewNode();
  }
}
```

The handle math is straightforward. `handleOut` is the vector from the point to the current mouse position. `handleIn` is the mirror: `{ x: -handleOut.x, y: -handleOut.y }`. This creates symmetric handles — the incoming and outgoing curves have the same shape. The point type changes from `corner` to `smooth` because the handles are now colinear.

The `vec2.length(handleOut) > 1` check prevents micro-handles. If the user barely moves the mouse (less than 1 world unit), the handles stay `null` and the point remains a corner. Without this threshold, a tiny mouse wiggle during a click would create nearly-invisible handles that make the curve behave unexpectedly.

### Why Mutate In Place?

Notice that `onPointerMove` mutates `lastPoint.handleOut` directly, rather than creating a new `PathPoint` object. This is unusual in our codebase, where scene graph nodes are updated immutably through `sceneGraph.updateNode()`. But the `currentPath` array is internal tool state, not scene graph data. It's never observed by React or any subscription system. Direct mutation is simpler and faster — the handle position changes every frame during a drag, and creating a new point object each time would be wasteful.

The immutability requirement only applies when the tool interacts with the scene graph. The tool's internal working state can be mutable.

## Closing the Path

When the user clicks near the first point, the path closes:

```typescript
if (this.currentPath.length > 2) {
  const firstPoint = this.currentPath[0].position;
  const distance = vec2.distance(worldPos, firstPoint);
  const closeThreshold = 10 / this.context.camera.zoom;

  if (distance < closeThreshold) {
    this.finalizePath(true);
    return;
  }
}
```

The threshold is `10 / this.context.camera.zoom`. The 10 is in screen pixels — a comfortable click target regardless of zoom level. Dividing by zoom converts to world units. At 2x zoom, the threshold shrinks to 5 world units; at 0.5x zoom, it expands to 20. The path closes when the user gets within the target, not when they click exactly on the first point. This is critical for usability — pixel-perfect clicking is frustrating.

The minimum of 3 points prevents degenerate closures. You can't close a path with fewer than 3 points because the result would be a line (2 points) or a dot (1 point), neither of which makes sense as a closed path.

## Path Finalization

When the user closes the path or presses Enter, the tool creates a permanent node:

```typescript
private finalizePath(closed: boolean): void {
  if (this.currentPath.length < 2) {
    this.cancelPath();
    return;
  }

  // Check for degenerate path
  let minX = Infinity, maxX = -Infinity,
      minY = Infinity, maxY = -Infinity;
  for (const p of this.currentPath) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    if (p.position.y < minY) minY = p.position.y;
    if (p.position.y > maxY) maxY = p.position.y;
  }
  if (maxX - minX < 0.1 && maxY - minY < 0.1) {
    this.cancelPath();
    return;
  }

  const node = this.createPathNode(this.currentPath, closed);
  centerPathNodeGeometry(node);

  this.context.onTransformStart?.();
  this.context.sceneGraph.addNode(node);

  // Reset BEFORE switching tools
  this.resetPenState();

  this.context.setSelectedIds([node.id]);
  this.context.setActiveTool('selection');
}
```

Two validation checks run before the path is committed. First, the path must have at least 2 points. A single point has no geometry — it's a dot, not a path. Second, the AABB (axis-aligned bounding box) must be at least 0.1 units in either dimension. This catches the case where the user clicks several times in the same spot, creating a path with multiple points but no visible area.

After validation, the path undergoes a critical transformation: centering.

## Path Centering: The Rotation Pivot Problem

When the pen tool creates a path, each point's position is in world coordinates. If you draw a triangle in the upper-right corner of the canvas, the points might be at `(300, 200)`, `(350, 250)`, `(300, 250)`. The node's transform position starts at `(0, 0)`.

This creates a problem: rotation. When you rotate a node, it rotates around its anchor point, which is at `position + anchor * dimensions`. If the position is `(0, 0)` and the anchor is `(0.5, 0.5)`, the rotation pivot is at the center of the node's local bounding box. But if the points are hundreds of units away from the origin, the "center" of the bounding box is off somewhere in the corner of the canvas. The shape would orbit around a distant point instead of spinning in place.

The `centerPathNodeGeometry` function fixes this:

```typescript
export function centerPathNodeGeometry(node: PathNode): Vector2 {
  if (node.points.length === 0) return { x: 0, y: 0 };

  // Compute AABB of all points
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of node.points) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    if (p.position.y < minY) minY = p.position.y;
    if (p.position.y > maxY) maxY = p.position.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Offset all point positions
  for (const p of node.points) {
    p.position.x -= cx;
    p.position.y -= cy;
  }

  // Move node position to the AABB center
  node.transform.position = { x: cx, y: cy };
  node.transform.anchor = { x: 0.5, y: 0.5 };

  return { x: cx, y: cy };
}
```

It computes the center of the path's bounding box, subtracts it from every point position (so points become relative to the center), and sets the node's transform position to that center. After centering, the triangle's points might be `(-25, -25)`, `(25, 25)`, `(-25, 25)`, and the node's position is `(325, 225)`. The path looks identical on screen, but now rotation pivots around its visual center.

The key insight: handles are offsets relative to their point, not absolute coordinates. When you subtract the center from a point's position, you don't need to adjust its handles. `handleOut: { x: 30, y: 0 }` means "30 units to the right of the point" regardless of where the point is. This is the payoff of the relative handle representation.

Shape tools don't need centering because their geometry is inherently centered. A rectangle at position `(100, 100)` with width 50 and height 30 is already defined relative to its center. But paths are defined by absolute point coordinates, and the user places those points wherever they want. Centering is the bridge between the user's absolute placement and the node's center-anchored transform.

## The resetPenState Ordering Bug

The finalization code contains a comment that hints at a real bug we encountered:

```typescript
// Reset state BEFORE switching tools to prevent recursive finalizePath
this.resetPenState();

this.context.setSelectedIds([node.id]);
this.context.setActiveTool('selection');
```

The ordering matters. `setActiveTool('selection')` triggers `onDeactivate` on the pen tool:

```typescript
onDeactivate(): void {
  if (this.isDrawing && this.currentPath.length >= 2) {
    this.finalizePath(false);
  } else {
    this.cancelPath();
  }
}
```

If `resetPenState()` hasn't run yet when `onDeactivate` fires, `this.isDrawing` is still `true`, and `finalizePath` calls itself recursively. The path gets committed twice. The tool tries to switch to selection again, which triggers another `onDeactivate`, which calls `finalizePath` again. Infinite recursion, stack overflow.

The fix is simple: reset state before switching tools. After `resetPenState()`, `this.isDrawing` is `false`, so `onDeactivate` takes the `cancelPath` branch, which calls `resetPenState()` again — a no-op since everything is already cleared.

```typescript
private resetPenState(): void {
  this.currentPath = [];
  this.isDrawing = false;
  this.isDraggingHandle = false;
  this.previewNode = null;
  this.resetState();
}
```

This is a general pattern for tools that do work during deactivation: always clear your state before triggering the deactivation cascade. The shape tools don't have this problem because they don't implement `onDeactivate` — their transient state (a single `startPoint` and `previewNode`) is harmless to leave behind. The pen tool's `onDeactivate` tries to be helpful by committing the in-progress path, but that helpfulness creates a reentrancy hazard.

## Converting Point Types

Alt-clicking an existing point during drawing toggles it between corner and smooth:

```typescript
if (event.altKey && this.currentPath.length > 0) {
  const hitIndex = this.hitTestCurrentPathPoint(worldPos);
  if (hitIndex !== -1) {
    this.convertPointType(hitIndex);
    return;
  }
}
```

The conversion uses a pure function from `pointUtils.ts`:

```typescript
export function convertPointType(
  point: PathPoint,
  prevPosition: Vector2 | null,
  nextPosition: Vector2 | null,
  defaultHandleLength: number = 30
): PathPoint {
  if (point.type === 'corner') {
    // Corner → smooth: add handles along the path direction
    let direction: Vector2 = { x: 1, y: 0 };

    if (prevPosition && nextPosition) {
      const toNext = vec2.subtract(nextPosition, prevPosition);
      const len = vec2.length(toNext);
      if (len > 0) {
        direction = { x: toNext.x / len, y: toNext.y / len };
      }
    } else if (prevPosition) {
      const toPrev = vec2.subtract(point.position, prevPosition);
      const len = vec2.length(toPrev);
      if (len > 0) {
        direction = { x: toPrev.x / len, y: toPrev.y / len };
      }
    } else if (nextPosition) {
      const toNext = vec2.subtract(nextPosition, point.position);
      const len = vec2.length(toNext);
      if (len > 0) {
        direction = { x: toNext.x / len, y: toNext.y / len };
      }
    }

    return {
      ...point,
      handleOut: {
        x: direction.x * defaultHandleLength,
        y: direction.y * defaultHandleLength,
      },
      handleIn: {
        x: -direction.x * defaultHandleLength,
        y: -direction.y * defaultHandleLength,
      },
      type: 'smooth',
    };
  } else {
    // Smooth → corner: remove handles
    return {
      ...point,
      handleIn: null,
      handleOut: null,
      type: 'corner',
    };
  }
}
```

The corner-to-smooth direction is inferred from neighbors. If the point has both a previous and next neighbor, the handle direction follows the line from previous to next — the tangent of the path at that point. If only one neighbor exists (first or last point), the direction follows the line between the point and its neighbor. If no neighbors exist (shouldn't happen in practice), it defaults to horizontal.

The default handle length of 30 world units is a visual heuristic. Too short and the curve barely bends; too long and it overshoots. 30 units produces a gentle, natural curve at typical zoom levels.

Smooth-to-corner conversion is simpler: just delete the handles. The return path uses object spread (`...point`) to create a new object — the function is pure, never mutating its input. The pen tool overwrites the array entry with the returned value:

```typescript
this.currentPath[pointIndex] = convertPointTypeUtil(
  point,
  prevPoint ? prevPoint.position : null,
  nextPoint ? nextPoint.position : null
);
```

## Handle Symmetry

When the user drags handles on a previously placed point, the symmetry constraint comes into play through `updateHandleWithSymmetry`:

```typescript
export function updateHandleWithSymmetry(
  point: PathPoint,
  handleType: 'in' | 'out',
  newHandleOffset: Vector2
): PathPoint {
  const result = { ...point };

  if (handleType === 'out') {
    result.handleOut = newHandleOffset;
    if (point.type === 'smooth' || point.type === 'symmetric') {
      const length =
        point.type === 'symmetric' && point.handleIn
          ? vec2.length(newHandleOffset)
          : point.handleIn
            ? vec2.length(point.handleIn)
            : vec2.length(newHandleOffset);
      const direction = vec2.normalize({
        x: -newHandleOffset.x,
        y: -newHandleOffset.y,
      });
      result.handleIn = vec2.multiply(direction, length);
    }
  } else {
    result.handleIn = newHandleOffset;
    if (point.type === 'smooth' || point.type === 'symmetric') {
      const length =
        point.type === 'symmetric' && point.handleOut
          ? vec2.length(newHandleOffset)
          : point.handleOut
            ? vec2.length(point.handleOut)
            : vec2.length(newHandleOffset);
      const direction = vec2.normalize({
        x: -newHandleOffset.x,
        y: -newHandleOffset.y,
      });
      result.handleOut = vec2.multiply(direction, length);
    }
  }

  return result;
}
```

The logic branches on point type:

- **Corner**: Only the dragged handle moves. The other is untouched. This lets the user create sharp angles where two curves meet at different tangent directions.
- **Smooth**: The opposite handle mirrors the direction but keeps its own length. If you drag `handleOut` to the right, `handleIn` rotates to point left, but stays the same distance from the point that it was before. The curve stays smooth (no kink), but the incoming and outgoing segments can have different curvature.
- **Symmetric**: Both handles mirror direction AND length. Dragging one handle to be longer makes the other one longer too. The curve is perfectly symmetric through the point.

The function returns a new `PathPoint` — it's pure. The pen tool applies the result back to its mutable array:

```typescript
private updateExistingHandle(worldPos: Vector2): void {
  const { pointIndex, handleType } = this.handleDragState;
  const point = this.currentPath[pointIndex];
  if (!point) return;

  const handleOffset = vec2.subtract(worldPos, point.position);
  const updated = updateHandleWithSymmetry(point, handleType, handleOffset);
  this.currentPath[pointIndex] = updated;
}
```

This is a clean separation: the pure function computes what the new point should look like, and the tool applies it to its internal state.

## Hit Testing

The pen tool needs to detect clicks on existing points — for closing the path, for Alt-click type conversion, and for the UI overlay interactions:

```typescript
private hitTestCurrentPathPoint(worldPos: Vector2): number {
  const hitRadius = 10 / this.context.camera.zoom;

  for (let i = 0; i < this.currentPath.length; i++) {
    const point = this.currentPath[i];
    const distance = vec2.distance(worldPos, point.position);
    if (distance < hitRadius) {
      return i;
    }
  }

  return -1;
}
```

The hit radius is `10 / zoom`, matching the path closure threshold. A linear scan through all points is fine — the pen tool rarely has more than a few dozen points during interactive drawing, and `vec2.distance` is two subtractions, two multiplications, an addition, and a square root. At 100 points, this is sub-microsecond.

The function returns an index, not a boolean. The caller needs to know which point was hit, not just whether any point was hit. Returning `-1` for "no hit" follows the array `indexOf` convention that every JavaScript developer recognizes.

## The Overlay: Visual Feedback During Drawing

While the pen tool builds a path, the user needs to see the control points and handles. This is handled by a React component: `PenToolOverlay`.

The shape tools render previews through the WebGL pipeline — their preview nodes are drawn by the shape renderer like any other node. The pen tool uses that pipeline too (the `previewNode` renders the path itself). But the control points and handle lines are drawn as an SVG overlay, floating above the canvas:

```typescript
export function PenToolOverlay({
  points, camera,
  onHandlePointerDown, onPointPointerDown,
}: PenToolOverlayProps) {
  if (!camera || points.length === 0) return null;

  const toScreen = (pos: Vector2): Vector2 =>
    camera.worldToScreen(pos);

  return (
    <svg className={styles.overlay}>
      {points.map((point, index) => {
        const screenPos = toScreen(point.position);

        return (
          <g key={index}>
            {/* Handle In: line + draggable circle */}
            {point.handleIn && (
              <>
                <line
                  className={styles.handleLine}
                  x1={screenPos.x}
                  y1={screenPos.y}
                  x2={screenPos.x + point.handleIn.x * camera.zoom}
                  y2={screenPos.y - point.handleIn.y * camera.zoom}
                />
                <circle
                  className={styles.handle}
                  cx={screenPos.x + point.handleIn.x * camera.zoom}
                  cy={screenPos.y - point.handleIn.y * camera.zoom}
                  r={5}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onHandlePointerDown?.(index, 'in', e);
                  }}
                />
              </>
            )}

            {/* Handle Out: line + draggable circle */}
            {point.handleOut && (/* same pattern */)}

            {/* Control point: draggable square */}
            <rect
              className={styles.point}
              x={screenPos.x - 4}
              y={screenPos.y - 4}
              width={8}
              height={8}
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointPointerDown?.(index, e);
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}
```

Several things to notice about the coordinate transformation.

**Points are converted to screen space** via `camera.worldToScreen()`. The SVG overlay operates in screen pixels, not world units. Point positions are absolute screen coordinates.

**Handles are converted differently.** A handle offset `{ x: 30, y: 10 }` means "30 world units right, 10 world units up." To convert to screen space, multiply by zoom. But there's a Y-axis flip: handles are in Y-up world space (positive Y goes up), while SVG is Y-down (positive Y goes down). So the Y component is negated: `screenPos.y - point.handleIn.y * camera.zoom`. The X component doesn't flip: `screenPos.x + point.handleIn.x * camera.zoom`.

**Control points are squares, handles are circles.** This visual distinction is standard in vector editors — Illustrator, Figma, and Inkscape all use it. Squares are path points (on the curve), circles are control handles (off the curve). The 8x8 square and radius-5 circle provide comfortable click targets.

**`e.stopPropagation()` is critical.** Without it, clicking a handle would bubble up to the canvas, which would interpret it as a new point placement. The overlay catches the event and routes it to the pen tool through callbacks: `onHandlePointerDown` for handle drags, `onPointPointerDown` for point clicks (including path closure when clicking the first point).

### The Bridge: useCanvasTools

The pen tool's internal state (`getCurrentPath()`, `isCurrentlyDrawing()`) is pulled into React state by the `useCanvasTools` hook:

```typescript
const [penToolPath, setPenToolPath] = useState<PathPoint[]>([]);
const [isPenToolDrawing, setIsPenToolDrawing] = useState(false);

// After every pointer event:
const tool = toolManagerRef.current.getActiveTool();
if (tool?.type === 'pen') {
  const penTool = tool as PenTool;
  setPenToolPath(penTool.getCurrentPath());
  setIsPenToolDrawing(penTool.isCurrentlyDrawing());
}
```

After every pointer event handled by the tool manager, the hook checks whether the active tool is the pen tool and extracts its state. This triggers a React re-render, which updates the `PenToolOverlay`. The path updates every time the user moves the mouse during a handle drag.

The overlay callbacks route back to the tool through the hook:

```typescript
const startPenHandleDrag = useCallback((pointIndex: number, handleType: 'in' | 'out') => {
  const activeTool = toolManagerRef.current.getActiveTool();
  if (activeTool?.type === 'pen') {
    (activeTool as PenTool).startHandleDrag(pointIndex, handleType);
  }
}, []);
```

This is the bidirectional bridge: tool state flows into React via `useState`, and user interactions flow back into the tool via public methods. The tool itself knows nothing about React — it exposes `getCurrentPath()` and `startHandleDrag()` as plain methods. The React integration is entirely in the hook and the overlay component.

## Keyboard Interactions

The pen tool handles three keyboard actions during drawing:

```typescript
onKeyDown(event: KeyboardEvent): void {
  if (!this.isDrawing) return;

  switch (event.key) {
    case 'Escape':
      this.cancelPath();
      break;

    case 'Enter':
      if (this.currentPath.length >= 2) {
        this.finalizePath(false);
      }
      break;

    case 'Backspace':
    case 'Delete':
      if (this.currentPath.length > 0) {
        this.currentPath.pop();
        if (this.currentPath.length === 0) {
          this.cancelPath();
        } else {
          this.updatePreviewNode();
        }
      }
      break;
  }
}
```

**Escape** cancels entirely — discards all points and returns to idle.

**Enter** finalizes the path as an open path. This is how you create open strokes (lines, arcs, free-form curves without fill). The minimum of 2 points prevents committing a path with a single point.

**Backspace/Delete** removes the last point, like an undo within the drawing operation. If removing the last point empties the path, the tool cancels entirely rather than leaving an empty drawing state. This is a nice quality-of-life feature — if the user places a point wrong, they can delete it and re-place it without canceling and restarting.

## Creating the PathNode

The node creation function reveals an important design decision about open vs. closed paths:

```typescript
private createPathNode(
  points: PathPoint[], closed: boolean = false
): PathNode {
  const transform = createDefaultTransform();
  transform.position = { x: 0, y: 0 };
  transform.anchor = { x: 0, y: 0 };

  return {
    id: this.context.generateId(),
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: points.map((p) => ({
      ...p,
      position: { ...p.position },
    })),
    closed,
    fills: closed ? [this.context.defaultFill] : [],
    strokes: [this.context.defaultStroke],
  };
}
```

**Closed paths get a fill; open paths don't.** A closed triangle should be filled by default — the user drew it as a shape. An open curve is a stroke — filling an open path looks wrong (the fill area is defined by an imaginary line connecting the endpoints, which wasn't part of the user's intent). Strokes apply to both.

**The anchor starts at (0, 0).** This is unlike shape tools, which set the anchor to (0.5, 0.5) immediately. The pen tool creates the node with a zero anchor, then calls `centerPathNodeGeometry` which computes the AABB, re-centers the points, and sets the anchor to (0.5, 0.5). The shape tools don't need this two-step process because their geometry is inherently centered.

**Points are deep-cloned.** The `points.map(p => ({ ...p, position: { ...p.position } }))` creates new objects for each point and each position vector. This breaks the reference link between the tool's mutable `currentPath` and the committed node. Without this clone, later modifications to the tool's state would inadvertently modify the committed node.

## The onDeactivate Contract

The pen tool's lifecycle hook is the most involved of any tool:

```typescript
onDeactivate(): void {
  if (this.isDrawing && this.currentPath.length >= 2) {
    this.finalizePath(false);
  } else {
    this.cancelPath();
  }
}
```

When the user presses V (or any other tool shortcut) while drawing a path, the pen tool auto-commits. If the path has at least 2 points, it becomes a permanent open path. If it has 0 or 1 points, it's discarded.

This is a design judgment call. We could have always discarded the in-progress path, requiring the user to press Enter before switching tools. But that felt punishing — if someone draws five points and accidentally hits V, losing their work is a bad experience. Auto-committing preserves their work. They can always undo it with Ctrl+Z if the auto-commit wasn't what they wanted.

The alternative judgment — always canceling — would be less surprising but more destructive. We chose to err on the side of preserving work.

## Lessons

**Store handles as offsets, not absolute coordinates.** When a point moves, its handles move with it for free because they're defined relative to the point's position. Absolute handle coordinates would require updating three values (point, handleIn, handleOut) for every point move, and path centering would need to adjust every handle in the path.

**Clear your state before triggering a deactivation cascade.** The pen tool's `resetPenState()` must run before `setActiveTool('selection')`, because switching tools fires `onDeactivate`, which checks `isDrawing` and calls `finalizePath` again. Resetting state first breaks the recursion. Any tool whose `onDeactivate` performs non-trivial work must follow this pattern.

**Zoom-relative hit testing makes click targets feel consistent at every zoom level.** The path closure threshold is `10 / camera.zoom` — always 10 screen pixels regardless of how far the user has zoomed in or out. Fixed world-space thresholds become impossibly small when zoomed out and absurdly large when zoomed in.

**Center path geometry at creation time to fix the rotation pivot.** Paths are defined by absolute point coordinates placed wherever the user clicks. Without centering, the node's anchor-based rotation pivot would be at the origin of the local coordinate system, causing the shape to orbit a distant point. `centerPathNodeGeometry` reframes points relative to their AABB center and moves the node position to compensate.

**Err on the side of preserving work during tool switches.** When the user accidentally presses V mid-drawing, the pen tool auto-commits the in-progress path rather than discarding it. Losing five carefully placed points is a worse experience than creating an unwanted open path that can be undone with Ctrl+Z.

**Separate the overlay from the tool with a bidirectional bridge.** The pen tool exposes `getCurrentPath()` for React to read and `startHandleDrag()` for React to call. The tool knows nothing about React, the overlay knows nothing about tool internals, and the `useCanvasTools` hook translates between them.

## What We Built

This chapter covered the pen tool — about 400 lines in `PenTool.ts`, plus 140 lines of support code in `pointUtils.ts`, plus the 110-line `PenToolOverlay` component:

- **Multi-click path creation**: Each click adds a corner point, each drag creates smooth Bezier handles. The path accumulates until the user closes it or presses Enter.
- **Path point types**: Corner (no handles, straight segments), smooth (colinear handles, different lengths), symmetric (colinear handles, equal lengths). The type controls handle coupling during edits.
- **Handle symmetry**: `updateHandleWithSymmetry` preserves the smooth/symmetric constraint when dragging handles. Direction mirrors, length follows rules based on point type.
- **Path centering**: `centerPathNodeGeometry` computes the AABB center, offsets all points to be relative to it, and moves the node position to that center. This ensures rotation pivots around the visual center.
- **The resetPenState ordering bug**: State must be cleared before calling `setActiveTool`, or `onDeactivate` triggers recursive finalization. Reset first, then switch.
- **Point type conversion**: Alt-click toggles between corner and smooth, using neighbor positions to infer handle direction.
- **SVG overlay**: Control points and handle lines rendered in screen space above the canvas, with Y-axis flip for handle offsets and `stopPropagation` to prevent event leaking.
- **The React bridge**: `useCanvasTools` extracts pen tool state into `useState` hooks after every pointer event, and routes overlay interactions back through the tool's public methods.
- **Auto-commit on deactivate**: Switching tools preserves the in-progress path rather than discarding it.

The pen tool is the most complex single tool in the system, but its complexity is contained. The state machine is three boolean flags. The geometry is basic vector math. The reentrancy bug was fixed with one line reordering. The hardest part isn't any individual piece — it's making sure all the pieces compose correctly: tool state, preview rendering, overlay interaction, keyboard handling, lifecycle hooks, and undo integration all working together for a smooth drawing experience.

The next chapter tackles the brush and eraser tools, which introduce a completely different challenge: real-time input processing with smoothing, simplification, and curve fitting.
