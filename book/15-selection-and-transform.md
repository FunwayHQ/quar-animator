# Selection & Transform

## The Editor Within the Editor

The previous chapters built tools that create geometry. The pen tool constructs paths. The brush tool draws freehand curves. Shape tools stamp rectangles, ellipses, and polygons onto the canvas. But creation is only half the story — after a shape exists, the user needs to select it, move it, resize it, and rotate it. These operations sound simple. They are not.

The selection tool is the most complex single tool in the editor. It handles six distinct interaction modes: idle (hover and cursor updates), clicking to select a node, Shift-clicking to toggle selection, dragging to move nodes, marquee-dragging to select a region, dragging resize handles to scale nodes, and dragging rotation zones to spin nodes. Each mode has its own pointer down / move / up behavior, its own modifier key interpretation, and its own escape-to-cancel semantics. Layer this with support for multiple node types (each with different resize strategies), snapping to grids and guides, nested group scoping, and auto-reparenting into artboards, and you have a tool that spans nearly 1,500 lines of code.

This chapter walks through every subsystem: hit testing, selection management, bounding box computation, transform handles, the resize algorithm, and rotation. We'll see why "resize a rectangle" and "resize a polygon" require fundamentally different approaches, why proportional position mapping uses world coordinates even when nodes store local positions, and why the simple act of clicking near a corner can mean either "resize" or "rotate" depending on whether you're inside or outside the selection bounds.

## Hit Testing: Finding What's Under the Cursor

Every interaction starts with the same question: what is the user pointing at? Hit testing transforms a screen-space click into a scene graph node.

The approach is straightforward — traverse every visible node in the scene graph, check if the click point falls inside the node's world-space bounding box, and keep the last match (since later nodes in traversal order are visually on top):

```typescript
hitTest(worldPoint: Vector2): Node | null {
  let hitNode: Node | null = null;

  this.context.sceneGraph.traverseVisible((node) => {
    if (this.isPointInNode(worldPoint, node)) {
      hitNode = node;
    }
  });

  return hitNode;
}
```

This is a brute-force linear scan. Every visible node is tested on every click. For an editor with hundreds of shapes, a spatial index (quadtree, R-tree) would be necessary. But for the typical workload of a few dozen shapes, the linear scan is fast enough and trivially correct — no data structure to maintain or invalidate.

### Bounding Box Hit Testing

The `isPointInNode` method computes each node's axis-aligned bounding box in world space, then checks containment:

```typescript
private isPointInNode(point: Vector2, node: Node): boolean {
  const bounds = this.getNodeBounds(node);
  if (!bounds) return false;

  if (node.type === 'path') {
    const hitTolerance = 8 / this.context.camera.zoom;
    const expandedBounds = {
      x: bounds.x - hitTolerance,
      y: bounds.y - hitTolerance,
      width: Math.max(bounds.width, hitTolerance * 2) + hitTolerance * 2,
      height: Math.max(bounds.height, hitTolerance * 2) + hitTolerance * 2,
    };
    return rect.contains(expandedBounds, point);
  }

  return rect.contains(bounds, point);
}
```

Paths get special treatment. A thin vertical line might have a bounding box only 1 pixel wide — essentially impossible to click. The 8-pixel screen-space tolerance (`8 / camera.zoom` converts to world units) makes paths clickable regardless of their actual width. The `Math.max` ensures that even a zero-width path gets a clickable target.

This is bounding-box hit testing, not point-in-polygon testing. It means you can click on empty space inside a concave shape's bounding box and "hit" the shape. A production editor would use GPU picking (render each shape with a unique color, read back the pixel) or analytic point-in-polygon tests. Bounding box testing is a deliberate simplification that works well enough for convex shapes and keeps the hit testing code manageable.

### Computing Node Bounds

The `getNodeBounds` method is a dispatch table — each node type computes its local-space bounding box differently, then the result is transformed to world space:

```typescript
private getNodeBounds(node: Node): Rect | null {
  let localBounds: Rect | null = null;

  switch (node.type) {
    case 'rectangle': {
      const anchor = node.transform.anchor;
      localBounds = {
        x: -node.width * anchor.x,
        y: -node.height * anchor.y,
        width: node.width,
        height: node.height,
      };
      break;
    }
    case 'ellipse':
      localBounds = {
        x: -node.radiusX,
        y: -node.radiusY,
        width: node.radiusX * 2,
        height: node.radiusY * 2,
      };
      break;
    case 'polygon':
      localBounds = getPolygonBounds(0, 0, node.radius, node.sides, 1, 1, node.innerRadius);
      break;
    case 'path': {
      const primaryBounds = getPathBounds(node.points, node.closed);
      // Include subpath bounds for compound paths...
      localBounds = primaryBounds;
      break;
    }
    // ... image, text, bone, artboard, symbol-instance
  }

  if (!localBounds) return null;

  let worldMatrix: Matrix3;
  if (node.parent) {
    worldMatrix = this.context.sceneGraph.getWorldTransform(node.id);
  } else {
    worldMatrix = mat3.compose(transform.position, transform.rotation, transform.scale);
  }

  return transformBoundsToWorld(localBounds, worldMatrix);
}
```

