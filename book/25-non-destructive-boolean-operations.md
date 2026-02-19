# Non-Destructive Boolean Operations

## Shapes That Remember Their Parents

Boolean operations — union, subtract, intersect, exclude — combine two or more shapes into a new one. Most vector editors implement these destructively: select two shapes, click Union, and the originals are gone. The result is a single flat path. If the user changes their mind or wants to adjust the overlap, they must undo and start over.

This editor takes a different approach, borrowed from Figma. Boolean operations are non-destructive. The source shapes are not deleted — they are moved into a group. The group carries a `booleanOp` property that tells the renderer to compute the boolean result dynamically. The user can still select, move, and reshape the children. The boolean result updates live. Only when the user explicitly flattens the group does the result become a permanent path.

This chapter covers the pipeline from shape to polygon to boolean result, and how the renderer draws a group whose visual appearance comes from a computed result rather than its children.

## Why Not Implement It From Scratch

Boolean operations on arbitrary polygons are notoriously difficult to implement correctly. The classic Weiler-Atherton algorithm handles convex and concave polygons but struggles with edge cases: collinear edges, shared vertices, holes, floating-point precision errors at intersection points. A robust implementation requires careful handling of dozens of degenerate cases that arise when two edges are nearly parallel, or when an intersection point falls exactly on a vertex.

The `polygon-clipping` library handles all of this. It implements the Martinez-Rueda-Feito algorithm with robust numerical handling, and its API maps directly to what we need: union, difference, intersection, and XOR on MultiPolygon inputs. The four operations become one-line delegations:

```typescript
export function performBoolean(
  polyA: MultiPolygon,
  polyB: MultiPolygon,
  op: BooleanOp
): MultiPolygon {
  switch (op) {
    case 'union':
      return polygonClipping.union(polyA, ...polyB);
    case 'subtract':
      return polygonClipping.difference(polyA, ...polyB);
    case 'intersect':
      return polygonClipping.intersection(polyA, ...polyB);
    case 'exclude':
      return polygonClipping.xor(polyA, ...polyB);
  }
}
```

The complexity lives in converting our shapes to and from the library's data format — and in rendering the result without ever materializing it as a scene graph node.

## From Shapes to Polygons

`polygon-clipping` operates on `MultiPolygon` — an array of polygons, each an array of rings (the first ring is the outer contour, subsequent rings are holes), each ring an array of `[x, y]` coordinate pairs. Every shape in the editor must be converted to this format before any boolean operation can execute.

### nodeToPolygon

The conversion function takes a node and its world transform, tessellates the shape to line segments, and transforms the result to world space:

```typescript
export function nodeToPolygon(
  node: Node,
  worldTransform: Matrix3,
  tolerance: number = 1.0
): MultiPolygon | null {
  const contours = nodeToContours(node, tolerance);
  if (!contours || contours.length === 0) return null;

  const transformedContours = contours.map((contour) =>
    contour.map((pt) => {
      const tp = mat3.transformPoint(worldTransform, pt);
      return [tp.x, tp.y] as [number, number];
    })
  );

  return [transformedContours as Ring[]];
}
```

The `nodeToContours` function dispatches by node type. Rectangles produce four points (with Bezier corner arcs tessellated if `cornerRadius` is nonzero). Ellipses are tessellated from the four KAPPA-based control points. Polygons and stars delegate to `createPolygonPath` / `createStarPath`. Paths clone their existing points and apply per-vertex corner radius:

```typescript
function nodeToContours(node: Node, tolerance: number): Vector2[][] | null {
  switch (node.type) {
    case 'rectangle':
      return [rectangleToPoints(node)];
    case 'ellipse':
      return [ellipseToPoints(node, tolerance)];
    case 'polygon':
      return [polygonNodeToPoints(node, tolerance)];
    case 'path':
      return pathToContours(node, tolerance);
    default:
      return null;
  }
}
```

Unsupported types — groups, text, images, bones — return `null` and are silently skipped.

### Tessellation and Closing Rings

Each helper calls `tessellatePathToVertices` to convert Bezier curves into flat coordinate arrays, then converts the `Float32Array` to `Vector2[]`:

```typescript
function tessellateToVector2(points: PathPoint[], closed: boolean, tolerance: number): Vector2[] {
  const flat = tessellatePathToVertices(points, closed, tolerance);
  const result: Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    result.push({ x: flat[i]!, y: flat[i + 1]! });
  }
```

