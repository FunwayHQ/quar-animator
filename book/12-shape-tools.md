# Shape Tools: Rectangle, Ellipse, Polygon, Star

## The Drag-to-Create Pattern

The previous chapter built the tool system — `BaseTool`, `ToolContext`, `ToolManager`. That's the framework. This chapter puts it to work with the four shape creation tools: rectangle, ellipse, polygon, and star.

All four tools share the same interaction model: the user presses the mouse button, drags to define a size, and releases to commit the shape. It's the most natural gesture in any drawing application, and it hides more complexity than you'd expect. Modifier keys alter the geometry mid-drag. The shape must preview in real time. The minimum size threshold prevents accidental clicks from littering the canvas with invisible shapes. After creation, the tool must select the new shape and switch back to the selection tool. Every shape tool does all of this, with slight variations in how it interprets the drag geometry.

The rectangle tool is the simplest — it was the "complete tool" example at the end of the previous chapter. This chapter focuses on the differences: how the ellipse maps a bounding box to radii, how the polygon inscribes vertices in a circle, how the star alternates between outer and inner radii, and how the shared helpers in `BaseTool` keep all four tools consistent.

## Rectangle: The Baseline

The rectangle tool captures a start point on `pointerDown`, computes a bounding rectangle on every `pointerMove`, and commits the shape on `pointerUp`. Here's the core flow, stripped to its essentials:

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
      this.previewNode = null;
      this.startPoint = null;
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
}
```

Several things are worth noting.

**The preview node is a real node.** It's not a lightweight overlay or a special drawing command — it's a full `RectangleNode` with fills, strokes, and a transform. The canvas render loop calls `toolManager.getPreviewNode()` every frame, and if it gets a node back, it passes it to the shape renderer. The shape appears on screen with the same rendering pipeline as any committed shape. This means the preview is always pixel-perfect — what you see during the drag is exactly what you'll get.

**The committed node is not the preview node.** On `pointerUp`, the tool creates a brand new node with `createRectangleNode`. It doesn't promote the preview node into the scene graph. This is deliberate: the preview node was mutated during the drag (its width, height, and position were overwritten on every `pointerMove`). Creating a fresh node ensures that the committed shape has clean, final values, and it avoids any lingering references to the preview object.

**`onTransformStart` fires before `addNode`.** This is the undo integration. `onTransformStart` pushes a scene graph snapshot onto the undo stack, so the "create shape" operation is undoable with Ctrl+Z. It fires once, right before the mutation. No snapshot is taken during the drag — the preview node doesn't exist in the scene graph, so there's nothing to snapshot.

**The minimum size check prevents invisible shapes.** A quick click-and-release with no drag produces a width and height of zero. Without the check, this would add a zero-sized node to the scene graph — invisible, unselectable, but occupying a slot in the layer panel. The threshold is 1 world unit, defined in `BaseTool.getMinimumSize()`.

**The tool switches itself to selection.** After creating a shape, the user almost always wants to move or resize it. Rather than forcing them to press V, the tool calls `this.context.setActiveTool('selection')`. This is the auto-switch behavior that every creation tool follows.

## The Geometry Helpers

The `BaseTool` class provides geometry helpers that all shape tools share. The most important is `getRectFromPoints`, which converts two world-space points (start and current) into a normalized bounding rectangle:

```typescript
protected getRectFromPoints(
  start: Vector2,
  end: Vector2,
  constrained: boolean,
  fromCenter: boolean
): { x: number; y: number; width: number; height: number } {
  let width = end.x - start.x;
  let height = end.y - start.y;

  if (constrained) {
    const squared = this.constrainToSquare(width, height);
    width = squared.width;
    height = squared.height;
  }

  if (fromCenter) {
    return {
      x: start.x - width,
      y: start.y - height,
      width: width * 2,
      height: height * 2,
    };
  }

  // Normalize to positive width/height
  let x = start.x;
  let y = start.y;

  if (width < 0) {
    x = start.x + width;
    width = -width;
  }
  if (height < 0) {
    y = start.y + height;
    height = -height;
  }

  return { x, y, width, height };
}
```

This handles three independent concerns at once:

**Constraint (Shift key).** When the user holds Shift, the rectangle becomes a square. `constrainToSquare` takes the larger of the two dimensions and applies it to both. The sign is preserved — if the user drags left and down, the constraint produces a square that extends left and down, not right and up. The `|| size` fallback handles the edge case where the sign is zero (the user drags perfectly horizontally or vertically).

```typescript
protected constrainToSquare(
  width: number, height: number
): { width: number; height: number } {
  const size = Math.max(Math.abs(width), Math.abs(height));
  return {
    width: Math.sign(width) * size || size,
    height: Math.sign(height) * size || size,
  };
}
```

**Center-origin (Alt key).** Normally, the start point is a corner of the rectangle. When the user holds Alt, the start point becomes the center. The rectangle extends equally in all directions: width doubles, height doubles, and the top-left corner shifts backward by the original delta. This is the `fromCenter` path — it skips normalization because the doubled dimensions are always positive after the `abs` in constrainToSquare, or after the natural doubling.

Actually, there's a subtlety here. When `fromCenter` is true and `constrained` is false, the width and height can still be negative (the user dragged left or up). The doubling `width * 2` preserves the negative sign, but the `x: start.x - width` subtracting a negative width adds it, which is correct — if the user dragged left (negative width), the left edge should be `start.x - (-delta) = start.x + delta`, which is to the right of the start point. The start point stays in the center. The math works out even though it looks like it shouldn't.

**Normalization.** When drawing from a corner (the default), the user might drag in any direction — right, left, up, or down. The resulting width or height might be negative. The normalization step flips negative dimensions to positive and adjusts the origin point accordingly. After normalization, `x` and `y` are always the minimum corner, and `width` and `height` are always positive.

The two modifier key helpers that feed into `getRectFromPoints` are trivially simple:

```typescript
protected isConstrained(event: CanvasPointerEvent): boolean {
  return event.shiftKey;
}