The key subtlety is the world matrix computation. For root-level nodes (no parent), we compose position, rotation, and scale directly — but _not_ anchor. Why? Because the local bounds already account for anchor via the `-width * anchor.x` offset. Including anchor in the matrix would double-count it.

For nested nodes (children of groups), we use `getWorldTransform`, which includes the full parent chain. A rectangle inside a group that's inside another group needs the cumulative transform of both ancestors.

The `transformBoundsToWorld` helper transforms all four corners of the local AABB through the world matrix, then computes the axis-aligned bounding box of those transformed corners:

```typescript
function transformBoundsToWorld(localBounds: Rect, worldMatrix: Matrix3): Rect {
  const { x, y, width, height } = localBounds;
  const corners = [
    mat3.transformPoint(worldMatrix, { x, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y: y + height }),
    mat3.transformPoint(worldMatrix, { x, y: y + height }),
  ];

  let minX = corners[0].x,
    minY = corners[0].y;
  let maxX = corners[0].x,
    maxY = corners[0].y;
  for (let i = 1; i < 4; i++) {
    if (corners[i].x < minX) minX = corners[i].x;
    if (corners[i].y < minY) minY = corners[i].y;
    if (corners[i].x > maxX) maxX = corners[i].x;
    if (corners[i].y > maxY) maxY = corners[i].y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
```

This handles rotation correctly — a rotated rectangle's AABB is larger than its unrotated AABB. The four-corner approach generalizes to any affine transform (rotation, scale, skew).

## Selection Management

Once we know what's under the cursor, we need to manage the set of selected nodes and compute their combined bounding box. The `SelectionManager` handles this.

### The SelectionBounds Type

A selection's bounding information is simple:

```typescript
interface SelectionBounds {
  rect: Rect; // Axis-aligned bounding rectangle in world space
  center: Vector2; // Center point of the selection
}
```

The `center` is used as the pivot for rotation and as the reference point for proportional resize. For a single selected node, the center is the node's position. For multiple nodes, it's the geometric center of their combined AABB.

### Single vs. Multi Selection Bounds

The `getSelectionBoundsForDisplay` method handles the distinction between single and multi selection, which matters for the visual overlay:

```typescript
getSelectionBoundsForDisplay(
  selectedIds: Set<string>,
  sceneGraph: SceneGraph
): { bounds: SelectionBounds; rotation: number } | null {

  if (selectedIds.size === 1) {
    const node = sceneGraph.getNode([...selectedIds][0]);
    if (!node || !node.visible) return null;

    // Groups: compute bounds from descendants
    if (node.type === 'group' || node.type === 'symbol-instance') {
      const bounds = this.getGroupBounds(node, sceneGraph);
      return bounds ? { bounds, rotation: 0 } : null;
    }

    // Single node: un-rotated bounds + rotation angle
    let nodeBounds: Rect | null;
    if (node.parent) {
      // Nested: compose with parent's world transform
      const parentWorld = sceneGraph.getWorldTransform(node.parent);
      const localNoRot = mat3.compose(node.transform.position, 0, node.transform.scale);
      const worldNoRot = mat3.multiply(parentWorld, localNoRot);
      nodeBounds = transformBoundsToWorld(localBounds, worldNoRot);
    } else {
      nodeBounds = this.getNodeBoundsUnrotated(node);
    }

    return {
      bounds: { rect: nodeBounds, center: rotationCenter },
      rotation: node.transform.rotation,
    };
  }

  // Multi-selection: AABB of all nodes, no visual rotation
  const bounds = this.getSelectionBounds(selectedIds, sceneGraph);
  return bounds ? { bounds, rotation: 0 } : null;
}
```

