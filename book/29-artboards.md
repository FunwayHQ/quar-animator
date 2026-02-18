# Artboards

## Named Frames for Composition

Most vector editors work on an infinite canvas — shapes float in unbounded space, and the document has no intrinsic dimensions. This works fine for individual illustrations, but animation projects need defined boundaries. A mobile app screen is 375 by 812 pixels. A banner ad is 728 by 90. A character turnaround has four poses side by side, each in its own frame. The user needs a way to declare "this rectangle of space is the composition," and the editor needs to respect that boundary during rendering and export.

Figma calls these **frames**. Sketch calls them **artboards**. Quar uses the same concept with the Figma name: artboards are special nodes that define a rectangular region with a background fill, optional content clipping, and the ability to contain child nodes. They reuse the existing `enteredGroupId` infrastructure from groups — double-click to enter, Escape to exit — and they automatically reparent nodes that are dragged into or out of their bounds.

## The ArtboardNode Type

An artboard is a scene graph node with explicit dimensions, a fill stack (supporting gradients), and a clipping toggle:

```typescript
export interface ArtboardNode extends BaseNode {
  type: 'artboard';
  width: number;
  height: number;
  fills: Fill[];
  clipContent: boolean;
}
```

Unlike rectangles, which also have `width` and `height`, artboards serve as containers. Their `children` array holds other nodes — shapes, text, images, groups — that are logically "inside" the composition. The `fills` array uses the same `Fill[]` type as other shape nodes, which means artboards support solid colors, linear gradients, and radial gradients for their background. The default is a white solid fill, matching Figma's convention.

The `clipContent` boolean controls whether children that extend beyond the artboard's bounds are visible. When true, the renderer clips anything outside the artboard rectangle. When false, children overflow freely — useful during editing when the user needs to see the full extent of shapes that partially extend beyond the composition boundary.

## The ArtboardTool — Drag to Create

The `ArtboardTool` follows the same drag-to-create pattern as `RectangleTool` and `EllipseTool`. It extends `BaseTool`, which provides `getRectFromPoints` for computing the rectangle from start and end drag points, plus modifier key support (Shift for square constraint, Alt for center-origin drawing):

```typescript
export class ArtboardTool extends BaseTool {
  readonly type = 'artboard' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: ArtboardNode | null = null;

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.previewNode = this.createArtboardNode(
      event.worldPosition.x, event.worldPosition.y, 0, 0
    );
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint ||
        !this.previewNode) return;

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

    if (rect.width >= this.getMinimumSize() &&
        rect.height >= this.getMinimumSize()) {
      const node = this.createArtboardNode(
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
```

The `createArtboardNode` method sets the defaults:

```typescript
private createArtboardNode(
  cx: number, cy: number,
  width: number, height: number
): ArtboardNode {
  const transform = createDefaultTransform();
  transform.position = { x: cx, y: cy };
  transform.anchor = { x: 0.5, y: 0.5 };
  transform.rotation = 0;

  return {
    id: this.context.generateId(),
    name: 'Artboard',
    type: 'artboard',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    fills: [
      {
        type: 'solid',
        color: { r: 255, g: 255, b: 255, a: 1 },
        opacity: 1,
        visible: true,
      },
    ],
    clipContent: true,
  };
}
```

Three defaults are notable. The anchor is `(0.5, 0.5)`, centering the artboard on its position — the position passed in is the center of the drawn rectangle, so the artboard's transform position is its visual center. The rotation is hardcoded to 0. And `clipContent` defaults to true, matching the expectation that a composition frame clips its contents.

The position is computed as `rect.x + rect.width / 2` and `rect.y + rect.height / 2` — the center of the bounding rectangle, not its corner. This works with the `(0.5, 0.5)` anchor so that the artboard's `width` and `height` extend equally in both directions from the position.

After creation, the tool auto-selects the new artboard and switches to the selection tool — the same post-creation behavior as every other shape tool. The `F` keyboard shortcut activates the artboard tool, matching Figma's convention.

## Rendering — Background and Scissor Clipping

The ShapeRenderer handles artboards in two phases during its `traverseVisible` walk: rendering the background when entering the node, and popping the scissor clip when exiting.

