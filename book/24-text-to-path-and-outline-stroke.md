# Text-to-Path & Outline Stroke

## From Live Text to Dead Vectors

The previous chapter traced the path from a TextNode through the font pipeline to GPU triangles. That pipeline runs every frame — the text remains live, editable, re-renderable. But sometimes the user wants to freeze the text into vector paths they can edit point by point: reshaping a letter's curve, breaking apart a word into individual characters, or removing the font dependency entirely before sharing a file.

This chapter covers two conversion operations. The first, Convert to Path, takes a TextNode and produces a GroupNode of per-letter PathNodes — each glyph centered at its own bounding box, individually selectable. The second, Outline Stroke, takes any shape's stroke and converts it into a filled PathNode — the stroke width becomes geometry. Both are destructive, one-way operations: the text is gone, the stroke is gone, but the user gains direct vector control over what was previously computed on the fly.

## Shape Outlines: A Shared Foundation

Both conversions need to extract the outline of a shape as `PathPoint[]` arrays. The `getShapeOutlinePoints` function in `shapeToPath.ts` handles this for every primitive type:

```typescript
export function getShapeOutlinePoints(node: Node): ShapeOutline | null {
  switch (node.type) {
    case 'rectangle': {
      const points = createRectanglePath(
        -node.width / 2,
        -node.height / 2,
        node.width,
        node.height,
        node.cornerRadius
      );
      return { points, closed: true };
    }
    case 'ellipse': {
      const points = createEllipsePath(0, 0, node.radiusX, node.radiusY);
      return { points, closed: true };
    }
    case 'polygon': {
      if (node.innerRadius !== undefined && node.innerRadius > 0) {
        const points = createStarPath(
          0,
          0,
          node.radius,
          node.innerRadius,
          node.sides,
          Math.PI / 2,
          node.cornerRadius
        );
        return { points, closed: true };
      }
      const points = createPolygonPath(
        0,
        0,
        node.radius,
        node.sides,
        Math.PI / 2,
        node.cornerRadius
      );
      return { points, closed: true };
    }
    case 'path': {
      const points = node.points.map(clonePathPoint);
      const subpaths = node.subpaths?.map((sp) => sp.map(clonePathPoint));
      return { points, subpaths, closed: node.closed };
    }
    default:
      return null;
  }
}
```

Each branch delegates to the same `createXxxPath` functions that the renderer uses to build geometry — `createRectanglePath`, `createEllipsePath`, `createPolygonPath`, `createStarPath`. The coordinates are in local space, centered at the origin. For a rectangle, that means the top-left is at `(-width/2, -height/2)`. For an ellipse, the center is at `(0, 0)`. Path nodes just clone their existing points.

The `ShapeOutline` return type carries the primary contour, optional subpaths (for compound paths or holes), and a `closed` flag. This is enough information for both Convert to Path (which preserves the outline verbatim) and Outline Stroke (which tessellates and offsets it).

## Converting Text to Paths

### The Single-Path Case

The simpler function, `convertTextToPath`, merges all glyphs into a single PathNode with multiple subpaths. It follows the same pipeline as rendering — `getFontOrFallback`, `textToSubpaths` — but instead of tessellating the result for GPU triangles, it packages the subpaths directly:

```typescript
export function convertTextToPath(textNode: TextNode, generateId: () => string): PathNode | null {
  const fm = getFontManager();
  const font = fm.getFontOrFallback(textNode.fontFamily, textNode.fontWeight);
  if (!font) return null;

  const result = textToSubpaths(textNode.content, font, textNode.fontSize, {
    textAlign: textNode.textAlign,
    lineHeight: textNode.lineHeight,
    letterSpacing: textNode.letterSpacing,
  });

  if (result.subpaths.length === 0) return null;
```

The font weight is passed through to `getFontOrFallback` — a detail that was missing in an earlier version and caused bold text to convert using the regular weight. The fix was straightforward: read `textNode.fontWeight` and forward it.

After `textToSubpaths` returns the glyph outlines, the function centers them at the AABB center:

```typescript
const bounds = computeSubpathsBounds(result.subpaths);
const centerX = bounds.x + bounds.width / 2;
const centerY = bounds.y + bounds.height / 2;

const centeredSubpaths: PathPoint[][] = [];
for (const sp of result.subpaths) {
  centeredSubpaths.push(
    sp.map((pt) => ({
      ...pt,
      position: { x: pt.position.x - centerX, y: pt.position.y - centerY },
      handleIn: pt.handleIn ? { ...pt.handleIn } : null,
      handleOut: pt.handleOut ? { ...pt.handleOut } : null,
    }))
  );
}
```

This centers the geometry at the origin so the PathNode's anchor `(0.5, 0.5)` aligns with the visual center. The world position is then computed by combining the text node's position with the local center offset scaled by the node's scale:

```typescript
const worldCenterX = textNode.transform.position.x + centerX * textNode.transform.scale.x;
const worldCenterY = textNode.transform.position.y + centerY * textNode.transform.scale.y;
```

The first subpath becomes the PathNode's `points`, and the rest become `subpaths`. The fill rule is `evenodd` — the same rule used for rendering compound glyph shapes where counter-clockwise inner contours represent holes (the hollow inside of an "O" or "B").

### The Per-Letter Case

`convertTextToPathGroup` is what the editor actually calls. It produces a GroupNode containing one PathNode per glyph — each letter individually selectable and editable:

```typescript
export function convertTextToPathGroup(
  textNode: TextNode, generateId: () => string
): TextToPathGroupResult | null {
  const fm = getFontManager();
  const font = fm.getFontOrFallback(textNode.fontFamily, textNode.fontWeight);
  if (!font) return null;

  const result = textToSubpaths(textNode.content, font, textNode.fontSize, {
    textAlign: textNode.textAlign,
    lineHeight: textNode.lineHeight,
    letterSpacing: textNode.letterSpacing,
  });

  if (result.glyphs.length === 0) return null;
```

The key difference is using `result.glyphs` instead of `result.subpaths`. As described in the previous chapter, `textToSubpaths` returns both a flat list of all subpaths (for rendering) and a per-glyph grouping (for this conversion). Each glyph group contains the character name and its subpaths.

The group is positioned at the overall text center:

```typescript
const overallBounds = computeSubpathsBounds(result.subpaths);
const overallCX = overallBounds.x + overallBounds.width / 2;
const overallCY = overallBounds.y + overallBounds.height / 2;

const groupWorldX = textNode.transform.position.x + overallCX * textNode.transform.scale.x;
const groupWorldY = textNode.transform.position.y + overallCY * textNode.transform.scale.y;
```

The group's anchor is `(0, 0)`, not `(0.5, 0.5)` — groups do not have intrinsic dimensions, so a centered anchor would have nothing to offset from.

Each glyph then gets its own PathNode, centered at its own AABB:

```typescript
for (const glyphGroup of result.glyphs) {
  const glyphBounds = computeSubpathsBounds(glyphGroup.subpaths);
  const glyphCX = glyphBounds.x + glyphBounds.width / 2;
  const glyphCY = glyphBounds.y + glyphBounds.height / 2;

  const centeredSps = centerSubpaths(glyphGroup.subpaths, glyphCX, glyphCY);

  const child: PathNode = {
    id: generateId(),
    name: glyphGroup.char,
    type: 'path',
    parent: groupId,
    transform: {
      position: { x: glyphCX - overallCX, y: glyphCY - overallCY },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    // ...
  };
  children.push(child);
}
```

The child's position is relative to the group — the glyph center minus the overall center. This means the group's transform handles the text's world position and rotation, while each child only carries its offset from the group center. The child itself has no rotation or scale — those are inherited from the group.

The child's `name` is the character itself — `"H"`, `"e"`, `"l"`, `"l"`, `"o"`. This appears in the Layer Panel, making it easy to identify individual letters.

