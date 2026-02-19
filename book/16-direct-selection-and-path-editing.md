# Direct Selection & Path Editing

## Two Levels of Selection

The selection tool treats shapes as opaque boxes. Click a rectangle and you get a bounding box with handles — you can move it, resize it, rotate it, but the rectangle remains a rectangle. The direct selection tool drops a level deeper. It reaches inside shapes to select individual path points and Bezier handles, allowing the user to reshape geometry by dragging vertices.

This creates a two-tier selection model. The _node_ selection (managed by the editor store's `selectedIds`) determines which shapes are highlighted in the layer panel and which show their points. The _point_ selection (managed internally by the direct selection tool) determines which specific vertices are active for dragging. Both selections coexist — a path node is selected at the node level _and_ zero or more of its points are selected at the point level.

The direct selection tool is about 1,170 lines and handles five distinct interactions: clicking points, dragging points, dragging Bezier handles, Alt-clicking to convert point types, and double-clicking to add points to path segments. It also supports shape-to-path auto-conversion — clicking a rectangle, ellipse, or polygon with the direct selection tool converts it to a path node so its vertices become editable. Every interaction must work correctly on nested nodes (children of groups), which means every coordinate computation must account for the full world transform chain.

## Hit Testing: Points, Handles, and Segments

The direct selection tool has three hit test layers, checked in priority order: handles first, then points, then segments.

### Point Hit Testing

Point hit testing iterates every visible path node (scoped by group entry), transforms each point to world space, and checks distance from the cursor:

```typescript
private hitTestPoint(worldPos: Vector2): PointHit | null {
  const hitRadius = 8 / this.context.camera.zoom;

  const paths = this.getPathNodes();
  for (const node of paths) {
    const allPts = getAllPoints(node);
    for (let i = 0; i < allPts.length; i++) {
      const pointWorldPos = this.getPointWorldPosition(node, allPts[i]);
      if (vec2.distance(worldPos, pointWorldPos) < hitRadius) {
        return { type: 'point', nodeId: node.id, pointIndex: i };
      }
    }
  }

  return null;
}
```

The `getAllPoints` helper merges a path node's primary `points` array with its `subpaths` arrays into a single flat list. This lets compound paths (like the letter "O" — an outer contour and an inner hole) use the same indexing scheme. A `pointIndex` of 7 in a path with 5 primary points and a 4-point subpath refers to the third point of the subpath.

The hit radius is 8 screen pixels divided by zoom — the same zoom-compensated tolerance used by the selection tool. At 200% zoom, the world-space tolerance is 4 units; at 50% zoom, it's 16 units. This keeps the clickable target the same visual size regardless of zoom.

### Handle Hit Testing

Handles are only testable when their parent point is selected. An unselected point's handles are invisible and non-interactive:

```typescript
private hitTestHandle(worldPos: Vector2): HandleHit | null {
  const hitRadius = 6 / this.context.camera.zoom;

  for (const sel of this.selectedPoints) {
    const node = this.context.sceneGraph.getNode(sel.nodeId) as PathNode;
    if (!node || node.type !== 'path') continue;

    const point = getAllPoints(node)[sel.pointIndex];
    if (!point) continue;

    const pointWorldPos = this.getPointWorldPosition(node, point);
    const linearMatrix = this.getNodeLinearMatrix(node);

    if (point.handleIn) {
      const handleWorldOffset = mat3.transformPoint(linearMatrix, point.handleIn);
      const handleWorldPos = vec2.add(pointWorldPos, handleWorldOffset);
      if (vec2.distance(worldPos, handleWorldPos) < hitRadius) {
        return { type: 'handle-in', nodeId: node.id, pointIndex: sel.pointIndex };
      }
    }

    if (point.handleOut) {
      const handleWorldOffset = mat3.transformPoint(linearMatrix, point.handleOut);
      const handleWorldPos = vec2.add(pointWorldPos, handleWorldOffset);
      if (vec2.distance(worldPos, handleWorldPos) < hitRadius) {
        return { type: 'handle-out', nodeId: node.id, pointIndex: sel.pointIndex };
      }
    }
  }

  return null;
}
```

The handle hit radius (6px) is slightly smaller than the point hit radius (8px). This prevents handles from stealing clicks when they're very close to their parent point.

Handles are stored as offsets relative to their point's position, in the path's local coordinate space. To test them in world space, we need the _linear_ part of the world transform — rotation and scale without translation. The `getNodeLinearMatrix` extracts this by zeroing out the translation components:

```typescript
private getNodeLinearMatrix(node: PathNode | Node) {
  const m = this.getNodeWorldMatrix(node);
  return { a: m.a, b: m.b, c: m.c, d: m.d, tx: 0, ty: 0 };
}
```

This is the key insight for handle transforms: handles are _direction vectors_, not positions. A handle offset of `(30, 0)` means "30 units to the right of the point" in local space. Applying the full world transform (including translation) would compute the wrong position. The linear matrix applies only rotation and scale — if the path is rotated 45 degrees and scaled 2x, the handle offset becomes `(42.4, 42.4)` in world space.

### Segment Hit Testing

Double-clicking a path segment adds a new point at the click position. The segment hit test measures point-to-line-segment distance:

```typescript
private hitTestSegment(worldPos: Vector2): SegmentHit | null {
  const hitRadius = 8 / this.context.camera.zoom;

  for (const node of this.getPathNodes()) {
    const allPts = getAllPoints(node);
    const boundaries = getSubpathBoundaries(node);

    for (let c = 0; c < boundaries.length - 1; c++) {
      const start = boundaries[c];
      const end = boundaries[c + 1];
      const numSegments = node.closed ? end - start : end - start - 1;

      for (let local = 0; local < numSegments; local++) {
        const flatIdx = start + local;
        const nextFlatIdx = start + ((local + 1) % (end - start));

        const p1World = this.getPointWorldPosition(node, allPts[flatIdx]);
        const p2World = this.getPointWorldPosition(node, allPts[nextFlatIdx]);

        const dist = this.pointToLineDistance(worldPos, p1World, p2World);
        if (dist < hitRadius) {
          const t = this.getParameterOnLine(worldPos, p1World, p2World);
          return { type: 'segment', nodeId: node.id, segmentIndex: flatIdx, t };
        }
      }
    }
  }

  return null;
}
```

The `t` parameter records where along the segment the click landed (0 = start point, 1 = end point). This is used to interpolate the position when creating the new point.

Segment iteration respects compound path boundaries. A path with 5 points in the primary contour and 4 in a subpath has two independent contour loops. The modular indexing (`(local + 1) % contourLen`) handles the closing segment of closed paths — the segment from the last point back to the first.

The `pointToLineDistance` function uses the standard projected-point-on-line formula:

```typescript
private pointToLineDistance(point: Vector2, lineStart: Vector2, lineEnd: Vector2): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return vec2.distance(point, lineStart);

  let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const closest = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };
  return vec2.distance(point, closest);
}
```

The `t` is clamped to `[0, 1]` so the distance is measured to the segment, not the infinite line. Without clamping, clicking far past the end of a segment would register a hit if the line extension passed nearby.

## The World Transform Problem

Every coordinate operation in the direct selection tool must transform between local space (where point positions are defined) and world space (where the user's cursor lives). For root-level nodes, this is straightforward. For nested nodes — a path inside a group inside another group — the full parent chain must be traversed.

```typescript
private getNodeWorldMatrix(node: PathNode | Node) {
  const local = mat3.compose(
    node.transform.position,
    node.transform.rotation,
    node.transform.scale
  );
  if (!node.parent) return local;
  const parentWorld = this.context.sceneGraph.getWorldTransform(node.parent);
  return mat3.multiply(parentWorld, local);
}
```

This method deliberately _excludes_ the anchor from the local matrix composition. The anchor is used to offset geometry during rendering (so that anchor (0.5, 0.5) centers the shape visually), but for point editing, we work with the raw local positions. Including the anchor would shift all coordinates by half the bounding box dimensions, causing a drift bug: every time the user drags a point, it would jump by `(width * 0.5, height * 0.5)` in local space.

This was one of the subtlest bugs in the project. The `getWorldTransform` method on the scene graph _includes_ anchor via `computeLocalMatrix`. Using it directly for point editing caused every point drag to add a 0.5-pixel offset (from the default anchor of (0.5, 0.5)). The fix was to compose the local matrix manually without anchor, then multiply with the parent's world transform.

## Dragging Points

When the user clicks a point and drags, the tool moves the point in world space and converts the delta back to local space:

```typescript
if (this.dragMode === 'dragging-point') {
  const worldDelta = vec2.subtract(worldPos, this.dragStartPoint);

  for (const sel of this.selectedPoints) {
    const node = this.context.sceneGraph.getNode(sel.nodeId);
    if (!node) continue;

    const key = `${sel.nodeId}:${sel.pointIndex}`;
    const initialPos = this.initialPointPositions.get(key);
    if (!initialPos) continue;

    // Convert world delta to local delta
    const linearMatrix = this.getNodeLinearMatrix(node);
    const invLinear = mat3.invert(linearMatrix);
    const localDelta = invLinear ? mat3.transformPoint(invLinear, worldDelta) : worldDelta;

    const pathNode = node as PathNode;
    const allPts = getAllPoints(pathNode);
    const newAll = [...allPts];
    newAll[sel.pointIndex] = {
      ...newAll[sel.pointIndex],
      position: vec2.add(initialPos, localDelta),
    };

    const split = setAllPoints(pathNode, newAll);
    this.context.sceneGraph.updateNode(sel.nodeId, {
      points: split.points,
      subpaths: split.subpaths,
    });
  }
}
```

The delta-based approach (same as the selection tool's move) prevents floating-point drift. Initial positions are captured at drag start and stored in a map keyed by `"nodeId:pointIndex"`. Every frame computes the new position from `initialPosition + localDelta`, never from the current position.

The inverse linear matrix converts world-space mouse movement to local-space point movement. If the path is scaled 2x and rotated 45 degrees, a 10-pixel rightward mouse drag corresponds to a smaller, rotated displacement in local space. The inversion handles this automatically.

The `setAllPoints` helper splits the flat point array back into the primary `points` and `subpaths` arrays, preserving the compound path structure. This round-trip — `getAllPoints` to read, `setAllPoints` to write — keeps the tool agnostic about how many contours a path has.

## Dragging Handles

Handle dragging is the direct selection tool's most coordinate-intensive operation. Handles are stored as offsets from their parent point's position, in local space. The user drags in world space. The tool must:

1. Compute the parent point's world position
2. Subtract it from the cursor world position to get a world-space handle offset
3. Transform that offset to local space via the inverse linear matrix
4. Apply symmetry constraints

```typescript
if (this.dragMode === 'dragging-handle' && this.dragHandle) {
  const node = this.context.sceneGraph.getNode(this.dragHandle.nodeId) as PathNode;
  if (!node) return;

  const allPts = getAllPoints(node);
  const point = allPts[this.dragHandle.pointIndex];

  // Step 1-2: world-space handle offset
  const pointWorldPos = this.getPointWorldPosition(node, point);
  const worldHandleOffset = vec2.subtract(worldPos, pointWorldPos);

  // Step 3: convert to local-space offset
  const linearMatrix = this.getNodeLinearMatrix(node);
  const invLinear = mat3.invert(linearMatrix);
  const localHandleOffset = invLinear
    ? mat3.transformPoint(invLinear, worldHandleOffset)
    : worldHandleOffset;

  const handleType = this.dragHandle.type === 'handle-out' ? 'out' : 'in';

  const newAll = [...allPts];

  // Step 4: Ctrl breaks symmetry
  if (event.ctrlKey) {
    const updated = { ...point };
    if (handleType === 'out') {
      updated.handleOut = localHandleOffset;
    } else {
      updated.handleIn = localHandleOffset;
    }
    updated.type = 'corner';
    newAll[this.dragHandle.pointIndex] = updated;
  } else {
    newAll[this.dragHandle.pointIndex] = updateHandleWithSymmetry(
      point,
      handleType,
      localHandleOffset
    );
  }

  const split = setAllPoints(node, newAll);
  this.context.sceneGraph.updateNode(this.dragHandle.nodeId, {
    points: split.points,
    subpaths: split.subpaths,
  });
}
```

The Ctrl key breaks handle symmetry. By default, dragging one handle of a smooth point mirrors the opposite handle — the curve stays smooth through the point. With Ctrl held, only the dragged handle moves, and the point type is downgraded to `'corner'`. This lets the user create a cusp where one curve segment changes direction abruptly.

### Handle Symmetry

The `updateHandleWithSymmetry` function from `pointUtils.ts` implements two symmetry modes:

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
        point.type === 'symmetric'
          ? vec2.length(newHandleOffset) // Mirror both direction AND length
          : point.handleIn
            ? vec2.length(point.handleIn) // Mirror direction, keep original length
            : vec2.length(newHandleOffset);
      const direction = vec2.normalize({ x: -newHandleOffset.x, y: -newHandleOffset.y });
      result.handleIn = vec2.multiply(direction, length);
    }
  } else {
    // Mirror case for handleIn...
  }

  return result;
}
```

For **smooth** points, the opposite handle mirrors the _direction_ of the dragged handle (so the curve passes smoothly through the point) but keeps its _original length_. This means dragging one handle doesn't change the curvature on the opposite side — it only changes the angle.

For **symmetric** points, both direction and length are mirrored. The opposite handle becomes a perfect reflection. This is less commonly used but useful when you want identical curvature on both sides of a point.

For **corner** points, only the dragged handle is updated. The opposite handle is left untouched. The two curve segments meeting at the point are completely independent.

## Point Type Conversion

Alt-clicking a point converts it between corner and smooth types:

```typescript
private convertPointType(nodeId: string, pointIndex: number): void {
  const node = this.context.sceneGraph.getNode(nodeId) as PathNode;
  const allPts = getAllPoints(node);
  const point = allPts[pointIndex];

  // Find neighbors within the same contour
  const boundaries = getSubpathBoundaries(node);
  const { start, end } = getContourRange(boundaries, pointIndex);
  const contourLen = end - start;
  const localIdx = pointIndex - start;

  const prevIdx = localIdx > 0 ? pointIndex - 1 : node.closed ? end - 1 : -1;
  const nextIdx = localIdx < contourLen - 1 ? pointIndex + 1 : node.closed ? start : -1;

  const prevPoint = prevIdx >= 0 ? allPts[prevIdx] : null;
  const nextPoint = nextIdx >= 0 ? allPts[nextIdx] : null;

  const newAll = [...allPts];
  newAll[pointIndex] = convertPointTypeUtil(
    point, prevPoint?.position ?? null, nextPoint?.position ?? null
  );
  // ...update node...
}
```

The conversion uses neighbor positions to infer handle direction. When converting a corner point to smooth, the function needs to know which direction the curve should flow. It looks at the previous and next points:

```typescript
export function convertPointType(
  point: PathPoint,
  prevPosition: Vector2 | null,
  nextPosition: Vector2 | null,
  defaultHandleLength: number = 30
): PathPoint {
  if (point.type === 'corner') {
    // Infer direction from neighbors
    let direction: Vector2 = { x: 1, y: 0 };

    if (prevPosition && nextPosition) {
      const toNext = vec2.subtract(nextPosition, prevPosition);
      const len = vec2.length(toNext);
      if (len > 0) direction = { x: toNext.x / len, y: toNext.y / len };
    } else if (prevPosition) {
      const toPrev = vec2.subtract(point.position, prevPosition);
      const len = vec2.length(toPrev);
      if (len > 0) direction = { x: toPrev.x / len, y: toPrev.y / len };
    }

    return {
      ...point,
      handleOut: { x: direction.x * defaultHandleLength, y: direction.y * defaultHandleLength },
      handleIn: { x: -direction.x * defaultHandleLength, y: -direction.y * defaultHandleLength },
      type: 'smooth',
    };
  } else {
    // Smooth/symmetric → corner: remove handles
    return { ...point, handleIn: null, handleOut: null, type: 'corner' };
  }
}
```

When both neighbors are available, the direction is the vector from `prev` to `next` — the tangent of the path at this point. When only one neighbor is available (start or end of an open path), the direction is inferred from that neighbor. The default handle length of 30 units produces a gentle curve; the user can adjust it immediately by dragging the handles.

Corner-to-smooth conversion always produces symmetric handles. The opposite direction: smooth-to-corner simply removes both handles, collapsing the curves on both sides to straight lines.

## Deleting Points

The Delete key removes selected points from their path:

```typescript
private deleteSelectedPoints(): void {
  this.context.onTransformStart?.();

  // Group by node
  const pointsByNode = new Map<string, number[]>();
  for (const sel of this.selectedPoints) {
    const indices = pointsByNode.get(sel.nodeId) || [];
    indices.push(sel.pointIndex);
    pointsByNode.set(sel.nodeId, indices);
  }

  for (const [nodeId, indices] of pointsByNode) {
    const node = this.context.sceneGraph.getNode(nodeId) as PathNode;
    const allPts = getAllPoints(node);
    const boundaries = getSubpathBoundaries(node);
    const deleteSet = new Set(indices);

    // Split into contours, remove marked points, drop empty contours
    const newContours: PathPoint[][] = [];
    for (let c = 0; c < boundaries.length - 1; c++) {
      const start = boundaries[c];
      const end = boundaries[c + 1];
      const contour = allPts.slice(start, end)
        .filter((_pt, idx) => !deleteSet.has(start + idx));
      if (contour.length > 0) newContours.push(contour);
    }

    const totalRemaining = newContours.reduce((sum, c) => sum + c.length, 0);
    if (totalRemaining < 2) {
      this.context.sceneGraph.removeNode(nodeId);
    } else {
      const points = newContours[0];
      const subpaths = newContours.length > 1 ? newContours.slice(1) : undefined;
      this.context.sceneGraph.updateNode(nodeId, { points, subpaths });
    }
  }

  this.clearPointSelection();
}
```

Deletion respects compound path structure. Each contour is filtered independently, empty contours are dropped, and if fewer than 2 total points remain, the entire path is removed (a single point isn't a valid path). The `onTransformStart` call ensures the undo system captures the state before any deletion.

## Adding Points to Segments

Double-clicking a segment inserts a new corner point at the click position:

```typescript
private addPointToSegment(hit: SegmentHit): void {
  const node = this.context.sceneGraph.getNode(hit.nodeId) as PathNode;
  const allPts = getAllPoints(node);

  const p1 = allPts[hit.segmentIndex];
  const p2 = allPts[/* next index in contour */];

  const p1World = this.getPointWorldPosition(node, p1);
  const p2World = this.getPointWorldPosition(node, p2);

  // Interpolate position in world space
  const newWorldPos = {
    x: p1World.x + (p2World.x - p1World.x) * hit.t,
    y: p1World.y + (p2World.y - p1World.y) * hit.t,
  };

  // Convert to local coordinates
  const worldMatrix = this.getNodeWorldMatrix(node);
  const invWorld = mat3.invert(worldMatrix);
  const localPos = invWorld
    ? mat3.transformPoint(invWorld, newWorldPos)
    : { x: newWorldPos.x - node.transform.position.x, y: newWorldPos.y - node.transform.position.y };

  const newPoint: PathPoint = {
    position: localPos,
    handleIn: null,
    handleOut: null,
    type: 'corner',
  };

  // Splice into the flat array and rebuild contours
  const newAll = [...allPts];
  newAll.splice(hit.segmentIndex + 1, 0, newPoint);
  // ... rebuild points + subpaths from shifted boundaries ...

  // Select the new point
  this.selectPoint(hit.nodeId, hit.segmentIndex + 1, false);
}
```

The interpolation uses the `t` parameter from the segment hit test. If the user clicks at `t = 0.3`, the new point is placed at 30% of the distance from the start to the end of the segment. The position is computed in world space (so it appears where the user clicked) then converted back to local space for storage.

The splice into the flat array requires rebuilding the contour boundaries. Every contour after the insertion point shifts by one index. The new point is automatically selected so the user can immediately drag it or convert it to smooth.

## Shape-to-Path Auto-Conversion

Clicking a rectangle, ellipse, or polygon with the direct selection tool converts it to a path node for point editing:

```typescript
if (
  hitNode &&
  (hitNode.type === 'rectangle' || hitNode.type === 'ellipse' || hitNode.type === 'polygon') &&
  this.context.convertShapeToPath
) {
  const newId = this.context.convertShapeToPath(hitNode.id);
  if (newId) {
    this.clearPointSelection();
    const newNode = this.context.sceneGraph.getNode(newId);
    if (newNode && newNode.type === 'path') {
      const allPts = getAllPoints(newNode);
      for (let i = 0; i < allPts.length; i++) {
        this.selectedPoints.push({ nodeId: newId, pointIndex: i });
      }
    }
  }
}
```

The `convertShapeToPath` action (provided by the editor store) replaces the shape node with a path node that has the same visual appearance. A rectangle becomes four corner points. An ellipse becomes four smooth points with handles approximating the circle. A polygon becomes N corner points. After conversion, all points are selected so the user can immediately start editing.

This is a one-way operation — there's no "convert path to rectangle" action. The path is always more general than the primitive shape.

## The SVG Overlay

The `DirectSelectionOverlay` component renders the visual feedback — diamond-shaped control points, handle circles connected to their parent points by dashed lines, and a thin path outline showing the current curve shape.

Control points are rendered as 8x8 squares rotated 45 degrees (diamond shape). Selected points get a filled blue style; unselected points get an outline style:

```tsx
{
  allPts.map((point: PathPoint, index: number) => {
    const selected = isPointSelected(selectedPoints, node.id, index);
    const screenPos = toScreen(getPointWorldPos(node, point, sceneGraph));

    return (
      <rect
        key={`point-${index}`}
        className={selected ? styles.pointSelected : styles.point}
        x={screenPos.x - 4}
        y={screenPos.y - 4}
        width={8}
        height={8}
        transform={`rotate(45 ${screenPos.x} ${screenPos.y})`}
      />
    );
  });
}
```

Handles are only shown for selected points — showing handles for every point would create visual clutter. Each handle renders as a dashed line from the point to the handle position, with a circle at the end:

```tsx
{
  point.handleOut &&
    (() => {
      const wo = getHandleWorldOffset(node, point.handleOut, sceneGraph);
      const hx = screenPos.x + wo.x * zoom;
      const hy = screenPos.y - wo.y * zoom;
      return (
        <>
          <line className={styles.handleLine} x1={screenPos.x} y1={screenPos.y} x2={hx} y2={hy} />
          <circle className={styles.handle} cx={hx} cy={hy} r={4} />
        </>
      );
    })();
}
```

The handle position computation uses the linear part of the world matrix (rotation + scale, no translation) applied to the handle offset, then adds the point's screen position. The Y coordinate is negated (`-wo.y * zoom`) because the SVG overlay uses screen coordinates (Y-down) while the world uses Y-up. This single negation is the entire Y-axis flip for the overlay.

The path outline is built as an SVG path string per contour, using `M`, `L`, and `C` commands:

```typescript
function buildContourD(node, contour, closed, toScreen, zoom, sceneGraph): string {
  const parts: string[] = [];

  for (let i = 0; i < contour.length; i++) {
    const p = contour[i];
    const screen = toScreen(getPointWorldPos(node, p, sceneGraph));

    if (i === 0) {
      parts.push(`M ${screen.x} ${screen.y}`);
    } else {
      const prev = contour[i - 1];
      if (prev.handleOut || p.handleIn) {
        // Cubic bezier segment
        const ho = prev.handleOut
          ? getHandleWorldOffset(node, prev.handleOut, sceneGraph)
          : { x: 0, y: 0 };
        const hi = p.handleIn ? getHandleWorldOffset(node, p.handleIn, sceneGraph) : { x: 0, y: 0 };
        const cp1x = prevScreen.x + ho.x * zoom;
        const cp1y = prevScreen.y - ho.y * zoom;
        const cp2x = screen.x + hi.x * zoom;
        const cp2y = screen.y - hi.y * zoom;
        parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${screen.x} ${screen.y}`);
      } else {
        parts.push(`L ${screen.x} ${screen.y}`);
      }
    }
  }

  if (closed) {
    // ... closing bezier or Z
  }
  return parts.join(' ');
}
```

Segments between two corner points (no handles) render as straight lines (`L`). Segments where either point has handles render as cubic Bezier curves (`C`). If only one of the two points has a handle, the missing handle defaults to `{x:0, y:0}` — a degenerate control point that collapses to the point position, making the curve tangent at that end.

## Image Vertex Editing

The direct selection tool also supports editing image node corners. An image node has four vertices (bottom-left, bottom-right, top-left, top-right) that can be dragged independently via `vertexOffsets`. This allows free-form distortion of images — useful for perspective correction or warping.

The image vertices are exposed as virtual `PathPoint` objects:

```typescript
function getImagePoints(node: ImageNode): PathPoint[] {
  const ax = node.transform.anchor.x;
  const ay = node.transform.anchor.y;
  const x0 = -node.width * ax;
  const y0 = -node.height * ay;
  const x1 = x0 + node.width;
  const y1 = y0 + node.height;

  return [
    { position: { x: x0 + vo[0].x, y: y0 + vo[0].y }, type: 'corner' },
    { position: { x: x1 + vo[1].x, y: y0 + vo[1].y }, type: 'corner' },
    { position: { x: x0 + vo[2].x, y: y1 + vo[2].y }, type: 'corner' },
    { position: { x: x1 + vo[3].x, y: y1 + vo[3].y }, type: 'corner' },
  ];
}
```

The base corner positions come from the image's dimensions and anchor. The `vertexOffsets` array (if present) adds per-corner displacement. When the user drags an image vertex, the tool computes the new position and converts it back to offsets:

```typescript
function imagePointsToOffsets(
  node: ImageNode,
  points: PathPoint[]
): [Vector2, Vector2, Vector2, Vector2] {
  // Subtract base corner positions from dragged positions
  return [
    { x: points[0].position.x - bases[0].x, y: points[0].position.y - bases[0].y },
    { x: points[1].position.x - bases[1].x, y: points[1].position.y - bases[1].y },
    // ...
  ];
}
```

This representation means an image with no vertex editing has all-zero offsets (or no `vertexOffsets` field). Only deformed images store offset data.

## Keyboard Interactions

The direct selection tool handles three keyboard events:

- **Delete/Backspace**: Removes selected points (described above).
- **Escape**: Clears point selection first, then exits group, then switches back to the selection tool. This layered behavior means repeated presses of Escape progressively "zoom out" of the editing context.
- **Ctrl+A**: Selects all points in all selected path nodes.

```typescript
case 'Escape': {
  const groupId = this.context.getEnteredGroupId?.() ?? null;
  if (this.selectedPoints.length > 0) {
    this.clearPointSelection();
  } else if (groupId) {
    this.context.setEnteredGroupId?.(null);
    this.context.setSelectedIds([groupId]);
  } else {
    this.context.setActiveTool('selection');
  }
  break;
}
```

## Lessons

**Handles are direction vectors, not positions.** A Bezier handle offset of (30, 0) means "30 units to the right of the point" in local space. Transforming it to world space requires only the linear part of the world matrix (rotation and scale, no translation). Applying the full matrix including translation computes the wrong position because the handle is relative to its parent point, not relative to the world origin.

**Exclude anchor from the world matrix when editing local-space geometry.** The scene graph's `getWorldTransform` includes anchor offset, which is correct for rendering but wrong for point editing. Composing the local matrix manually without anchor and then multiplying with the parent's world transform avoids a subtle per-drag drift equal to `dimensions * anchor` in local space.

**Hit test layers need distinct radii to establish priority.** Points at 8 pixels, handles at 6 pixels, segments at 8 pixels — the smaller handle radius prevents handles from stealing clicks when they overlap their parent point. Priority order (handles, then points, then segments) combined with size differences creates an unambiguous interaction hierarchy.

**Two-tier selection is the natural model for path editing.** Node selection (which shapes are active in the layer panel) and point selection (which vertices within those shapes are draggable) coexist simultaneously because they answer different questions. The user wants to see which shapes they are editing and which points within those shapes they are manipulating.

**Shape-to-path conversion is a one-way escalation.** Clicking a rectangle with the direct selection tool converts it to a path node permanently. This is correct because a path is strictly more general than a primitive shape — four corner points with no handles is a rectangle, but a rectangle cannot represent an arbitrary vertex arrangement. The generality trade-off is acceptable because the user's intent (edit vertices) already implies they want path-level control.

## What We Built

This chapter covered the direct selection tool — about 1,170 lines that extend the selection paradigm from whole shapes to individual vertices:

- **Two-tier selection**: Node selection (which shapes are active) and point selection (which vertices within those shapes are active). Both coexist simultaneously.
- **Hit testing**: Points at 8px tolerance, handles at 6px (only for selected points), segments via point-to-line-segment distance. All in zoom-compensated world space.
- **The world transform problem**: Point positions are local, cursors are world. The `getNodeWorldMatrix` excludes anchor to avoid drift. The `getNodeLinearMatrix` extracts rotation + scale for handle direction transforms.
- **Point dragging**: Delta-based from captured initial positions. World-to-local conversion via inverse linear matrix. Multiple selected points move simultaneously.
- **Handle dragging**: World offset → inverse linear → local offset. Symmetric by default (smooth points mirror direction), Ctrl breaks symmetry (degrades to corner). Two symmetry modes: smooth (mirror direction, keep length) and symmetric (mirror both).
- **Point type conversion**: Alt-click toggles corner/smooth. Smooth creation infers handle direction from neighbors. Default handle length of 30 units.
- **Point deletion**: Respects compound path contour boundaries. Fewer than 2 remaining points removes the entire path.
- **Segment point insertion**: Double-click adds a corner point interpolated at the click parameter. Contour boundaries shift by one.
- **Shape auto-conversion**: Clicking primitives converts to path for vertex editing. All points auto-selected.
- **SVG overlay**: Diamond-shaped points (rotated 45-degree squares), dashed handle lines with circles, per-contour path outline with proper cubic Bezier curves.

The direct selection tool completes the editing story. The selection tool manipulates shapes as boxes. The direct selection tool reaches inside to reshape the boxes themselves. Together they give the user full control over every aspect of every shape — from coarse positioning down to individual Bezier tangent angles.

The next chapter introduces another kind of "reaching inside" — entering groups to select their children, the Figma-style double-click-to-enter / Escape-to-exit pattern that scopes selection to a specific level of the scene graph hierarchy.