There is a format mismatch to handle: `tessellatePathToVertices` removes the duplicate closing vertex (earcut, used for fill triangulation, requires open rings), but `polygon-clipping` expects closed rings where the first and last point are identical. The function re-adds the closing point if needed:

```typescript
  if (closed && result.length >= 3) {
    const first = result[0]!;
    const last = result[result.length - 1]!;
    if (Math.abs(first.x - last.x) > 1e-10 || Math.abs(first.y - last.y) > 1e-10) {
      result.push({ x: first.x, y: first.y });
    }
  }
  return result;
}
```

Path nodes with subpaths produce multiple contours — the first is the outer ring, subsequent ones are holes. This matches `polygon-clipping`'s ring semantics directly.

### World Transforms

The world transform is applied after tessellation. This means the boolean operation sees shapes in their final screen positions — a rotated rectangle overlapping a scaled ellipse is handled correctly. The transform is a 3x3 affine matrix that includes the full parent chain (position, rotation, scale, anchor), computed by `sceneGraph.getWorldTransform(nodeId)`.

## The Non-Destructive Group

### GroupNode with booleanOp

The `GroupNode` type carries an optional `booleanOp` field:

```typescript
export interface GroupNode extends BaseNode {
  type: 'group';
  booleanOp?: BooleanOp; // undefined = normal group, set = boolean group
  fills?: Fill[]; // appearance of boolean result
  strokes?: Stroke[]; // appearance of boolean result
}
```

When `booleanOp` is undefined, the group is a normal group — its children render individually. When set to `'union'`, `'subtract'`, `'intersect'`, or `'exclude'`, the group is a boolean group — its children are invisible, and the computed boolean result renders in their place.

The `fills` and `strokes` on the group define the appearance of the computed result. By default, they are copied from the first child when the boolean group is created. The user can change them later through the Properties Panel, independently of the children's appearance.

### Creating a Boolean Group

The store action `performBooleanOp` creates a boolean group from the current selection:

```typescript
function performBooleanOp(sceneGraph: SceneGraphLike, op: BooleanOp): void {
  const { selectedNodeIds } = get();
  if (selectedNodeIds.size < 2) {
    toast.error('Select at least 2 shapes for boolean operations');
    return;
  }
  get().pushUndo(sceneGraph);

  // Collect selected nodes in scene graph z-order
  const orderedNodes: Node[] = [];
  sceneGraph.traverse((node) => {
    if (selectedNodeIds.has(node.id) && isBooleanInput(node)) {
      orderedNodes.push(node);
    }
  });
```

The traverse-to-order step is important. The user may have selected nodes in any order (click A, shift-click B). But for subtraction, order matters — `A subtract B` is different from `B subtract A`. The nodes are collected in scene graph traversal order (depth-first), which matches their visual stacking order. The bottom-most node (first in the layer panel) becomes the base shape.

The group takes the first node's fills and strokes:

```typescript
const group = createGroupNode(groupId, `Boolean ${op.charAt(0).toUpperCase() + op.slice(1)}`);
group.transform.anchor = { x: 0, y: 0 };
(group as GroupNode).booleanOp = op;
(group as GroupNode).fills =
  fills.length > 0
    ? structuredClone(fills)
    : [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }];
```

The anchor must be `(0, 0)`. Boolean groups render their result in world coordinates — any anchor offset would shift the rendered result away from where the children are. The default anchor `(0.5, 0.5)` caused a 0.5-unit offset bug that was traced to this line.

The children are moved into the group, not copied — this preserves them for later editing or release:

```typescript
for (const node of orderedNodes) {
  sceneGraph.moveNode(node.id, groupId);
}
```

Four shorthand store actions delegate to `performBooleanOp` with the specific operation:

```typescript
booleanUnion:     (sg) => performBooleanOp(sg, 'union'),
booleanSubtract:  (sg) => performBooleanOp(sg, 'subtract'),
booleanIntersect: (sg) => performBooleanOp(sg, 'intersect'),
booleanExclude:   (sg) => performBooleanOp(sg, 'exclude'),
```

These are triggered from the Edit menu's Boolean section (Ctrl+Shift+U, D, I, X).

## Rendering the Boolean Result

### traverseVisible Returns False

The renderer walks the scene graph via `traverseVisible`, which calls a callback for each visible node. The callback's return value controls child traversal:

```typescript
traverseVisible(
  callback: (node: Node) => boolean | void,
  onExitNode?: (node: Node) => void
): void {
  const visit = (nodeId: string): void => {
    const node = this.nodes.get(nodeId);
    if (!node || !node.visible) return;
    const result = callback(node);
    if (result === false) return; // skip children, continue siblings
```