The critical design decision: single selection returns un-rotated bounds plus a rotation angle, while multi selection returns rotation-aware bounds with rotation zero. This is because the SVG overlay renders a rotated rectangle for single selection (the selection box follows the shape's rotation), but for multi selection, it shows an axis-aligned box encompassing everything.

This means the bounds rect for a single rotated rectangle is its un-rotated dimensions (width × height as defined in the node), not its AABB. The SVG overlay applies a CSS `rotate()` transform to visualize the rotation. This way, the resize handles stay on the corners of the actual shape, not on the corners of its axis-aligned bounding box.

### Local Bounds

The `getLocalBounds` method returns the geometry of a node before any transform is applied — the shape in its own coordinate system:

```typescript
private getLocalBounds(node: Node): Rect | null {
  switch (node.type) {
    case 'rectangle': {
      const anchor = node.transform.anchor;
      return {
        x: -node.width * anchor.x,
        y: -node.height * anchor.y,
        width: node.width,
        height: node.height,
      };
    }
    case 'ellipse':
      return {
        x: -node.radiusX,
        y: -node.radiusY,
        width: node.radiusX * 2,
        height: node.radiusY * 2,
      };
    case 'path': {
      const primaryBounds = getPathBounds(node.points, node.closed);
      // Include subpaths...
      return primaryBounds;
    }
    // ... other types
  }
}
```

The anchor offset is what makes local bounds tricky. A rectangle with anchor (0.5, 0.5) has its local origin at the center, so the local bounds start at `(-width/2, -height/2)`. A rectangle with anchor (0, 0) has local bounds starting at the origin. The ellipse always uses the center as its anchor, so its local bounds are symmetric around the origin.

Path nodes don't use anchor in their local bounds — their points already define the geometry relative to the node's position. This is why, as we saw in Chapter 13, the pen tool centers path geometry and sets anchor to (0.5, 0.5) after creation.

## Transform Handles

When you select a shape in any graphic editor, you see small squares at the corners and edge midpoints. These are the transform handles — dragging them resizes the shape, and hovering just outside a corner reveals a rotation cursor.

### Handle Types

The type system defines twelve handle positions:

```typescript
type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'rotate-top-left'
  | 'rotate-top-right'
  | 'rotate-bottom-left'
  | 'rotate-bottom-right';
```

Eight resize handles (four corners, four edges) and four rotation zones (one outside each corner). The rotation zones aren't visible — they're invisible hit areas that activate when the cursor is near a corner but outside the selection bounds.

### Handle Hit Testing

The `TransformHandles.hitTest` method determines which handle (if any) the cursor is over:

```typescript
hitTest(
  screenPoint: Vector2,
  bounds: SelectionBounds,
  camera: Camera,
  rotation: number = 0
): HandlePosition | null {
  const handles = this.getHandles(bounds, camera);
  const hitRadius = this.config.handleHitRadius; // 12px

  // Compensate for visual rotation
  let testPoint = screenPoint;
  if (rotation !== 0) {
    const screenCenter = camera.worldToScreen(bounds.center);
    const rad = rotation * (Math.PI / 180);
    const dx = screenPoint.x - screenCenter.x;
    const dy = screenPoint.y - screenCenter.y;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    testPoint = {
      x: screenCenter.x + dx * cos - dy * sin,
      y: screenCenter.y + dx * sin + dy * cos,
    };
  }

  // 1. Resize handles first (priority over rotation)
  for (const handle of handles) {
    if (vec2.distance(testPoint, handle.screenPosition) <= hitRadius) {
      return handle.position;
    }
  }

  // 2. Rotation zones — near corner but OUTSIDE bounds
  const rotationRadius = this.config.rotationZoneRadius; // 20px
  for (const corner of cornerHandles) {
    const distance = vec2.distance(testPoint, corner.screenPosition);
    if (distance <= rotationRadius && this.isOutsideBounds(testPoint, handles)) {
      return CORNER_TO_ROTATE[corner.position];
    }
  }

  return null;
}
```

The rotation compensation is essential. The SVG overlay renders handles at un-rotated positions, then applies a CSS rotation to the entire group. But the mouse cursor is in screen space, unrotated. To test correctly, we inverse-rotate the cursor point around the selection center, mapping it back to the un-rotated coordinate system where the handles live.

The priority order matters: resize handles are checked first. If the cursor is exactly on a corner handle, it should resize, not rotate. The rotation zone is only checked if no resize handle was hit, and it requires the additional constraint that the cursor is outside the selection bounds rectangle. This is the Figma-style interaction: hover inside a corner to resize, hover just outside to rotate.

### The Rotation Cursor

The rotation cursor deserves special mention. Standard CSS cursor values (`pointer`, `crosshair`, etc.) don't include a rotation cursor. We generate one procedurally as an SVG data URI:

```typescript
function makeRotateCursor(rotateDeg: number): string {
  const cx = 16,
    cy = 16,
    r = 9;
  const startAngle = (215 * Math.PI) / 180;
  const endAngle = (325 * Math.PI) / 180;
  // Arc path...
  // Arrowhead triangle at arc tip...

  const svg = `<svg xmlns='...' width='32' height='32'>
    <g transform='rotate(${rotateDeg} 16 16)'>
      <path d='${arc}' stroke='%23000' stroke-opacity='0.5' stroke-width='3'/>
      <path d='${arc}' stroke='white' stroke-width='1.6'/>
      <path d='${arrow}' fill='white'/>
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, pointer`;
}
```

Four variants are generated — one for each corner, rotated by 0, 90, 180, and 270 degrees. The dual-layer technique (dark shadow underneath, white on top) ensures the cursor is visible against both light and dark backgrounds. The `16 16` in the cursor declaration sets the hotspot to the center of the 32x32 SVG.

## The Selection Tool State Machine

With hit testing, selection management, and transform handles in place, we can assemble the selection tool. It's organized as a state machine with six modes:

```typescript
type SelectionMode = 'idle' | 'selecting' | 'moving' | 'marquee' | 'resizing' | 'rotating';
```

### Pointer Down: Deciding What to Do

The `onPointerDown` handler must decide, in a single mouse click, which of several different operations to start. The decision tree:

1. **Transform handle hit?** Check if the click lands on a resize handle or rotation zone. If so, start resizing or rotating.
2. **Double-click on group/artboard/symbol?** Enter the container for scoped selection.
3. **Double-click on path?** Switch to direct selection tool for vertex editing.
4. **Double-click on text?** Enter inline text editing mode.
5. **Click on node?** Select it (or toggle if Shift held). Start move mode.
6. **Click on empty space?** Clear selection, start marquee.

```typescript
onPointerDown(event: CanvasPointerEvent): void {
  if (event.button !== 0) return;

  const worldPos = { ...event.worldPosition };
  const screenPos = { ...event.screenPosition };
  this.startPoint = worldPos;

  // 1. Check transform handles (skip on double-click)
  const selectedIds = this.context.getSelectedIds();
  if (selectedIds.size > 0 && event.clickCount !== 2) {
    const displayResult = this.selectionManager.getSelectionBoundsForDisplay(
      selectedIds, this.context.sceneGraph
    );

    if (displayResult) {
      const hitHandle = this.transformHandles.hitTest(
        screenPos, displayResult.bounds, this.context.camera, displayResult.rotation
      );

      if (hitHandle?.startsWith('rotate-')) {
        this.context.onTransformStart?.();
        this.mode = 'rotating';
        // Capture initial angle and rotations...
        return;
      } else if (hitHandle) {
        this.context.onTransformStart?.();
        this.mode = 'resizing';
        this.resizeState = {
          handle: hitHandle,
          initialBounds: displayResult.bounds,
          initialNodeStates: this.captureNodeStates(selectedIds),
        };
        return;
      }
    }
  }

  // 2-4. Double-click special cases...

  // 5. Hit test for node selection
  const rawHit = this.hitTest(worldPos);
  const hitNode = rawHit ? this.resolveHitToScope(rawHit) : null;

  if (hitNode) {
    // Select + start move mode
    if (!this.isAdditive(event) && !selectedIds.has(hitNode.id)) {
      this.context.setSelectedIds([hitNode.id]);
    }
    this.context.onTransformStart?.();
    this.mode = 'moving';

    // Store initial positions for delta-based movement
    this.moveStartPositions.clear();
    for (const id of this.context.getSelectedIds()) {
      const node = this.context.sceneGraph.getNode(id);
      if (node) {
        this.moveStartPositions.set(id, { ...node.transform.position });
      }
    }
  } else {
    // 6. Empty space click → marquee
    this.context.clearSelection();
    this.mode = 'marquee';
    this.marqueeRect = { x: worldPos.x, y: worldPos.y, width: 0, height: 0 };
  }
}
```

The `event.clickCount !== 2` guard on transform handle testing is important. Without it, double-clicking a selected group to enter it would instead start a resize operation (the double-click lands on a handle). The guard ensures double-click always reaches the group-enter logic.

The `onTransformStart` callback is called before any transform begins. This is the undo snapshot point — the Canvas component uses this to capture the scene graph state before the drag modifies anything. One snapshot per drag, not per frame.

### Moving Nodes

Movement uses delta-based position updates. When the drag starts, we capture each selected node's position. On each pointer move, we compute the world-space delta from the drag start point and add it to the captured positions:

```typescript
if (this.mode === 'moving') {
  const delta = vec2.subtract(worldPos, this.startPoint);

  for (const [id, startPos] of this.moveStartPositions) {
    const node = this.context.sceneGraph.getNode(id);
    if (node) {
      const rawPos = vec2.add(startPos, delta);
      const newPos = this.snapNodePosition(node, rawPos);
      this.context.sceneGraph.updateNode(id, {
        transform: { ...node.transform, position: newPos },
      });
    }
  }
}
```

Delta-based movement (compute delta from start, add to captured positions) is more robust than incremental movement (compute delta from last frame, add to current position). Incremental movement accumulates floating-point errors over long drags. Delta-based movement always computes the final position from the original, so there's no drift regardless of how many frames the drag spans.

The `snapNodePosition` method handles snapping to both grid lines and guides. Guide snapping takes priority when the guide is closer than the grid:

```typescript
private snapNodePosition(node: Node, centerPos: Vector2): Vector2 {
  if (!gridEnabled && !guideEnabled) return centerPos;

  const size = this.getNodeBoundsSize(node);
  const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };

  // Compute all edges
  const left = centerPos.x - size.width * anchor.x;
  const right = left + size.width;
  const bottom = centerPos.y - size.height * anchor.y;
  const top = bottom + size.height;

  // Try guide snap first (checks all edges + center)
  const guideSnapX = this.snapToGuide([left, right, centerPos.x], 'x');
  const guideSnapY = this.snapToGuide([top, bottom, centerPos.y], 'y');

  let dx = 0, dy = 0;

  if (guideSnapX != null) {
    dx = guideSnapX;           // Guide wins
  } else if (gridEnabled) {
    const snappedTL = this.snapPosition({ x: left, y: top });
    dx = snappedTL.x - left;   // Grid fallback
  }

  // ... same for dy

  return { x: centerPos.x + dx, y: centerPos.y + dy };
}
```

The snap checks all five edge values for each axis — left, right, and center for X; top, bottom, and center for Y. This means a shape can snap to a guide at any edge, not just the closest one. The guide-versus-grid priority is per-axis: X might snap to a guide while Y snaps to the grid.

### Marquee Selection

When the user clicks on empty space and drags, they're drawing a selection rectangle. Every node that intersects the rectangle gets selected:

```typescript
if (this.mode === 'marquee') {
  this.marqueeRect = rect.fromPoints(this.startPoint, worldPos);
}
```

On pointer up, we find all intersecting nodes:

```typescript
private getNodesInRect(selectionRect: Rect): Node[] {
  const scopedIds = new Set<string>();
  const scopedNodes: Node[] = [];

  this.context.sceneGraph.traverseVisible((node) => {
    let bounds = this.getNodeBounds(node);
    if (!bounds) return;

    if (rect.intersects(selectionRect, bounds)) {
      const scoped = this.resolveHitToScope(node);
      if (scoped && !scopedIds.has(scoped.id)) {
        scopedIds.add(scoped.id);
        scopedNodes.push(scoped);
      }
    }
  });

  return scopedNodes;
}
```

The `resolveHitToScope` call and the `Set` deduplication are critical. Without scope resolution, marquee-selecting a group's children would add the individual children to the selection, even though the user should be selecting the group (unless they've entered it). Without deduplication, a group with three children that all intersect the marquee would add the group three times.