### Background Rendering

The `renderArtboardBackground` method creates a rectangle path matching the artboard dimensions, tessellates it, and renders the fills:

```typescript
renderArtboardBackground(
  node: ArtboardNode,
  worldMatrix: Matrix3
): void {
  if (!this.program) return;

  const fills = node.fills;
  if (!fills || fills.length === 0) return;

  const anchor = node.transform.anchor;
  const pathPoints = createRectanglePath(
    -node.width * anchor.x,
    -node.height * anchor.y,
    node.width,
    node.height,
    [0, 0, 0, 0]
  );
  const { vertices: tessellated, fillIndices } =
    this.getCachedTessellation(
      node.id + ':bg',
      node,
      pathPoints,
      true,
      DEFAULT_TESSELLATION_TOLERANCE
    );

  const modelArray = mat3.toFloat32Array(worldMatrix);
  this.currentModelMatrix = modelArray;
  this.renderer.useProgram(this.program);
  gl.uniformMatrix3fv(
    this.program.uniforms.u_model ?? null,
    false,
    modelArray
  );

  this.renderFillsAndStrokes(
    node.id + ':bg',
    tessellated,
    fillIndices,
    fills,
    [],    // no strokes on artboard background
    true,
    this.currentEffectiveOpacity
  );
}
```

The path starts at `(-width * anchor.x, -height * anchor.y)` — for the default `(0.5, 0.5)` anchor, this is `(-width/2, -height/2)`. This means the rectangle is centered at the origin in local space, and the world transform positions it correctly. The tessellation cache key is `node.id + ':bg'` to avoid colliding with the artboard's children.

The fills array supports gradients because the same `renderFillsAndStrokes` method handles both solid and gradient fills. A user can set a radial gradient background on an artboard just like they would on a rectangle.

### Scissor Clipping Stack

When `clipContent` is true, the renderer enables `gl.scissor` to clip all subsequent rendering to the artboard's screen-space rectangle. The implementation uses a stack to support nested artboards:

```typescript
// Scissor stack for artboard clipping
const scissorStack: {
  x: number;
  y: number;
  w: number;
  h: number;
}[] = [];

const pushScissor = (sx: number, sy: number, sw: number, sh: number) => {
  if (scissorStack.length > 0) {
    // Intersect with current top
    const top = scissorStack[scissorStack.length - 1];
    const ix1 = Math.max(sx, top.x);
    const iy1 = Math.max(sy, top.y);
    const ix2 = Math.min(sx + sw, top.x + top.w);
    const iy2 = Math.min(sy + sh, top.y + top.h);
    sx = ix1;
    sy = iy1;
    sw = Math.max(0, ix2 - ix1);
    sh = Math.max(0, iy2 - iy1);
  }
  scissorStack.push({ x: sx, y: sy, w: sw, h: sh });
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(sx, sy, sw, sh);
};

const popScissor = () => {
  scissorStack.pop();
  if (scissorStack.length === 0) {
    gl.disable(gl.SCISSOR_TEST);
  } else {
    const top = scissorStack[scissorStack.length - 1];
    gl.scissor(top.x, top.y, top.w, top.h);
  }
};
```

The critical detail is the intersection on push. When artboard B is nested inside artboard A, B's scissor rect must be the intersection of A's rect and B's rect — the clipping region can only shrink, never grow. Without this intersection, a nested artboard could clip to a region larger than its parent, defeating the parent's clipping. The `Math.max(0, ...)` on width and height prevents negative dimensions when the artboards don't overlap.

The scissor is applied in screen pixels, not world coordinates. The traversal callback computes screen-space corners by transforming the artboard's local corners through the world transform and the view-projection matrix:

```typescript
if (node.type === 'artboard') {
  this.renderArtboardBackground(node, worldTransform);
  if (node.clipContent) {
    const hw = node.width / 2;
    const hh = node.height / 2;
    // Artboard corners in local space (anchor 0.5,0.5)
    const corners = [
      mat3.transformPoint(worldTransform, { x: -hw, y: -hh }),
      mat3.transformPoint(worldTransform, { x: hw, y: -hh }),
      mat3.transformPoint(worldTransform, { x: hw, y: hh }),
      mat3.transformPoint(worldTransform, { x: -hw, y: hh }),
    ];
    // Transform world coords through VP to NDC
    const screenCorners = corners.map((c) => {
      const ndc = mat3.transformPoint(viewProjectionMatrix, c);
      return {
        x: (ndc.x * 0.5 + 0.5) * canvasWidth,
        y: (ndc.y * 0.5 + 0.5) * canvasHeight,
      };
    });
    const minX = Math.min(...screenCorners.map((c) => c.x));
    const minY = Math.min(...screenCorners.map((c) => c.y));
    const maxX = Math.max(...screenCorners.map((c) => c.x));
    const maxY = Math.max(...screenCorners.map((c) => c.y));
    pushScissor(Math.floor(minX), Math.floor(minY), Math.ceil(maxX - minX), Math.ceil(maxY - minY));
  }
  return; // continue into children
}
```

The `return` (without `false`) tells `traverseVisible` to continue into the artboard's children. The callback on exit pops the scissor:

```typescript
(node) => {
  // onExitNode: pop scissor when leaving a clipping artboard
  if (node.type === 'artboard' && node.clipContent) {
    popScissor();
  }
};
```

This required adding an `onExitNode` callback to `SceneGraph.traverseVisible` — the original traversal only had an enter callback:

```typescript
traverseVisible(
  callback: (node: Node) => boolean | void,
  onExitNode?: (node: Node) => void
): void {
  const visit = (nodeId: string): void => {
    const node = this.nodes.get(nodeId);
    if (!node || !node.visible) return;
    const result = callback(node);
    if (result === false) return; // skip children
    for (const childId of node.children) {
      visit(childId);
    }
    onExitNode?.(node);
  };
  for (const rootId of this.rootNodeIds) {
    visit(rootId);
  }
}
```

The `onExitNode` fires after all children have been visited but before moving to the next sibling. This is the exact moment to pop the scissor — all children have been rendered with the clip active, and now we restore the parent's clipping state.

## Selection and Resize — Artboard-Specific Behaviors

Artboards require several special cases in the `SelectionTool`.

### No Rotation

Artboards cannot be rotated. The scissor clipping assumes an axis-aligned rectangle in screen space — a rotated artboard would need a rotated clip region, which `gl.scissor` cannot express. The SelectionTool enforces this by checking whether all selected nodes are artboards when a rotation handle is hit:

```typescript
if (hitHandle?.startsWith('rotate-')) {
  const allArtboards = [...selectedIds].every((id) => {
    const n = this.context.sceneGraph.getNode(id);
    return n?.type === 'artboard';
  });
  if (allArtboards) {
    // Skip rotation — artboards cannot be rotated
    return;
  }
  // ... proceed with rotation for non-artboard nodes
}
```

The check uses `every` rather than `some` — if the selection contains both artboards and non-artboards, the non-artboards would be rotated but the artboards would not, which would produce confusing behavior. The simplest solution is to prevent rotation entirely when all selected nodes are artboards.

### Direct Width/Height Resize

Artboards resize by modifying `width` and `height` directly, like rectangles and images. They don't use `transform.scale`, which would scale their children as well. The `captureNodeStates` method saves the initial dimensions:

```typescript
} else if (node.type === 'artboard') {
  state.width = node.width;
  state.height = node.height;
}
```

And `performResize` applies the scale factor to those dimensions:

```typescript
} else if (
  node.type === 'artboard' &&
  initialState.width !== undefined &&
  initialState.height !== undefined
) {
  const newWidth = Math.max(1, initialState.width * scaleX);
  const newHeight = Math.max(1, initialState.height * scaleY);

  this.context.sceneGraph.updateNode(id, {
    transform: { ...node.transform, position: newPosition },
    width: newWidth,
    height: newHeight,
  });
}
```

The minimum of 1 pixel prevents zero-width or zero-height artboards, which would produce division-by-zero errors in the scissor calculation.

### Double-Click to Enter

Artboards reuse the group entry mechanism. The SelectionTool already handles double-click on groups to set `enteredGroupId`. Artboards are added to the same condition:

```typescript
if (
  event.clickCount === 2 &&
  hitNode &&
  (hitNode.type === 'group' || hitNode.type === 'artboard' || hitNode.type === 'symbol-instance')
) {
  this.context.setEnteredGroupId?.(hitNode.id);
  return;
}
```

Once the user has entered an artboard, clicks resolve to children within the artboard rather than selecting the artboard itself. The same `resolveHitToScope` mechanism that scopes selection within groups works unchanged for artboards — both are parent nodes with children.

## Auto-Reparent — Nodes Follow the Artboard

When the user moves a node on the canvas, it should automatically become a child of whatever artboard it lands on — and should leave its current artboard if dragged outside. This is the auto-reparent behavior that makes artboards feel like containers rather than mere background decorations.

The `autoReparentAfterMove` method runs after every move operation completes:

```typescript
private autoReparentAfterMove(selectedIds: Set<string>): void {
  const sg = this.context.sceneGraph;

  for (const id of selectedIds) {
    const node = sg.getNode(id);
    if (!node) continue;
    // Don't reparent artboards themselves
    if (node.type === 'artboard') continue;

    // Compute world center of node
    const wt = sg.getWorldTransform(id);
    const center = mat3.transformPoint(wt, { x: 0, y: 0 });

    const targetArtboard = this.findArtboardAtPoint(center);
    const currentParent = node.parent;

    const targetParentId = targetArtboard?.id ?? null;

    // Skip if already in the correct parent
    if (targetParentId === currentParent) continue;
    if (targetParentId === id) continue;

    // Don't reparent into a node that's also being moved
    if (targetParentId && selectedIds.has(targetParentId)) continue;

    // Convert world position to new parent's local coords
    // ...coordinate conversion logic...

    sg.moveNode(id, targetParentId);
    sg.updateNode(id, {
      transform: { ...node.transform, position: localPos },
    });
  }
}
```

Several guard clauses prevent incorrect reparenting. Artboards themselves are never reparented — they stay at the root level. A node is not reparented into itself. A node is not reparented into another node that's also being moved (which would produce an inconsistent state). And the same-parent check avoids unnecessary work.

The coordinate conversion is the tricky part. When a node moves from root level into an artboard, its position must change from world coordinates to local coordinates relative to the artboard. When it moves from one artboard to another, its position must be converted from the first artboard's local space to the second's. The logic handles four cases:

```typescript
if (node.parent) {
  // Current position is local — convert to world first
  const parentWorld = sg.getWorldTransform(node.parent);
  const wp = mat3.transformPoint(parentWorld, worldPos);
  if (targetParentId) {
    // World → new parent's local
    const newParentWorld = sg.getWorldTransform(targetParentId);
    const inv = mat3.invert(newParentWorld);
    localPos = inv ? mat3.transformPoint(inv, wp) : wp;
  } else {
    // Moving to root — local → world
    localPos = wp;
  }
} else {
  // Currently at root — worldPos is already world
  if (targetParentId) {
    // World → new parent's local
    const newParentWorld = sg.getWorldTransform(targetParentId);
    const inv = mat3.invert(newParentWorld);
    localPos = inv ? mat3.transformPoint(inv, worldPos) : worldPos;
  }
}
```

The `findArtboardAtPoint` method searches for the deepest artboard containing a world-space point. "Deepest" matters because artboards can be nested — a mobile screen artboard inside a larger desktop artboard:

```typescript
private findArtboardAtPoint(worldPoint: Vector2): Node | null {
  const sg = this.context.sceneGraph;
  let deepest: Node | null = null;
  let deepestDepth = -1;

  const visit = (nodeId: string, depth: number): void => {
    const node = sg.getNode(nodeId);
    if (!node || !node.visible || node.type !== 'artboard') return;
    const wt = sg.getWorldTransform(nodeId);
    const hw = node.width / 2;
    const hh = node.height / 2;
    const inv = mat3.invert(wt);
    if (!inv) return;
    const local = mat3.transformPoint(inv, worldPoint);
    if (local.x >= -hw && local.x <= hw &&
        local.y >= -hh && local.y <= hh) {
      if (depth > deepestDepth) {
        deepest = node;
        deepestDepth = depth;
      }
      // Check nested artboards
      for (const childId of node.children) {
        visit(childId, depth + 1);
      }
    }
  };

  for (const rootNode of sg.getRootNodes()) {
    visit(rootNode.id, 0);
  }
  return deepest;
}
```