Characters that produce no contours — spaces, for instance — are silently skipped. A space has advance width (it moves the cursor forward) but no glyph outlines, so `glyphGroup.subpaths` is empty and no PathNode is created.

### Wiring Into the Editor

The store action `convertTextToPath` iterates selected text nodes, calls `convertTextToPathGroup` on each, and replaces them in the scene graph:

```typescript
convertTextToPath: (sceneGraph: SceneGraphLike) => {
  // ...filter to text nodes, pushUndo...

  for (const id of textIds) {
    const node = sceneGraph.getNode(id);
    if (!node || node.type !== 'text') continue;

    const result = convertTextToPathGroupFn(node, generateId);
    if (!result) {
      toast.error(`Could not convert "${node.name}" — font not loaded`);
      continue;
    }

    // Preserve z-order: insert at same index as original
    const parentId = node.parent;
    const siblings = parentId
      ? (sceneGraph.getNode(parentId)?.children ?? [])
      : sceneGraph.getRootNodes().map((n) => n.id);
    const insertIndex = siblings.indexOf(id);

    sceneGraph.addNode(result.group, parentId ?? undefined);
    for (const child of result.children) {
      sceneGraph.addNode(child, result.group.id);
    }
    if (insertIndex >= 0) {
      sceneGraph.moveNode(result.group.id, parentId ?? null, insertIndex);
    }
    sceneGraph.removeNode(id);
    newIds.push(result.group.id);
  }
```

The z-order preservation is important — the converted path group appears at the same position in the layer stack as the original text node. Without the `moveNode` call, the new group would be appended at the end, potentially appearing in front of shapes that were originally above the text.

The conversion is triggered from the Edit menu's "Convert to Path" item (Ctrl+Shift+P), which is disabled when no text node is selected:

```tsx
<MenuItem
  label="Convert to Path"
  shortcut="Ctrl+Shift+P"
  disabled={!hasTextSelected}
  onClick={() => {
    closeMenu();
    convertTextToPathAction(sceneGraph);
  }}
/>
```

## Converting Shapes to Paths

There is a second conversion path that does not involve text at all. When the user clicks an already-selected rectangle, ellipse, or polygon with the Direct Selection tool, the editor auto-converts it to a PathNode. This lets the user edit the primitive's vertices directly — adding points, adjusting handles, reshaping the geometry — without needing to go through a menu.

The `convertShapeToPath` store action handles this:

```typescript
convertShapeToPath: (sceneGraph: SceneGraphLike, nodeId: string): string | null => {
  const node = sceneGraph.getNode(nodeId);
  if (!node) return null;
  if (node.type !== 'rectangle' && node.type !== 'ellipse' && node.type !== 'polygon') {
    return null;
  }

  const outline = getShapeOutlinePoints(node);
  if (!outline || outline.points.length < 2) return null;

  get().pushUndo(sceneGraph);

  const pathNode: PathNode = {
    id: newId,
    name: `${node.name} (Path)`,
    type: 'path',
    parent: node.parent,
    transform: {
      position: { ...node.transform.position },
      rotation: node.transform.rotation,
      scale: { ...node.transform.scale },
      anchor: { x: 0.5, y: 0.5 },
      skew: { ...node.transform.skew },
    },
    points: outline.points,
    subpaths: outline.subpaths,
    closed: outline.closed,
    fills: structuredClone(fills),
    strokes: structuredClone(strokes),
  };
```

Unlike text conversion, this is a simple one-to-one replacement — no group, no centering math. The shape's outline points are already in local space relative to the node's own center (because `getShapeOutlinePoints` generates them at the origin). The transform carries over unchanged. The original node is removed and the PathNode takes its place at the same z-order position.

## Outline Stroke

### The Problem

A stroke is not geometry — it is a rendering instruction. When ShapeRenderer draws a 4px stroke around a rectangle, it generates offset vertices at render time, sends them to the GPU, and discards them after the frame. The stroke has no existence as a shape the user can select, fill, or edit.