protected isFromCenter(event: CanvasPointerEvent): boolean {
  return event.altKey;
}
```

They exist as methods rather than inline checks so that tools can override them if needed. In practice, none of the shape tools do — the modifier key mappings are universal.

## Ellipse: Radii Instead of Dimensions

The ellipse tool follows exactly the same three-phase lifecycle as the rectangle tool. The difference is in how it represents geometry: instead of width and height, an ellipse has `radiusX` and `radiusY`, and instead of a corner position, it has a center.

```typescript
private getEllipseFromPoints(
  start: Vector2,
  end: Vector2,
  constrained: boolean,
  fromCenter: boolean
): { cx: number; cy: number; radiusX: number; radiusY: number } {
  let width = end.x - start.x;
  let height = end.y - start.y;

  if (constrained) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = Math.sign(width) * size || size;
    height = Math.sign(height) * size || size;
  }

  if (fromCenter) {
    return {
      cx: start.x,
      cy: start.y,
      radiusX: Math.abs(width),
      radiusY: Math.abs(height),
    };
  }

  return {
    cx: start.x + width / 2,
    cy: start.y + height / 2,
    radiusX: Math.abs(width) / 2,
    radiusY: Math.abs(height) / 2,
  };
}
```

The ellipse tool doesn't use the shared `getRectFromPoints` — it defines its own `getEllipseFromPoints` that returns radii directly. This avoids an unnecessary conversion: computing a rectangle and then deriving center and radii from it. The math is simpler when you go straight to the ellipse representation.

The from-center case is particularly clean for ellipses. When the user holds Alt, the start point _is_ the center, so `cx` and `cy` are just `start.x` and `start.y`. The drag distance in each axis directly becomes the radius — no halving needed. The `Math.abs` ensures positive radii regardless of drag direction.

The from-corner case (the default) computes the center as the midpoint of the drag and the radii as half the drag distance. This inscribes the ellipse in the bounding box defined by the drag — the same mental model as drawing a rectangle, but the result is oval instead of angular.

When Shift is held, `constrainToSquare` forces equal width and height, which means equal radii, which means a circle. The constraint logic is identical — the only difference is that the rectangle tool produces a square and the ellipse tool produces a circle from the same constrained dimensions.

The minimum size check is different for ellipses. The rectangle tool checks `width >= minimumSize && height >= minimumSize`, but the ellipse tool checks radii:

```typescript
if (ellipse.radiusX >= this.getMinimumSize() / 2 && ellipse.radiusY >= this.getMinimumSize() / 2) {
  // ... commit
}
```

The threshold is halved because radii are half the bounding box dimensions. A 1-unit minimum size means a 0.5-unit minimum radius.

The node creation is straightforward:

```typescript
private createEllipseNode(
  cx: number, cy: number,
  radiusX: number, radiusY: number
): EllipseNode {
  const transform = createDefaultTransform();
  transform.position = { x: cx, y: cy };
  transform.anchor = { x: 0.5, y: 0.5 };

  return {
    id: this.context.generateId(),
    name: 'Ellipse',
    type: 'ellipse',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX,
    radiusY,
    fills: [this.context.defaultFill],
    strokes: [this.context.defaultStroke],
  };
}
```

Every shape tool creates nodes with the same boilerplate: a `(0.5, 0.5)` anchor so the position is the visual center, `defaultFill` and `defaultStroke` from the tool context, and all the required base node fields. The position is set to the computed center, and the geometry-specific fields (`radiusX`/`radiusY` for ellipses, `width`/`height` for rectangles) carry the shape's dimensions. The anchor is critical — without it, the shape's position would be its top-left corner in local space, and all the center-based math in the tool would produce shapes offset from where the user expects.

## Polygon: Inscribed Geometry

The polygon tool introduces something the rectangle and ellipse tools don't have: configurable options. A polygon can have between 3 and 12 sides, and it can optionally be a star shape with a configurable inner radius. These options persist across drawing operations — if you set 6 sides and draw three hexagons, all three have 6 sides.

### Tool Options

The options are stored as a private field with a typed interface:

```typescript
export interface PolygonToolOptions {
  sides: number;
  innerRadiusRatio: number;
  isStarMode: boolean;
}