When ShapeRenderer encounters a boolean group, it renders the computed result and returns `false` to skip the children:

```typescript
// Boolean group: render computed result, skip children
if (node.type === 'group' && node.booleanOp) {
  const groupNode = node;
  const renderBoolGroup = () => {
    this.renderBooleanGroup(groupNode, worldTransform, sceneGraph);
  };

  if (this.effectRenderer.needsMultiPass(node.effects, node.blendMode)) {
    this.effectRenderer.renderNodeWithEffects(
      node.effects,
      node.blendMode,
      () => {
        /* restore shaders... */ renderBoolGroup();
      },
      canvasWidth,
      canvasHeight
    );
  } else {
    renderBoolGroup();
  }
  return false; // skip children
}
```

The children are invisible to the renderer. They exist in the scene graph, appear in the Layer Panel (so the user can select and edit them), but their individual shapes never reach the GPU. Only the boolean result does.

### Computing and Caching the Result

`renderBooleanGroup` computes the boolean result from the children's current geometry and transforms:

```typescript
private renderBooleanGroup(
  groupNode: GroupNode, _worldMatrix: Matrix3, sceneGraph: SceneGraph
): void {
  const children = sceneGraph.getChildren(groupNode.id).filter((c) => c.visible);
  const op = groupNode.booleanOp;
  if (!op || children.length < 2) return;

  const childTransforms = children.map((c) => sceneGraph.getWorldTransform(c.id));

  // Try to get cached tessellation
  const cacheKey = this.buildBooleanGroupCacheKey(groupNode, children, childTransforms, op);
  const cached = this.geometryCache.get(cacheKey);
```

The cache key encodes the operation, every child's geometry key (which includes node type, dimensions, and all shape-specific properties), and every child's world transform matrix:

```typescript
const parts: string[] = [`BG:${op}`];
for (let i = 0; i < children.length; i++) {
  const child = children[i]!;
  const t = childTransforms[i]!;
  parts.push(
    `${buildGeometryKey(child)}@${t.a.toFixed(4)},${t.b.toFixed(4)},${t.c.toFixed(4)},${t.d.toFixed(4)},${t.tx.toFixed(2)},${t.ty.toFixed(2)}`
  );
}
```

If any child moves, resizes, or reshapes, the cache key changes and the boolean result is recomputed. If nothing changes between frames, the cached vertex buffer is reused.

When a cache miss occurs, the renderer iterates through the children, converting each to a polygon and accumulating the result:

```typescript
let accum: MultiPolygon | null = null;
for (let i = 0; i < children.length; i++) {
  const child = children[i]!;
  const childTransform = childTransforms[i]!;
  let poly: MultiPolygon | null;

  if (child.type === 'group' && child.booleanOp) {
    poly = this.computeNestedBooleanPolygon(child, childTransform, sceneGraph);
  } else {
    poly = nodeToPolygon(child, childTransform);
  }
  if (!poly) continue;

  if (!accum) {
    accum = poly;
  } else {
    accum = performBoolean(accum, poly, op);
  }
}
```

Nested boolean groups — a union group inside a subtract group — are handled recursively, with a depth limit of 10 to prevent infinite recursion.

### Tessellating the Result

The `polygon-clipping` result is a `MultiPolygon` — polygons with rings. The renderer tessellates each polygon independently using earcut, with the ring structure providing outer contours and holes:

```typescript
for (const polygon of accum) {
  for (const ring of polygon) {
    // Remove closing duplicate, flatten to Float32Array
    const flat = new Float32Array(pts.length * 2);
    // ...
  }
}
```

The first ring of each polygon is the outer contour. Subsequent rings are holes. earcut receives the flattened vertices plus hole indices and produces triangle indices. The result is rendered through `renderFillsAndStrokes` using an identity model matrix — the vertices are already in world space (the world transform was applied during `nodeToPolygon`).

The group's `fills` and `strokes` define the appearance, not the children's. This is why the boolean group has its own fills/strokes arrays — the result is a single visual shape with a single appearance, regardless of what the individual children look like.

## Three Destructive Operations

The non-destructive approach provides three escape hatches when the user wants to commit the result:

### Flatten

Flatten computes the boolean result and materializes it as a PathNode, destroying the group and its children:

```typescript
flattenBooleanGroup: (sceneGraph: SceneGraphLike) => {
  // ...verify it's a boolean group, pushUndo...

  const resultNode = booleanOperation(
    children, worldTransforms, groupNode.booleanOp!, generateId
  );

  resultNode.fills = groupNode.fills ?? resultNode.fills;
  resultNode.strokes = groupNode.strokes ?? resultNode.strokes;

  sceneGraph.addNode(resultNode, parentId ?? undefined);
  if (insertIndex >= 0) {
    sceneGraph.moveNode(resultNode.id, parentId ?? null, insertIndex);
  }
  sceneGraph.removeNode(groupId);
```

The `booleanOperation` function is the high-level API that chains `nodeToPolygon` → `performBoolean` → `polygonToContours` → `createBooleanResultNode`. The result inherits the group's fills/strokes and takes the group's position in the layer stack. Removing the group also removes its children.

### Release

Release dissolves the group without computing any result. The children are moved back to the group's parent:

```typescript
releaseBooleanGroup: (sceneGraph: SceneGraphLike) => {
  // ...pushUndo...

  const childIds = [...node.children];
  for (let i = 0; i < childIds.length; i++) {
    sceneGraph.moveNode(childIds[i], parentId ?? null, insertAt + i);
    movedChildIds.push(childIds[i]);
  }

  sceneGraph.removeNode(id);
```

The children are inserted at the group's former position, preserving their relative order. The empty group is removed. The shapes return to being independent, unbooleaned nodes.

### Change Operation

The simplest mutation — swap the operation type:

```typescript
changeBooleanOp: (sceneGraph: SceneGraphLike, op: BooleanOp) => {
  get().pushUndo(sceneGraph);
  for (const id of selectedNodeIds) {
    const node = sceneGraph.getNode(id);
    if (node && node.type === 'group' && node.booleanOp) {
      sceneGraph.updateNode(id, { booleanOp: op });
    }
  }
```

Since the boolean result is computed dynamically from the group's `booleanOp` and children, changing the operation from `'union'` to `'subtract'` immediately changes the visual result on the next frame. The geometry cache key includes the operation, so the cache invalidates automatically.

## From Polygons Back to Paths

The reverse conversion — `MultiPolygon` result to `PathPoint[][]` contours — strips the closing duplicate that `polygon-clipping` adds and converts coordinate pairs to `PathPoint` objects:

```typescript
export function polygonToContours(result: MultiPolygon): PathPoint[][] {
  const contours: PathPoint[][] = [];

  for (const polygon of result) {
    for (const ring of polygon) {
      if (ring.length < 3) continue;
      const points: PathPoint[] = ring.map(([x, y]) => ({
        position: { x, y },
        handleIn: null,
        handleOut: null,
        type: 'corner' as const,
      }));
      // Remove duplicate closing point
      if (
        points.length > 1 &&
        points[0]!.position.x === points[points.length - 1]!.position.x &&
        points[0]!.position.y === points[points.length - 1]!.position.y
      ) {
        points.pop();
      }
      if (points.length >= 3) contours.push(points);
    }
  }
  return contours;
}
```

All points are corner type with null handles — the tessellation has already linearized any curves. This means that a boolean union of two ellipses produces a polygon approximation, not smooth Bezier curves. The visual quality depends on the tessellation tolerance (1.0 pixel for boolean operations, tighter for stroke outlines). For most shapes at normal zoom levels, the linearization is invisible.

When the result has multiple contours — an outer ring and holes, or disjoint regions from an exclude — `createBooleanResultNode` packages the first contour as the PathNode's `points` and the rest as `subpaths`, with `fillRule: 'evenodd'` to correctly render holes:

```typescript
export function createBooleanResultNode(
  contours: PathPoint[][],
  fills: Fill[],
  strokes: Stroke[],
  name: string,
  generateId: () => string
): PathNode | null {
  if (contours.length === 0) return null;

  // Center all contours at AABB center
  // ...centering math identical to textToShape and outlineStroke...

  return {
    id: generateId(),
    name,
    type: 'path',
    transform: { position: center, /* ... */ anchor: { x: 0.5, y: 0.5 } },
    points: primaryContour,
    subpaths: centeredContours.length > 1 ? centeredContours.slice(1) : undefined,
    closed: true,
    fillRule: subpaths ? 'evenodd' : undefined,
    fills: fills.length > 0 ? fills : [],
    strokes: strokes.length > 0 ? strokes : [],
  };
}
```

The centering pattern — compute AABB center, subtract from all points, set position to center — is the same one used in text-to-path and outline-stroke. It ensures the resulting PathNode rotates around its visual center.

## Testing

The tests exercise each function in the pipeline independently, using hand-crafted polygons and nodes.

`nodeToPolygon` tests verify that each shape type converts to a valid `MultiPolygon` with the expected ring structure:

```typescript
it('converts a rectangle node to MultiPolygon', () => {
  const rect = makeRect('r1', 0, 0, 100, 100);
  const result = nodeToPolygon(rect, nodeTransform(rect));
  expect(result).not.toBeNull();
  expect(result!.length).toBe(1); // one polygon
  expect(result![0].length).toBeGreaterThanOrEqual(1); // at least one ring
  expect(result![0][0].length).toBeGreaterThanOrEqual(4); // at least 4 points
});
```

`performBoolean` tests use raw coordinate arrays — two overlapping 100x100 squares — and verify the geometric properties of each operation:

```typescript
it('union produces larger area', () => {
  const result = performBoolean(squareA, squareB, 'union');
  const xs = result[0][0].map(([x]) => x);
  expect(Math.min(...xs)).toBeCloseTo(0, 0);
  expect(Math.max(...xs)).toBeCloseTo(150, 0);
});

it('subtract removes overlap', () => {
  const result = performBoolean(squareA, squareB, 'subtract');
  const xs = result[0][0].map(([x]) => x);
  expect(Math.min(...xs)).toBeCloseTo(0, 0);
  expect(Math.max(...xs)).toBeCloseTo(50, 0);
});
```

The high-level `booleanOperation` tests verify the full pipeline — node creation through polygon conversion through boolean execution through result packaging — including mixed node types (rectangle + ellipse), three-or-more node chains, and graceful handling of unsupported node types.

## Lessons

**Non-destructive means keeping the inputs alive.** The key insight of the boolean group approach is that the children are not consumed by the operation — they are preserved inside the group. The boolean result is ephemeral, computed fresh from the children on every render frame (or served from cache). This is fundamentally different from a destructive approach where `union(A, B)` deletes A and B. Preserving the inputs costs nothing in memory (the shapes are small) and gives the user unlimited ability to adjust the result.

**Delegate numerical geometry to a library.** Polygon clipping is a solved problem with nasty edge cases. The `polygon-clipping` library handles collinear edges, T-intersections, and floating-point precision issues that would take thousands of lines to implement correctly. The wrapper functions — `nodeToPolygon`, `performBoolean`, `polygonToContours` — are each under 30 lines. The hard work is the format conversion, not the geometry.

**Cache keys must capture everything that affects the result.** The boolean group cache key includes the operation type, every child's geometry key, and every child's full world transform matrix. Missing any component would cause stale results — moving a child without invalidating the cache would freeze the boolean result at the old position.

**Anchor (0,0) for groups that render in world space.** Boolean group results are tessellated in world coordinates — the world transform is baked into the polygon vertices during `nodeToPolygon`. Any non-zero anchor on the group would offset the rendered result from the computed result. The `(0, 0)` anchor requirement was discovered through a visual offset bug where the boolean result appeared shifted by half a unit in each axis.

## What We Built

This chapter covered non-destructive boolean operations — union, subtract, intersect, and exclude — that combine shapes while preserving their source geometry:

- **`nodeToPolygon`** converts any shape (rectangle, ellipse, polygon, path) to `polygon-clipping`'s `MultiPolygon` format by tessellating curves, re-closing rings, and applying the world transform matrix.
- **`performBoolean`** delegates to the `polygon-clipping` library for union, difference, intersection, and XOR — four one-line calls that avoid reimplementing the Martinez-Rueda-Feito algorithm.
- **`GroupNode.booleanOp`** marks a group as a boolean group. Its children are preserved but rendered as a computed result instead of individually. The group's `fills` and `strokes` define the result's appearance.
- **`renderBooleanGroup`** in ShapeRenderer computes the boolean result from children's current geometry and world transforms, tessellates it with earcut, and draws it using the group's fill and stroke appearance. A cache key covering the operation, all child geometry keys, and all child transforms prevents redundant recomputation.
- **`traverseVisible` returns `false`** for boolean groups to skip child rendering — the children exist in the scene graph for editing but are invisible to the renderer.
- **Three escape hatches**: Flatten materializes the result as a PathNode (destructive), Release dissolves the group and restores independent children, Change Operation swaps the boolean type for an immediate visual update.
- **`polygonToContours`** and **`createBooleanResultNode`** convert the `MultiPolygon` result back to `PathPoint[][]` contours, center them at the AABB, and package them as a PathNode with `fillRule: 'evenodd'` for correct hole rendering.

The next chapter moves from combining shapes to exchanging them with the outside world — SVG import and export, drag-and-drop file handling, and clipboard interoperability with other vector editors.