## Resizing Nodes

Resizing is where the selection tool's complexity peaks. It must:

1. Track which handle the user is dragging
2. Compute new bounding box dimensions from the drag delta
3. Apply aspect-ratio constraints (Shift) and center-origin resize (Alt)
4. Map the bounding box change to per-node property updates
5. Handle different node types differently (width/height vs. radiusX/Y vs. scale)
6. Maintain proportional position for multi-selection
7. Convert between world and local coordinates for nested nodes

### Capturing Initial State

Before any resize begins, we snapshot the state of every selected node:

```typescript
interface NodeResizeState {
  position: Vector2; // Local-space position
  worldPosition: Vector2; // World-space position (for proportional mapping)
  parentWorldTransform?: Matrix3;
  width?: number; // For rectangle, image, artboard
  height?: number;
  radiusX?: number; // For ellipse
  radiusY?: number;
  radius?: number; // For polygon
  scale?: Vector2; // For polygon, path, text, group
}
```

The `worldPosition` field is the key to multi-selection resize. When multiple nodes are selected, each node's position within the selection bounds determines how it moves during resize. But node positions are stored in local space (relative to their parent). We need world-space positions for proportional mapping because the selection bounds are in world space.

```typescript
private captureNodeStates(selectedIds: Set<string>): Map<string, NodeResizeState> {
  const states = new Map();

  for (const id of selectedIds) {
    const node = this.context.sceneGraph.getNode(id);
    if (!node) continue;

    let worldPosition: Vector2;
    let parentWorldTransform: Matrix3 | undefined;

    if (node.parent) {
      parentWorldTransform = this.context.sceneGraph.getWorldTransform(node.parent);
      worldPosition = mat3.transformPoint(parentWorldTransform, node.transform.position);
    } else {
      worldPosition = { ...node.transform.position };
    }

    const state: NodeResizeState = { position: { ...node.transform.position }, worldPosition, parentWorldTransform };

    if (node.type === 'rectangle') {
      state.width = node.width;
      state.height = node.height;
    } else if (node.type === 'polygon') {
      state.radius = node.radius;
      state.scale = { ...node.transform.scale };
    } else if (node.type === 'path' || node.type === 'text' || node.type === 'group') {
      state.scale = { ...node.transform.scale };
    }
    // ...

    states.set(id, state);
  }

  return states;
}
```