export class PolygonTool extends BaseTool {
  private options: PolygonToolOptions = {
    sides: 5,
    innerRadiusRatio: 0.5,
    isStarMode: false,
  };

  setOptions(options: Partial<PolygonToolOptions>): void {
    if (options.sides !== undefined) {
      this.options.sides = Math.max(3, Math.min(12, Math.floor(options.sides)));
    }
    if (options.innerRadiusRatio !== undefined) {
      this.options.innerRadiusRatio = Math.max(0.1, Math.min(0.9, options.innerRadiusRatio));
    }
    if (options.isStarMode !== undefined) {
      this.options.isStarMode = options.isStarMode;
    }
  }
}
```

The clamping in `setOptions` enforces invariants silently. If the UI sends `sides: 2`, the tool stores 3. If it sends `innerRadiusRatio: 1.5`, the tool stores 0.9. This is defensive in the classic sense — the polygon math produces degenerate results with fewer than 3 sides, and an inner radius ratio of 0 or 1 produces a line or a regular polygon, neither of which is a useful star.

The defaults are chosen for visual appeal: a pentagon (5 sides) with a 0.5 inner radius ratio (a typical five-pointed star).

### Radius-Based Geometry

Unlike rectangles and ellipses, polygons aren't defined by a bounding box. A regular polygon is defined by a center and a radius — the circumscribed circle that passes through all vertices. The tool converts the drag gesture into these parameters:

```typescript
private getPolygonFromPoints(
  start: Vector2,
  end: Vector2,
  fromCenter: boolean
): { cx: number; cy: number; radius: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (fromCenter) {
    const radius = Math.sqrt(dx * dx + dy * dy);
    return { cx: start.x, cy: start.y, radius };
  }

  const width = Math.abs(dx);
  const height = Math.abs(dy);
  const radius = Math.min(width, height) / 2;

  const cx = start.x + dx / 2;
  const cy = start.y + dy / 2;

  return { cx, cy, radius };
}
```

The from-center case is elegant: the radius is simply the Euclidean distance from start to end. The polygon is inscribed in a circle centered at the click point, sized by how far the user drags. This feels natural — the further you drag, the bigger the polygon.

The from-corner case is less obvious. It inscribes the polygon in the smaller dimension of the bounding box, then centers it. This means dragging a wide rectangle produces a polygon inscribed in a circle whose diameter equals the height, not the width. The polygon never extends beyond the bounding box, which matches the mental model of "drawing inside the drag area."

Notice that the polygon tool doesn't support Shift-constrain. There's no `isConstrained(event)` call in `getPolygonFromPoints`. A regular polygon is already constrained — it's equilateral by definition. The Shift key has nothing useful to add. This is a conscious design decision, not an oversight.

### How the Renderer Uses Polygon Geometry

When the shape renderer encounters a `PolygonNode`, it generates the actual path geometry from the node's `sides`, `radius`, and optional `innerRadius` properties. This is where `createPolygonPath` and `createStarPath` from `pathUtils` do their work:

```typescript
// In ShapeRenderer
const pathPoints =
  node.innerRadius !== undefined
    ? createStarPath(0, 0, node.radius, node.innerRadius, node.sides, undefined, node.cornerRadius)
    : createPolygonPath(0, 0, node.radius, node.sides, undefined, node.cornerRadius);