Outline Stroke makes the stroke into geometry. The result is a filled PathNode whose outline matches what the stroke looked like. The original stroke is removed from the source node, and the new path appears as a sibling in the layer stack.

### Tessellation and Offset

The function starts by extracting the shape's outline and tessellating it to line segments:

```typescript
export function outlineStroke(
  node: Node, strokeIndex: number, generateId: () => string
): PathNode | null {
  const stroke = strokes[strokeIndex];
  if (!stroke || !stroke.visible) return null;

  const outline = getShapeOutlinePoints(node);
  if (!outline || outline.points.length < 2) return null;

  const allContours: PathPoint[][] = [outline.points];
  if (outline.subpaths) {
    allContours.push(...outline.subpaths);
  }
```

Each contour (the primary path plus any subpaths) is processed independently. First, per-vertex corner radius is applied — this replaces sharp corners with smooth arcs before tessellation, matching what the renderer would draw. Then the contour is tessellated to a flat vertex array:

```typescript
const resolvedContour = applyCornerRadius(contour, outline.closed);
const vertices = tessellatePathToVertices(resolvedContour, outline.closed, 0.5);
```

The tessellation tolerance `0.5` produces line segments that deviate at most half a pixel from the true bezier curves. This is tighter than the renderer's typical tolerance because the outline will be re-fitted to smooth curves — any tessellation error becomes permanent.

Next, `generateStrokeOutlineVertices` offsets the tessellated path by the stroke width to produce two parallel polylines — one on each side of the path:

```typescript
const outlineVerts = generateStrokeOutlineVertices(
  vertices,
  numVertices,
  stroke.width,
  outline.closed,
  stroke.align ?? 'center'
);
```

For center-aligned strokes, each side is offset by half the stroke width. For inside-aligned strokes, the left offset is zero and the right offset is the full width (pushing entirely inward). For outside-aligned, the opposite.

The function returns a flat Float32Array: `[leftSide(N points)... rightSideReversed(N points)...]`. For closed shapes, these form two separate closed contours — an outer ring and an inner ring. For open paths, they are stitched together into a single closed ribbon.

### Smoothing with Schneider Curve Fitting

At this point the outline is hundreds or thousands of line segments — the tessellation produces dense polylines with no bezier handles. Converting these raw vertices directly to PathPoints would create a PathNode with hundreds of corner points. This is technically correct but impractical for editing.

The `simplifyToSmoothPoints` function uses Schneider's curve fitting algorithm to convert the polyline back to smooth bezier curves:

```typescript
function simplifyToSmoothPoints(verts: Float32Array, startIdx: number, count: number): PathPoint[] {
  if (count < 2) return [];

  const points: Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (startIdx + i) * 2;
    points.push({ x: verts[idx], y: verts[idx + 1] });
  }

  // For very few points, return corners directly
  if (points.length <= 4) {
    return points.map((p) => createCornerPoint(p));
  }

  // Fit cubic bezier curves using Schneider's algorithm
  const curves = schneiderFitCurve(points, SCHNEIDER_MAX_ERROR);
  if (curves.length === 0) return points.map((p) => createCornerPoint(p));

  const pathPoints = curvesToPathPoints(curves);
  return pathPoints;
}
```

Schneider's algorithm (described in _Graphics Gems I_, 1990) fits a chain of G1-continuous cubic bezier curves to a polyline. It works by:

1. Estimating initial control points from endpoint tangents.
2. Using Newton-Raphson iteration to minimize the maximum deviation from the original points.
3. Splitting the curve at the point of worst error if the fit is not good enough, then recursively fitting each half.

The error tolerance `SCHNEIDER_MAX_ERROR = 0.25` is tight — a quarter pixel maximum deviation. This preserves the stroke's visual accuracy while reducing hundreds of vertices to a handful of smooth bezier segments.

The result, `curvesToPathPoints`, converts each `CubicSegment { p0, p1, p2, p3 }` into PathPoints with relative bezier handles:

```typescript
// End point: handleIn from p2→p3, handleOut from next segment's p0→p1
const handleIn = vec2.subtract(seg.p2, seg.p3);
pathPoints.push({
  position: { ...seg.p3 },
  handleIn: vec2.length(handleIn) > EPSILON ? handleIn : null,
  handleOut: vec2.length(handleOut) > EPSILON ? handleOut : null,
  type: 'smooth',
});
```

The left and right sides of the stroke are fit independently. For closed shapes, each becomes a separate closed contour — the first as the primary `points`, the second as a subpath. Together with `fillRule: 'evenodd'`, the inner contour acts as a hole, creating the hollow ribbon shape of the stroke:

```typescript
if (outline.closed) {
  // Two separate closed contours (outer ring + inner ring)
  if (leftPoints.length >= 3) resultContours.push(leftPoints);
  if (rightPoints.length >= 3) resultContours.push(rightPoints);
} else {
  // Open paths: stitch left + right into one closed ribbon contour
  if (leftPoints.length >= 2 && rightPoints.length >= 2) {
    resultContours.push([...leftPoints, ...rightPoints]);
  }
}
```

### Centering and Positioning

After building all contours, the function centers them at the AABB center (the same pattern as text-to-path):

```typescript
let minX = Infinity,
  minY = Infinity,
  maxX = -Infinity,
  maxY = -Infinity;
for (const contour of resultContours) {
  const b = getPathBounds(contour, true);
  minX = Math.min(minX, b.x);
  // ...
}
const centerX = (minX + maxX) / 2;
const centerY = (minY + maxY) / 2;
```

The world position combines the original node's position with the local center offset, accounting for scale:

```typescript
const worldX = node.transform.position.x + centerX * sx;
const worldY = node.transform.position.y + centerY * sy;
```

### Stroke Color Becomes Fill

The most visible transformation: the stroke's color becomes the new node's fill. The stroke is gone — replaced by a filled shape that matches its former appearance:

```typescript
const fill = {
  type: stroke.type as 'solid' | 'gradient',
  color: stroke.color,
  opacity: stroke.opacity,
  visible: true,
  gradient: (stroke as { gradient?: unknown }).gradient,
};

return {
  // ...
  fills: [fill],
  strokes: [],
};
```

Gradient strokes carry over as gradient fills. The result PathNode has no strokes — the stroke is now the shape itself.

### Wiring Into the Editor

The store action for Outline Stroke removes the outlined stroke from the original node and adds the new path as a sibling:

```typescript
outlineStroke: (sceneGraph: SceneGraphLike) => {
  // ...filter nodes with visible strokes, pushUndo...

  for (const id of validIds) {
    const outlinePath = outlineStrokeFn(node, strokeIdx, generateId);

    // Remove the outlined stroke from the original node
    const updatedStrokes = [...strokes];
    updatedStrokes.splice(strokeIdx, 1);
    sceneGraph.updateNode(id, { strokes: updatedStrokes });

    // Add as sibling after original
    sceneGraph.addNode(outlinePath, parentId ?? undefined);
    if (insertIndex >= 0) {
      sceneGraph.moveNode(outlinePath.id, parentId ?? null, insertIndex + 1);
    }
    newIds.push(outlinePath.id);
  }
```

The `insertIndex + 1` places the outline immediately after the original node — above it in the layer stack. The original node keeps its fills and any remaining strokes; only the outlined stroke is removed. The selection expands to include both the original node and the new outline path.

This is triggered from the Edit menu's "Outline Stroke" item (Ctrl+Shift+O), which is disabled when no selected node has a visible stroke.

## Testing

The test strategy for these conversions tests the pure functions in isolation, mocking the font system.

For `textToShape`, the tests verify that font weight is correctly forwarded — the bug that originally motivated the tests:

```typescript
it('convertTextToPath should pass fontWeight to getFontOrFallback', () => {
  const node = createTestTextNode({ fontWeight: 700 });
  convertTextToPath(node, () => 'id-1');
  expect(mockGetFontOrFallback).toHaveBeenCalledWith('Inter', 700);
});
```