The type dispatch reveals a fundamental architectural split: rectangles, images, and artboards have explicit `width` and `height` properties. Ellipses have `radiusX` and `radiusY`. But polygons, paths, text, and groups don't have explicit dimensions — they use `transform.scale` to resize. This split exists because a rectangle's width is a meaningful property (it defines the shape), while a path's points define the shape and scaling them is just a transform.

### Computing New Bounds

The `calculateNewBounds` method takes the initial selection bounds, the dragged handle, and the world-space delta, and produces new bounds:

```typescript
private calculateNewBounds(
  initial: Rect, handle: HandlePosition,
  delta: Vector2, constrained: boolean, fromCenter: boolean
): Rect {
  let { x, y, width, height } = initial;

  switch (handle) {
    case 'top-left':
      x += delta.x; y += delta.y;
      width -= delta.x; height -= delta.y;
      break;
    case 'top':
      y += delta.y; height -= delta.y;
      break;
    case 'right':
      width += delta.x;
      break;
    case 'bottom-right':
      width += delta.x; height += delta.y;
      break;
    // ... 4 more cases
  }

  // Aspect ratio constraint
  if (constrained) {
    const initialAspect = initial.width / initial.height;
    const currentAspect = width / height;

    if (currentAspect > initialAspect) {
      const newHeight = width / initialAspect;
      if (handle.includes('top')) y -= newHeight - height;
      height = newHeight;
    } else {
      const newWidth = height * initialAspect;
      if (handle.includes('left')) x -= newWidth - width;
      width = newWidth;
    }
  }

  // Center-origin resize
  if (fromCenter) {
    const centerX = initial.x + initial.width / 2;
    const centerY = initial.y + initial.height / 2;
    const dw = width - initial.width;
    const dh = height - initial.height;
    width = initial.width + dw * 2;
    height = initial.height + dh * 2;
    x = centerX - width / 2;
    y = centerY - height / 2;
  }

  // Minimum size enforcement
  if (width < 1) width = 1;
  if (height < 1) height = 1;

  return { x, y, width, height };
}
```

The handle-to-delta mapping is pure arithmetic, but the details matter. When dragging the top-left corner, both the origin and the dimensions change — the box moves and resizes simultaneously. When dragging the right edge, only the width changes. The aspect ratio constraint adjusts whichever dimension is proportionally further from the target ratio, and repositions the origin if the adjustment affects the left or top edge.