```

The renderer decides which function to call based on whether `innerRadius` is present. This is the rendering-time distinction between a polygon and a star — the tool creates both as `PolygonNode`, but the presence or absence of `innerRadius` changes the generated geometry.

The path generation uses straightforward trigonometry. For a regular polygon:

```typescript
export function createPolygonPath(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  startAngle: number = Math.PI / 2,
  cornerRadius?: number
): PathPoint[] {
  if (sides < 3) sides = 3;

  const points: PathPoint[] = [];
  const angleStep = (Math.PI * 2) / sides;

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + i * angleStep;
    points.push(
      createCornerPoint({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      })
    );
  }

  if (cornerRadius && cornerRadius > 0) {
    return applyCornerRadius(points, true, cornerRadius);
  }

  return points;
}
```

Each vertex is placed at a uniform angular interval around the center. The `startAngle` defaults to `Math.PI / 2` (90 degrees, pointing straight up in our Y-up coordinate system), which means the first vertex of a polygon is at the top — a triangle points up, a pentagon has a flat bottom, a hexagon has a flat top.

The angle step is `2pi / sides`. For a triangle: 120 degrees between vertices. For a hexagon: 60 degrees. For a 12-sided polygon: 30 degrees. As the side count increases, the polygon approaches a circle — at 12 sides, it's already visually round at normal zoom levels. That's why we cap at 12 — beyond that, you should just use the ellipse tool.

All points are created as corner points (straight line segments). The optional `cornerRadius` parameter rounds the corners by replacing each corner point with a pair of Bezier handles — this is handled by `applyCornerRadius`, a function we'll explore in a later chapter when we cover per-vertex corner radius editing.

## Star: Alternating Radii

A star is a polygon with teeth. Mathematically, it's a polygon where every other vertex sits on a smaller concentric circle. The `createStarPath` function generates this by alternating between an outer and inner radius:

```typescript
export function createStarPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
  startAngle: number = Math.PI / 2,
  cornerRadius?: number
): PathPoint[] {
  if (points < 3) points = 3;

  const pathPoints: PathPoint[] = [];
  const angleStep = Math.PI / points;

  for (let i = 0; i < points * 2; i++) {
    const angle = startAngle + i * angleStep;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    pathPoints.push(
      createCornerPoint({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      })
    );
  }

  if (cornerRadius && cornerRadius > 0) {
    return applyCornerRadius(pathPoints, true, cornerRadius);
  }

  return pathPoints;
}
```

The key difference from `createPolygonPath` is the angle step. A regular polygon with 5 sides divides the circle into 5 equal parts: `angleStep = 2pi / 5 = 72 degrees`. A 5-pointed star has 10 vertices (5 outer, 5 inner) and divides the circle into 10 parts: `angleStep = pi / 5 = 36 degrees`. The general formula: `angleStep = pi / points`, not `2 * pi / points`.

The loop runs `points * 2` iterations, creating one outer vertex and one inner vertex per "point" of the star. Even indices (0, 2, 4, ...) land on the outer circle; odd indices (1, 3, 5, ...) land on the inner circle. The alternation produces the characteristic star shape — each outer peak connects to two inner valleys.

### Inner Radius as Absolute Value

The polygon tool stores `innerRadiusRatio` as a ratio (0.1 to 0.9), but the `PolygonNode` stores `innerRadius` as an absolute value in the same units as `radius`. The conversion happens during node creation:

```typescript
if (this.options.isStarMode) {
  node.innerRadius = radius * this.options.innerRadiusRatio;
}
```

This is important for the properties panel and for scaling. When the user resizes a star via the selection tool, the resize applies `transform.scale` — both radii scale proportionally because they're both in world units, and the scale factor applies uniformly to the entire geometry. If we stored a ratio instead, scaling would have no effect on the ratio, and we'd need special-case code everywhere.

The ratio lives in the tool only. It's a UI concept — "make the inner radius 50% of the outer radius" — not a geometric concept. Once the shape is committed, it's defined by two absolute radii.

### The Star/Polygon Duality

The same `PolygonNode` type represents both regular polygons and stars. The only difference is whether `innerRadius` is present:

```typescript
private createPolygonNode(
  cx: number, cy: number, radius: number
): PolygonNode {
  // ... boilerplate ...

  const node: PolygonNode = {
    // ... common fields ...
    sides: this.options.sides,
    radius,
    name: this.options.isStarMode ? 'Star' : 'Polygon',
  };

  if (this.options.isStarMode) {
    node.innerRadius = radius * this.options.innerRadiusRatio;
  }

  return node;
}
```

This is a tagged union by presence rather than by discriminant. A polygon is a star with no inner radius. A star is a polygon with one. The renderer checks `node.innerRadius !== undefined` to decide which path function to call, and the rest of the system — selection, transform, export — treats them identically.

We considered a separate `StarNode` type early on. It would have been cleaner from a type system perspective, but it would have doubled the amount of code in the rendering pipeline, the selection system, the properties panel, and the serializer — all for a shape that differs in exactly one optional field. The pragmatic choice was to use one node type with an optional property.

## The Cancellation Contract

All four shape tools implement the same `onKeyDown` handler:

```typescript
onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && this.state.isDragging) {
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }
}
```

Pressing Escape during a drag cancels the operation. The preview node is discarded (the canvas will see `null` on its next render frame and stop drawing it), the start point is cleared, and the tool state resets. No node is added to the scene graph. No undo snapshot was pushed (because `onTransformStart` only fires on commit, not during the drag). The canvas returns to exactly the state it was in before the drag began.

The check for `this.state.isDragging` prevents Escape from doing anything when the user isn't actively drawing. If the tool is idle, Escape falls through to higher-level handlers (like exiting a group or clearing the selection).

## Node Creation Anatomy

Every shape tool's `createXxxNode` method follows the same template:

```typescript
const transform = createDefaultTransform();
transform.position = { x: cx, y: cy };
transform.anchor = { x: 0.5, y: 0.5 };