For `outlineStroke`, the tests exercise the full pipeline — from node creation through tessellation and curve fitting — without mocks, verifying geometric properties of the output:

```typescript
it('produces outer and inner contours for closed shape', () => {
  const result = outlineStroke(makeRect(100, 80), 0, generateId);
  expect(result!.subpaths).toBeDefined();
  expect(result!.subpaths!.length).toBeGreaterThanOrEqual(1);
  expect(result!.points.length).toBeGreaterThanOrEqual(4);
});

it('stroke width affects outline size', () => {
  const thin = outlineStroke(makeRect(100, 80, 2), 0, generateId);
  const thick = outlineStroke(makeRect(100, 80, 10), 0, generateId);
  const thinBounds = getResultBounds(thin!);
  const thickBounds = getResultBounds(thick!);
  expect(thickBounds.width).toBeGreaterThan(thinBounds.width);
});
```

The geometric assertions — "thicker strokes produce larger outlines", "both contours span the full width", "outline covers all four sides" — test invariants that hold regardless of the exact number of tessellation vertices or curve-fitting segments.

## Lessons

**Center at AABB, not at the origin.** Both conversions compute the AABB center of the generated geometry and subtract it from every point. This centers the geometry so that the node's anchor `(0.5, 0.5)` aligns with the visual center. Without centering, rotation would pivot around whatever arbitrary corner the glyph data started at — typically the baseline origin of the first character.

**Fitting curves is the inverse of tessellation.** Outline Stroke tessellates bezier curves into polylines (to compute stroke offsets), then fits the polylines back into bezier curves (for editable output). The round-trip loses some information — the fitted curves are an approximation, not a reconstruction. But with a tight error tolerance, the visual difference is imperceptible, and the result has far fewer control points than the raw tessellation.

**Per-glyph centering preserves editability.** `convertTextToPathGroup` centers each letter at its own AABB center, not at the overall text center. This means each letter can be independently rotated, scaled, and transformed around its own visual center — matching the behavior users expect from "breaking apart" text in applications like Illustrator or Figma.

**Stroke removal is part of the conversion.** Outline Stroke does not just create a new path — it also removes the stroke from the original node. This prevents visual doubling (the rendered stroke plus the new filled path appearing together). The splice-and-update pattern ensures the original node remains valid with one fewer stroke.

## What We Built

This chapter covered two conversion operations that turn computed visual properties into editable vector geometry:

- **`getShapeOutlinePoints`** extracts the outline of any primitive (rectangle, ellipse, polygon, star, path) as `PathPoint[]` arrays in local space, delegating to the same `createXxxPath` functions the renderer uses.
- **`convertTextToPath`** converts a TextNode to a single PathNode with all glyph subpaths merged, centered at the AABB, with `fillRule: 'evenodd'` for proper holes.
- **`convertTextToPathGroup`** converts a TextNode to a GroupNode with one PathNode per glyph. Each letter is centered at its own AABB, positioned relative to the group center, and named with the character it represents. Spaces and other no-contour characters are skipped.
- **`convertShapeToPath`** in the editor store auto-converts primitives to PathNodes when the Direct Selection tool clicks them, enabling point-level editing of rectangles, ellipses, and polygons.
- **`outlineStroke`** tessellates a shape's contour, offsets it by the stroke width via `generateStrokeOutlineVertices`, then smooths the raw polyline back to bezier curves using Schneider's curve fitting algorithm. Closed shapes produce two contours (outer ring + inner ring with evenodd fill). Open paths produce a single stitched ribbon.
- **Schneider curve fitting** (`schneiderFitCurve` + `curvesToPathPoints`) reduces hundreds of tessellation vertices to a handful of smooth bezier segments, with a tight 0.25px error tolerance for visual accuracy.
- **Store integration** handles z-order preservation (inserting at the same index), stroke removal from the original node, font-not-loaded error toasts, and undo snapshots before any mutation.

The next chapter moves from converting individual shapes to combining them — non-destructive boolean operations that union, subtract, intersect, and exclude shapes while preserving the source geometry.