The hit test transforms the world point into the artboard's local space via inverse matrix multiplication, then checks if the local point falls within `[-hw, hw] x [-hh, hh]`. If it does and the artboard is deeper than any previous match, it becomes the new candidate. The recursive call into children handles nesting — a point inside both the outer and inner artboard will match the inner one because it has a higher depth.

## The ArtboardOverlay — Name and Dimensions

Figma displays the artboard name and dimensions above its top-left corner. The `ArtboardOverlay` component provides this same affordance as an SVG overlay:

```typescript
export function ArtboardOverlay({
  artboardNodes,
  selectedNodeIds,
  camera,
  sceneGraph,
  cameraVersion,
}: ArtboardOverlayProps) {
  const labels = useMemo(() => {
    if (!camera || artboardNodes.length === 0) return [];

    return artboardNodes.map((artboard) => {
      const worldTransform =
        sceneGraph.getWorldTransform(artboard.id);
      const hw = artboard.width / 2;
      const hh = artboard.height / 2;

      // Top-left corner in world space (anchor 0.5, 0.5)
      const topLeftWorld = {
        x: worldTransform.a * -hw +
           worldTransform.c * hh +
           worldTransform.tx,
        y: worldTransform.b * -hw +
           worldTransform.d * hh +
           worldTransform.ty,
      };

      const screenPos = camera.worldToScreen(topLeftWorld);
      const isSelected = selectedNodeIds.has(artboard.id);

      return {
        id: artboard.id,
        x: screenPos.x,
        y: screenPos.y - LABEL_OFFSET_Y,
        name: artboard.name,
        width: Math.round(artboard.width),
        height: Math.round(artboard.height),
        isSelected,
      };
    });
  }, [artboardNodes, camera, sceneGraph, selectedNodeIds,
      cameraVersion]);
```

The top-left corner computation manually applies the world transform matrix to the point `(-hw, hh)` — that's the top-left in Y-up world space, where positive Y is up. The `camera.worldToScreen` conversion translates this to pixel coordinates for the SVG overlay.

Selected artboards get the violet accent color (`#A855F7`) and bold weight; unselected artboards use a neutral gray. The dimensions are displayed as `width x height` in a smaller font after the name:

```typescript
<text
  key={label.id}
  x={label.x}
  y={label.y}
  fill={label.isSelected ? '#A855F7' : '#999'}
  fontSize={11}
  fontWeight={label.isSelected ? 600 : 400}
>
  {label.name}
  <tspan dx="6" fontSize={10}>
    {label.width} x {label.height}
  </tspan>
</text>
```

The `cameraVersion` dependency in `useMemo` ensures labels recompute when the camera pans or zooms. Without it, the labels would lag behind camera movements because `camera` itself is a mutable object whose reference doesn't change.

## The Geometry Cache Key Bug

During artboard development, resizing an artboard appeared to do nothing — the background rectangle stayed the same size even though the node's `width` and `height` were updating correctly. The issue was in `buildGeometryKey`, the function that generates a cache key for tessellated geometry.

The tessellation cache stores computed vertices keyed by a string that encodes the shape's geometry-affecting properties. For rectangles, the key includes `width`, `height`, and `cornerRadius`. For artboards, the key was initially missing — the `switch` statement fell through to the `default` case which returned an empty string:

```typescript
case 'artboard':
  return ''; // Bug: always returns the same key
```

An empty key meant the cache always found a hit. The first tessellation was cached under `''`, and every subsequent resize check found the same entry — the stale geometry from the original size. The fix was adding a proper key:

```typescript
case 'artboard':
  return `A:${node.width}:${node.height}:${node.transform.anchor.x}:${node.transform.anchor.y}`;
```

The `A:` prefix distinguishes artboard keys from other types. Width, height, and anchor are the four values that affect the artboard background geometry. When any changes, the key changes, the cache misses, and the tessellation is regenerated.

This bug is easy to introduce for any new node type. The `buildGeometryKey` function must have a case for every node type that has visual geometry. A missing case silently produces stale renders rather than an error.