The center-origin resize (Alt key) doubles the size delta symmetrically around the center. A 10-pixel rightward drag of the right edge normally adds 10 pixels to the width. With Alt held, it adds 20 pixels (10 on each side) and recenters.

### Applying Resize to Nodes

The most complex part of the resize system is `performResize`, which maps the new bounding box back to per-node property updates:

```typescript
private performResize(worldPos: Vector2, constrained: boolean, fromCenter: boolean): void {
  const { handle, initialBounds, initialNodeStates } = this.resizeState;
  const delta = vec2.subtract(worldPos, this.startPoint);
  const newBounds = this.calculateNewBounds(initialBounds.rect, handle, delta, constrained, fromCenter);

  const scaleX = initialBounds.rect.width > 0 ? newBounds.width / initialBounds.rect.width : 1;
  const scaleY = initialBounds.rect.height > 0 ? newBounds.height / initialBounds.rect.height : 1;

  for (const [id, initialState] of initialNodeStates) {
    const node = this.context.sceneGraph.getNode(id);
    if (!node) continue;

    // Proportional position mapping
    const relX = initialBounds.rect.width > 0
      ? (initialState.worldPosition.x - initialBounds.rect.x) / initialBounds.rect.width
      : 0;
    const relY = initialBounds.rect.height > 0
      ? (initialState.worldPosition.y - initialBounds.rect.y) / initialBounds.rect.height
      : 0;

    const newWorldPosition = {
      x: newBounds.x + relX * newBounds.width,
      y: newBounds.y + relY * newBounds.height,
    };

    // Convert back to local coordinates
    let newPosition: Vector2;
    if (initialState.parentWorldTransform) {
      const inv = mat3.invert(initialState.parentWorldTransform);
      newPosition = inv ? mat3.transformPoint(inv, newWorldPosition) : newWorldPosition;
    } else {
      newPosition = newWorldPosition;
    }

    // Type-specific property updates
    if (node.type === 'rectangle') {
      this.context.sceneGraph.updateNode(id, {
        transform: { ...node.transform, position: newPosition },
        width: Math.max(1, initialState.width * scaleX),
        height: Math.max(1, initialState.height * scaleY),
      });
    } else if (node.type === 'polygon' || node.type === 'path' || node.type === 'group') {
      this.context.sceneGraph.updateNode(id, {
        transform: {
          ...node.transform,
          position: newPosition,
          scale: {
            x: Math.max(0.01, initialState.scale.x * scaleX),
            y: Math.max(0.01, initialState.scale.y * scaleY),
          },
        },
      });
    }
    // ... ellipse, image, artboard
  }
}
```

The proportional position mapping is the algorithm's heart. Each node's relative position within the initial selection bounds (0.0 = left/bottom edge, 1.0 = right/top edge) is preserved in the new bounds. If three shapes are evenly spaced across the selection and you make the selection wider, they remain evenly spaced — they don't cluster toward one side.

The `relX` and `relY` values can be extreme for groups. A group positioned at (0, 0) with children at (500, 500) might have a `relX` of -3.5 relative to the selection bounds. This is correct — the proportional mapping handles any ratio, not just 0-1. Trying to "normalize" these values would break the proportional behavior.