return {
  id: this.context.generateId(),
  name: 'Rectangle', // Tool-specific
  type: 'rectangle', // Tool-specific
  parent: null,
  children: [],
  transform,
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  // ... geometry-specific fields
  fills: [this.context.defaultFill],
  strokes: [this.context.defaultStroke],
};
```

The shared fields:

- **`id`**: Generated by the tool context. Timestamp + counter, guaranteed unique (see Chapter 11).
- **`parent: null`**: New shapes always start at the root level. If the user is inside a group or artboard, the scene graph's `addNode` method handles reparenting.
- **`children: []`**: Shape nodes are leaf nodes. Only groups and artboards have children.
- **`transform`**: Position at the computed center, anchor at (0.5, 0.5). The `createDefaultTransform` function provides the rest (rotation: 0, scale: {1, 1}).
- **`fills` and `strokes`**: From the tool context's defaults. Typically a solid blue fill and a dark stroke — these are editor-wide defaults that the user can change.
- **`opacity: 1, blendMode: 'normal'`**: Sensible defaults that the user can adjust later in the properties panel.

The geometry-specific fields vary by tool:

| Tool      | Geometry Fields                              |
| --------- | -------------------------------------------- |
| Rectangle | `width`, `height`, `cornerRadius: [0,0,0,0]` |
| Ellipse   | `radiusX`, `radiusY`                         |
| Polygon   | `sides`, `radius`                            |
| Star      | `sides`, `radius`, `innerRadius`             |

The rectangle's `cornerRadius` is a 4-element array because each corner can be rounded independently — a feature exposed in the properties panel and in the direct selection tool. It defaults to all zeros (sharp corners).

## Preview Rendering Integration

The preview system is simple enough that it's worth seeing the complete data flow. During a drag:

1. The tool stores a preview node as a private field.
2. The `ToolManager` calls `getPreviewNode()` on the active tool.
3. The canvas render loop calls `toolManager.getPreviewNode()` every frame.
4. If a node is returned, it's passed to `shapeRenderer.renderNode()`.
5. The shape renderer draws it with the same pipeline as scene graph nodes.

There's no batching, no special preview pipeline, no transparency overlay. The preview node is rendered with full fills and strokes, exactly as the final shape will appear. The user sees the shape they'll get.

The tool updates the preview node in place during the drag:

```typescript
// In onPointerMove
this.previewNode.transform.position = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
this.previewNode.width = rect.width;
this.previewNode.height = rect.height;
```

This is one of the few places in the codebase where a node is mutated directly. Scene graph nodes are normally updated through `sceneGraph.updateNode()` to trigger change events. But the preview node isn't in the scene graph — it's a floating object in the tool's memory. Mutating it directly is fine because nothing is listening for changes. The render loop simply reads the current state every frame.

## Keyboard Shortcuts and Registration

Shape tools are registered in the tool manager constructor with keyboard shortcuts:

```typescript
// In ToolManager constructor
this.tools.set('rectangle', new RectangleTool(context));
this.tools.set('ellipse', new EllipseTool(context));
this.tools.set('polygon', new PolygonTool(context));