## Export and the Background Toggle

Artboards define natural export boundaries. When the user exports a selection containing an artboard, the export uses the artboard's dimensions as the output size. The `ExportSetting` type on each node includes an `includeBackground` flag:

```typescript
export interface ExportSetting {
  format: 'png' | 'svg';
  multiplier: number;
  includeBackground?: boolean;
}
```

When `includeBackground` is true (the default), the artboard's fill is rendered as the background of the exported image. When false, the background is transparent — useful for exporting content with alpha for compositing in other tools.

The PropertiesPanel exposes this as a checkbox in the export presets section, and the artboard-specific section adds the `clipContent` toggle:

```typescript
<div className={styles.propertyRow}>
  <span className={styles.propertyLabel}>Clip Content</span>
  <div className={styles.propertyInputs}>
    <input
      type="checkbox"
      checked={artboard.clipContent}
      onChange={(e) => {
        pushUndo(sceneGraph);
        sceneGraph.updateNode(nodeId, {
          clipContent: e.target.checked,
        });
      }}
    />
  </div>
</div>
```

## Testing Artboards

The `ArtboardTool` test suite covers creation, preview, modifiers, and edge cases. Tests use the standard `createMockToolContext` and `createMockPointerEvent` helpers:

```typescript
it('should create artboard on drag', () => {
  tool.onPointerDown(
    createMockPointerEvent({
      worldPosition: { x: 0, y: 0 },
      button: 0,
    })
  );
  tool.onPointerMove(
    createMockPointerEvent({
      worldPosition: { x: 200, y: 150 },
    })
  );
  tool.onPointerUp(
    createMockPointerEvent({
      worldPosition: { x: 200, y: 150 },
      button: 0,
    })
  );

  expect(context.sceneGraph.getNodeCount()).toBe(1);
  const nodes = Array.from(context.sceneGraph.getNodes());
  const artboard = nodes[0] as ArtboardNode;
  expect(artboard.type).toBe('artboard');
  expect(artboard.width).toBe(200);
  expect(artboard.height).toBe(150);
});

it('should have clipContent true by default', () => {
  tool.onPointerDown(
    createMockPointerEvent({
      worldPosition: { x: 0, y: 0 },
      button: 0,
    })
  );
  tool.onPointerUp(
    createMockPointerEvent({
      worldPosition: { x: 100, y: 100 },
      button: 0,
    })
  );

  const artboard = Array.from(context.sceneGraph.getNodes())[0] as ArtboardNode;
  expect(artboard.clipContent).toBe(true);
});

it('should enforce minimum size', () => {
  tool.onPointerDown(
    createMockPointerEvent({
      worldPosition: { x: 0, y: 0 },
      button: 0,
    })
  );
  tool.onPointerUp(
    createMockPointerEvent({
      worldPosition: { x: 0.5, y: 0.5 },
      button: 0,
    })
  );

  expect(context.sceneGraph.getNodeCount()).toBe(0);
});
```

The `ArtboardOverlay` tests verify label rendering, selection highlighting, and the null-camera guard:

```typescript
it('renders artboard name and dimensions', () => {
  const sg = new SceneGraph();
  const camera = new Camera();
  const artboard = createTestArtboard(
    'art1', 'My Frame', 500, 400, 1920, 1080
  );
  sg.addNode(artboard);

  render(
    <ArtboardOverlay
      artboardNodes={[artboard]}
      selectedNodeIds={new Set()}
      camera={camera}
      sceneGraph={sg}
      cameraVersion={0}
    />
  );

  expect(screen.getByText('My Frame')).toBeInTheDocument();
  expect(screen.getByText('1920 x 1080')).toBeInTheDocument();
});

it('highlights selected artboard with different color', () => {
  // ...
  const textEl = container.querySelector('text');
  expect(textEl!.getAttribute('fill')).toBe('#A855F7');
  expect(textEl!.getAttribute('font-weight')).toBe('600');
});

it('renders nothing when camera is null', () => {
  // ...
  expect(container.querySelector('svg')).toBeNull();
});
```

## Lessons