The world-to-local conversion at the end is necessary for nested nodes. The selection bounds and proportional mapping work in world space (because that's the coordinate system where visual positions match), but nodes store their position in parent-local space. The inverse parent transform converts back.

## Rotation

Rotation is simpler than resize because there's only one degree of freedom — the angle. But it still requires careful coordinate math.

### Starting Rotation

When the user clicks on a rotation zone, we capture the initial angle from the selection center to the cursor:

```typescript
const initialAngle = Math.atan2(worldPos.y - bounds.center.y, worldPos.x - bounds.center.x);

const initialRotations = new Map<string, number>();
for (const id of selectedIds) {
  const node = this.context.sceneGraph.getNode(id);
  if (node) {
    initialRotations.set(id, node.transform.rotation);
  }
}
```

### Performing Rotation

On each pointer move, we compute the current angle and subtract the initial angle to get the delta:

```typescript
private performRotation(worldPos: Vector2, constrained: boolean): void {
  const { initialBounds, initialAngle, initialRotations } = this.rotationState;

  const currentAngle = Math.atan2(
    worldPos.y - initialBounds.center.y,
    worldPos.x - initialBounds.center.x
  );

  let deltaRotation = (currentAngle - initialAngle) * (180 / Math.PI);

  if (constrained) {
    deltaRotation = Math.round(deltaRotation / 15) * 15;
  }

  for (const [id, initialRotation] of initialRotations) {
    const node = this.context.sceneGraph.getNode(id);
    if (node) {
      this.context.sceneGraph.updateNode(id, {
        transform: { ...node.transform, rotation: initialRotation + deltaRotation },
      });
    }
  }
}
```

The 15-degree snapping (Shift key) uses `Math.round(deltaRotation / 15) * 15`, which snaps to the nearest multiple of 15. Common angles like 0, 45, 90, 135, and 180 all land on 15-degree multiples, making precise alignment easy.

Artboards are excluded from rotation. The check in `onPointerDown` prevents entering rotation mode if all selected nodes are artboards:

```typescript
if (hitHandle?.startsWith('rotate-')) {
  const allArtboards = [...selectedIds].every((id) => {
    const n = this.context.sceneGraph.getNode(id);
    return n?.type === 'artboard';
  });
  if (allArtboards) return; // Skip — artboards don't rotate
}
```

This matches Figma's behavior — artboards are alignment containers, and rotating them would break their axis-aligned clipping.

## Cancellation and Escape

Every transform mode supports cancellation via the Escape key. The handler is a dispatch on the current mode:

```typescript
onKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'Escape':
      if (this.mode === 'moving' && this.state.isDragging) {
        // Revert to captured start positions
        for (const [id, startPos] of this.moveStartPositions) {
          const node = this.context.sceneGraph.getNode(id);
          if (node) {
            this.context.sceneGraph.updateNode(id, {
              transform: { ...node.transform, position: startPos },
            });
          }
        }
        this.mode = 'idle';
        this.state.isDragging = false;
      } else if (this.mode === 'resizing' && this.resizeState) {
        // Revert all captured properties
        for (const [id, initialState] of this.resizeState.initialNodeStates) {
          // ... restore position, width, height, radius, scale
        }
        this.resizeState = null;
        this.mode = 'idle';
      } else if (this.mode === 'rotating' && this.rotationState) {
        // Revert to captured rotations
        for (const [id, initialRotation] of this.rotationState.initialRotations) {
          // ... restore rotation
        }
        this.rotationState = null;
        this.mode = 'idle';
      }
      break;
  }
}
```

This is why we capture state at drag start. The captured values are both the undo point (for the undo system) and the revert target (for Escape). The undo system snapshots the entire scene graph JSON. The selection tool snapshots only the properties it's going to modify. Both serve the same purpose — reliable rollback — at different granularities.

## Arrow Key Nudging

The selection tool also handles arrow keys for pixel-perfect positioning:

```typescript
case 'ArrowUp':
case 'ArrowDown':
case 'ArrowLeft':
case 'ArrowRight': {
  const snapOn = this.context.getSnapToGrid?.() ?? false;
  const gridSize = this.context.getGridSize?.() ?? 20;
  const nudgeAmount = snapOn ? gridSize : event.shiftKey ? 10 : 1;
  const delta = this.getArrowDelta(event.key, nudgeAmount);

  for (const id of selectedIds) {
    const node = this.context.sceneGraph.getNode(id);
    if (node) {
      const rawPos = vec2.add(node.transform.position, delta);
      const newPos = snapOn ? this.snapNodePosition(node, rawPos) : rawPos;
      this.context.sceneGraph.updateNode(id, {
        transform: { ...node.transform, position: newPos },
      });
    }
  }
  break;
}
```

Three nudge speeds: 1 pixel by default, 10 pixels with Shift, or grid-size when snap-to-grid is enabled. The `getArrowDelta` helper maps key names to direction vectors, accounting for the Y-up coordinate system — ArrowUp adds positive Y, not negative Y.

## The SVG Overlay

The visual feedback — the blue dashed rectangle and the white squares at corners and edges — is rendered as an SVG overlay that sits above the WebGL canvas:

```tsx
export function SelectionOverlay({
  bounds,
  handles,
  handleSize = 8,
  rotation = 0,
}: SelectionOverlayProps) {
  if (!bounds) return null;

  const { rect, center } = bounds;
  if (rect.width <= 0 || rect.height <= 0) return null;

  const rotationTransform =
    rotation !== 0 ? `rotate(${-rotation} ${center.x} ${center.y})` : undefined;

  return (
    <svg className={styles.overlay}>
      <g transform={rotationTransform}>
        <rect
          className={styles.selectionBounds}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
        />
        {handles
          .filter((h) => !h.position.startsWith('rotate-'))
          .map((handle) => (
            <rect
              key={handle.position}
              className={styles.handle}
              x={handle.screenPosition.x - handleSize / 2}
              y={handle.screenPosition.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              style={{ cursor: handle.cursor }}
            />
          ))}
      </g>
    </svg>
  );
}
```

The rotation is negated (`-rotation`) because the editor uses Y-up world coordinates but SVG uses Y-down screen coordinates. A positive rotation in world space is counterclockwise, which in screen space (Y-down) appears clockwise. Negating the rotation in the SVG transform makes the visual rotation match the mathematical rotation.

Rotation handles are filtered out — they're invisible. Only the eight resize handles are rendered as visible squares.

## Pointer Up: Completing the Transform

When the mouse button is released, the selection tool completes the active operation and notifies the system:

```typescript
onPointerUp(event: CanvasPointerEvent): void {
  if (this.mode === 'moving') {
    this.autoReparentAfterMove(selectedIds);
    this.context.onTransformComplete?.(selectedIds, 'move');
  } else if (this.mode === 'resizing') {
    this.context.onTransformComplete?.(selectedIds, 'resize');
  } else if (this.mode === 'rotating') {
    this.context.onTransformComplete?.(selectedIds, 'rotate');
  } else if (this.mode === 'marquee') {
    const nodesInMarquee = this.getNodesInRect(this.marqueeRect);
    // Apply selection (additive if Shift)...
  }

  // Reset all state
  this.mode = 'idle';
  this.startPoint = null;
  this.marqueeRect = null;
  this.moveStartPositions.clear();
  this.state.isDragging = false;
}
```

The `onTransformComplete` callback is the signal for auto-keyframe. If the user has keyframes on a property and edits it with the selection tool, the animation system automatically creates a keyframe at the current frame. The `'move'`, `'resize'`, and `'rotate'` tags tell the animation system which properties were affected.

The `autoReparentAfterMove` call handles artboard nesting. After a move completes, the tool checks if any selected node has been dragged into or out of an artboard and adjusts the parent-child relationship accordingly, converting between world and local coordinates.

## Testing the Selection Tool

Testing the selection tool requires a mock `ToolContext` with a scene graph, camera, selection state, and callbacks. Each interaction mode needs its own test suite:

- **Hit testing**: Create nodes at known positions, verify `hitTest` returns the correct node (or null for empty space).
- **Move**: Simulate pointer down on a node, pointer move with delta, pointer up. Verify the node's position changed by the delta.
- **Resize**: Create a node, select it, simulate pointer down on a specific handle, move, verify dimensions changed.
- **Marquee**: Simulate pointer down on empty space, drag to create rectangle, verify nodes within the rectangle are selected.
- **Rotation**: Simulate pointer down outside a corner, move to rotate, verify rotation angle changed.
- **Snap**: Enable grid/guide snap, move a node, verify position snaps to the nearest grid line or guide.
- **Multi-selection**: Select multiple nodes, resize. Verify proportional position mapping preserves relative positions.
- **Escape cancellation**: Start a move/resize/rotate, press Escape, verify all properties revert to their initial values.

The mock pattern for pointer events:

```typescript
const event = {
  button: 0,
  clickCount: 1,
  worldPosition: { x: 100, y: 100 },
  screenPosition: { x: 400, y: 300 },
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
};
tool.onPointerDown(event);
```

## Lessons

**A selection tool is a state machine, not a handler.** Six modes (idle, selecting, moving, marquee, resizing, rotating) with distinct pointer-down/move/up behavior cannot be managed through ad-hoc conditionals. An explicit `mode` field that governs which branch of each event handler runs keeps the complexity tractable and prevents impossible state combinations.

**Delta-based transforms beat incremental transforms.** Computing the final position as `initialPosition + totalDelta` on every frame eliminates floating-point drift that accumulates when adding per-frame deltas to the current position. The cost is storing initial state at drag start; the reward is pixel-perfect accuracy regardless of drag duration.

**Different node types require different resize strategies.** Rectangles have explicit width and height. Ellipses have radiusX and radiusY. Polygons, paths, and groups resize through transform.scale. This split is not a design flaw but a reflection of geometry: a rectangle's width is a meaningful property, while a path's shape is defined by its points and scaling is just a transform applied on top.

**Proportional position mapping preserves spatial relationships in multi-selection resize.** Each node's relative position within the initial selection bounds (expressed as a 0-to-1 ratio, though values outside that range are valid for groups) is maintained in the new bounds. Without this mapping, resizing a multi-selection would cluster shapes toward one edge instead of scaling them proportionally.

**Capture state at drag start to serve both undo and cancellation.** The same initial-state snapshot that the undo system uses to restore on Ctrl+Z also serves as the revert target when the user presses Escape mid-drag. Two problems, one capture point, zero redundancy.

**Rotation zones are invisible hit areas, not visible handles.** The distinction between "resize" (cursor inside a corner) and "rotate" (cursor just outside a corner) is a spatial test against the selection bounds, not a separate UI element. Checking resize handles first gives them priority; rotation zones only activate when no handle was hit and the cursor is outside the bounds rectangle.

## What We Built

This chapter covered the selection tool — about 1,500 lines of code that implements six interaction modes across three files:

- **Hit testing**: Linear traversal with bounding-box containment. Path-specific tolerance expansion. World-space bounds from local geometry via `transformBoundsToWorld`.
- **SelectionManager**: Single vs. multi selection bounds. Un-rotated bounds for single selection (SVG overlay applies rotation). World-transform-aware group bounds from descendant traversal.
- **TransformHandles**: Eight resize handles at corners and edge midpoints. Four invisible rotation zones outside corners. Procedurally generated SVG rotation cursors. Hit testing with rotation compensation.
- **Move**: Delta-based positioning from captured start positions. Grid and guide snapping with priority (guide > grid). Edge-aware snap checking all five values per axis.
- **Resize**: Handle-to-delta mapping for eight handle positions. Aspect-ratio constraint (Shift). Center-origin resize (Alt). Per-node-type property dispatch (width/height vs. radius vs. scale). Proportional position mapping in world coordinates with local-space conversion for nested nodes.
- **Rotation**: Angle-from-center with `atan2`. 15-degree snapping (Shift). Artboard rotation prevention.
- **Cancellation**: Escape reverts any in-progress transform to captured initial state.

The selection tool is the editor's gravity well — nearly every interaction passes through it. It's the tool that's active most of the time, the tool that other tools auto-switch to after creation, and the tool that defines how the user _thinks_ about the editor's behavior. Getting it right means getting the editor right.

The next chapter takes selection deeper — into individual path points and Bezier handles. Where the selection tool treats nodes as opaque boxes, the direct selection tool reaches inside them to manipulate their internal geometry.