const starTool = new PolygonTool(context);
starTool.setStarMode(true);
this.tools.set('star', starTool);
```

The star doesn't have its own tool class. It's the polygon tool with `isStarMode: true`. When the user presses S, the tool manager activates the polygon tool and calls `setStarMode(true)`. When they press U, it activates the polygon tool and calls `setStarMode(false)`. One class, two shortcuts, two modes.

This is a pattern worth noting: not every conceptual tool needs its own class. The polygon and star share 95% of their code — the same drag model, the same node type, the same rendering path. The only differences are the `isStarMode` flag and the computed inner radius. A separate `StarTool` class would duplicate 200 lines to change 5.

## Testing Shape Tools

Shape tools are straightforward to test because they're pure state machines. You feed them events, and you check what they produce. Here's the typical pattern:

```typescript
describe('RectangleTool', () => {
  let tool: RectangleTool;
  let context: ToolContext;
  let addedNodes: Node[];

  beforeEach(() => {
    addedNodes = [];
    context = createMockToolContext({
      onAddNode: (node) => addedNodes.push(node),
    });
    tool = new RectangleTool(context);
  });

  it('creates a rectangle on drag', () => {
    tool.onPointerDown(makeEvent({ x: 0, y: 0 }));
    tool.onPointerMove(makeEvent({ x: 100, y: 50 }));
    tool.onPointerUp(makeEvent({ x: 100, y: 50 }));

    expect(addedNodes).toHaveLength(1);
    expect(addedNodes[0].type).toBe('rectangle');
    expect((addedNodes[0] as RectangleNode).width).toBe(100);
    expect((addedNodes[0] as RectangleNode).height).toBe(50);
  });

  it('constrains to square with Shift', () => {
    tool.onPointerDown(makeEvent({ x: 0, y: 0 }));
    tool.onPointerUp(makeEvent({ x: 100, y: 50 }, { shiftKey: true }));

    const node = addedNodes[0] as RectangleNode;
    expect(node.width).toBe(node.height);
    expect(node.width).toBe(100); // Takes the larger dimension
  });

  it('does not create shape below minimum size', () => {
    tool.onPointerDown(makeEvent({ x: 0, y: 0 }));
    tool.onPointerUp(makeEvent({ x: 0.5, y: 0.5 }));

    expect(addedNodes).toHaveLength(0);
  });

  it('cancels on Escape', () => {
    tool.onPointerDown(makeEvent({ x: 0, y: 0 }));
    tool.onPointerMove(makeEvent({ x: 100, y: 100 }));
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(tool.getPreviewNode()).toBeNull();
  });
});
```

The mock context intercepts everything the tool does — adding nodes, setting selection, changing tools. The `makeEvent` helper creates `CanvasPointerEvent` objects with sensible defaults. No canvas, no renderer, no WebGL context. The tools are tested as pure logic.

The polygon tool tests are slightly more involved because they exercise the options system:

```typescript
it('creates a hexagon with 6 sides', () => {
  (tool as PolygonTool).setSides(6);

  tool.onPointerDown(makeEvent({ x: 0, y: 0 }));
  tool.onPointerUp(makeEvent({ x: 100, y: 100 }));

  const node = addedNodes[0] as PolygonNode;
  expect(node.sides).toBe(6);
  expect(node.innerRadius).toBeUndefined();
});