**Scissor clipping requires a stack for nesting.** A single `gl.scissor` call works for one artboard, but nested artboards need intersected clip regions. The stack pattern — push the intersection on enter, pop on exit — generalizes to any nesting depth. The `onExitNode` callback on `traverseVisible` was added specifically for this pattern, and the same enter/exit structure could support other post-children operations in the future.

**Every node type needs a geometry cache key.** The `buildGeometryKey` function generates a string that uniquely identifies a node's visual geometry. A missing case for a new node type returns `''`, which means the tessellation cache returns stale data on every frame after the first. Artboard resize appeared broken because the background rectangle was cached under an empty key that never changed. The fix is mechanical — add `case 'artboard': return 'A:${...}'` — but the symptom is baffling if you don't know the cache exists.

**Auto-reparent requires coordinate conversion.** Moving a node from the root into an artboard changes its coordinate space. The node's world position must be preserved visually, which means converting its `transform.position` from world coordinates (or the old parent's local coordinates) to the new parent's local coordinates via inverse matrix multiplication. Four cases arise — root-to-artboard, artboard-to-root, artboard-to-artboard, and same-parent (no-op) — and each requires different matrix operations.

**Artboards reuse group infrastructure.** Double-click to enter, Escape to exit, `resolveHitToScope` for scoped selection — all of this existed for groups and works identically for artboards. The only addition to the selection tool's double-click handler was adding `hitNode.type === 'artboard'` to the condition. This validates the group-entry design: it was general enough to accommodate a new container type without refactoring.

**Rotation is forbidden because scissor is axis-aligned.** `gl.scissor` defines a rectangle aligned to the screen axes. A rotated artboard would need a rotated clip region, which requires either stencil buffer clipping or framebuffer-based compositing — both significantly more expensive. The pragmatic choice is to prevent rotation on artboards entirely. If rotation is ever needed, the clipping strategy must change.

**Overlay labels need camera version tracking.** The `ArtboardOverlay` uses `useMemo` to avoid recomputing label positions on every render. The memo depends on `cameraVersion` — a counter that increments on pan and zoom. Without it, the labels would stay at stale screen positions when the camera moves, because the camera object is mutated in place rather than replaced.

## What We Built

This chapter covered artboards — named composition frames that define boundaries, clip content, and organize nodes spatially:

- **`ArtboardNode`** extends `BaseNode` with `width`, `height`, `fills: Fill[]` (supporting solid and gradient backgrounds), and `clipContent: boolean`. Artboards use anchor `(0.5, 0.5)` and cannot be rotated.
- **`ArtboardTool`** (F shortcut) creates artboards by dragging, with Shift for square constraint and Alt for center-origin drawing. The minimum size check prevents degenerate zero-area artboards. Post-creation auto-selects and switches to selection tool.
- **Scissor clipping** uses a `pushScissor`/`popScissor` stack that intersects nested clip regions. `traverseVisible` gained an `onExitNode` callback to pop the scissor after all children are rendered. Screen-space corners are computed by transforming local artboard corners through the world transform and view-projection matrix.
- **Auto-reparent** runs after every move operation. `findArtboardAtPoint` searches for the deepest artboard containing the node's world center. `autoReparentAfterMove` converts positions between coordinate spaces via inverse matrix multiplication and calls `sceneGraph.moveNode` to reparent.
- **Selection behaviors** prevent rotation on artboards, resize via direct `width`/`height` modification (not `transform.scale`), and reuse the `enteredGroupId` mechanism for double-click-to-enter, Escape-to-exit navigation.
- **`ArtboardOverlay`** renders SVG labels showing the artboard name and dimensions above the top-left corner, with violet accent highlighting for selected artboards and `cameraVersion`-dependent memo for responsive positioning.
- **The geometry cache key bug** taught that `buildGeometryKey` must return a unique string for every node type. The missing `case 'artboard'` returned `''`, causing stale tessellation on resize.
- **Export** uses artboard dimensions as output boundaries, with an `includeBackground` toggle for transparent output.

The next part of the book shifts from building the editor's internal systems to getting work out of it — the binary file format that replaces JSON with an efficient container for projects with embedded images, and the export pipeline that renders animations to sprite sheets, PNG sequences, and Lottie JSON.