it('creates a star with inner radius', () => {
  (tool as PolygonTool).setStarMode(true);
  (tool as PolygonTool).setInnerRadiusRatio(0.4);

  tool.onPointerDown(makeEvent({ x: 0, y: 0 }));
  tool.onPointerUp(makeEvent({ x: 100, y: 100 }));

  const node = addedNodes[0] as PolygonNode;
  expect(node.innerRadius).toBeDefined();
  expect(node.innerRadius).toBeCloseTo(node.radius * 0.4);
});

it('clamps sides to valid range', () => {
  (tool as PolygonTool).setSides(1);
  expect((tool as PolygonTool).getOptions().sides).toBe(3);

  (tool as PolygonTool).setSides(100);
  expect((tool as PolygonTool).getOptions().sides).toBe(12);
});
```

These tests verify behavior, not implementation. They don't check internal state or mock private methods. They simulate what the user does (set options, drag, release) and verify what the user gets (a node with the right properties).

## Lessons

**The drag-to-create lifecycle is a template, not just a pattern.** Press captures the start point, move updates a preview, release commits the final shape. Every creation tool follows this three-phase lifecycle with the same modifier key conventions (Shift for constraint, Alt for center-origin, Escape to cancel). Establishing the template once in BaseTool means new shape tools are 90% boilerplate-free.

**Preview nodes should be real nodes, not lightweight overlays.** The preview is a full shape node passed to the same rendering pipeline as committed shapes. What the user sees during the drag is pixel-identical to what they get on release. A separate preview system would eventually diverge from the real renderer and produce "what you see is not what you get" surprises.

**Not every conceptual tool needs its own class.** The polygon tool and star tool share one implementation with a boolean flag. A separate StarTool would duplicate 200 lines to change 5. The pragmatic threshold is whether the tools share enough code that maintaining two copies would be worse than maintaining one class with a mode.

**Store the natural representation, not the UI representation.** The polygon tool's `innerRadiusRatio` (a 0-1 slider value) exists only in the tool. The committed PolygonNode stores `innerRadius` as an absolute value in world units, because that's what the renderer, serializer, and scale transform need. Converting UI concepts to geometric concepts at commit time keeps the data model clean.

**Geometry helpers in the base class earn their keep through reuse.** `getRectFromPoints` handles constraint, center-origin, and normalization in 25 lines. Three tools call it. Without the shared helper, that's 75 lines of fiddly geometry math duplicated across three files, each a potential source of subtle sign or normalization bugs.

## What We Built

This chapter covered four shape tools — about 650 lines across three files, plus the path generation functions:

- **RectangleTool**: Drag-to-create rectangles with width/height geometry. The simplest shape tool, establishing the pattern that all others follow.
- **EllipseTool**: Drag-to-create ellipses with radiusX/radiusY geometry. Its own `getEllipseFromPoints` avoids an unnecessary bounding-box indirection.
- **PolygonTool**: Drag-to-create regular polygons with configurable side count (3-12). Introduces persistent tool options and radius-based geometry.
- **Star mode**: A flag on the polygon tool that adds an `innerRadius`, producing star shapes with alternating outer/inner vertices.
- **Shared patterns**: All tools use Shift for constraint, Alt for center-origin, Escape to cancel, auto-select on commit, auto-switch to selection tool.
- **`createPolygonPath`**: Distributes vertices evenly around a circle using `2pi/sides` angular steps.
- **`createStarPath`**: Alternates between outer and inner radii using `pi/points` angular steps, producing twice the vertex count.
- **Preview rendering**: Tools create real nodes, the canvas polls for them, the shape renderer draws them identically to committed shapes.

The shape tools are the simplest tools in the system. They have no persistent state beyond the current drag, no complex hit testing, no multi-step workflows. But they establish the interaction patterns that every creation tool will follow: capture, preview, commit, auto-switch. The pen tool, brush tool, and text tool — which we'll build in the next chapters — are more complex, but they follow the same lifecycle.
