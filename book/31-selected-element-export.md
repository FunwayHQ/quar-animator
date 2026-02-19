# Selected Element Export

## Getting Pixels Out

The previous chapter built the binary file format — a way to save and load entire projects. But users don't just save projects. They need to get individual assets out of the editor: a logo as a PNG for a website, an icon as an SVG for a component library, a character sprite at 2x resolution for a Retina display. In Figma, this is the export section at the bottom of the properties panel — a list of presets that define how each element should be exported, with a single click to download.

This chapter builds that system. It has three parts: an SVG exporter that converts scene graph nodes to SVG markup, a PNG exporter that renders nodes to an offscreen WebGL canvas and captures the pixels, and a UI component that lets users attach persistent export presets to any node. The presets survive undo, redo, save, and load — they're part of the node's data, not ephemeral UI state.

The hard part isn't generating the files. It's the coordinate system gymnastics — flipping Y-axes for SVG, building orthographic projection matrices for PNG, and handling the one WebGL context flag that makes everything work or silently fail.

## The ExportSetting Type

An export preset is a small record stored directly on a scene graph node:

```typescript
export interface ExportSetting {
  format: 'png' | 'svg';
  multiplier: 1 | 2 | 3 | 4;
  includeBackground?: boolean;
}
```

The `multiplier` controls resolution for PNG exports: 1x gives you pixel-for-pixel output, 2x doubles the dimensions for Retina displays, 4x gives you a high-resolution asset for print or zoom. SVG ignores the multiplier — vector output is resolution-independent by definition.

The `includeBackground` flag is artboard-specific. When exporting an artboard as PNG, sometimes you want the white or gradient background, and sometimes you want transparency. The default is `true`.

These presets live on `BaseNode.exports`:

```typescript
export interface BaseNode {
  id: string;
  type: string;
  // ... other fields
  exports?: ExportSetting[];
}
```

Any node can have zero or more export presets. A logo might have `PNG 1x`, `PNG 2x`, and `SVG` — three presets on one node. The presets are serialized with the project file, so opening the project a week later preserves the export configuration.

## SVG Export

SVG export is a pure function: nodes in, SVG string out. No canvas, no WebGL, no side effects. The exporter walks the scene graph, converts each node to SVG markup, and wraps the result in an `<svg>` element with a coordinate transform.

### The Y-Flip Problem

The editor uses a Y-up coordinate system — positive Y points upward, which is natural for math and matches OpenGL conventions. SVG uses Y-down — positive Y points downward, matching screen coordinates and the HTML flow direction. Every coordinate in the export must be flipped.

Rather than flipping each node's coordinates individually — which would be error-prone and touch every conversion function — the exporter applies a single transform at the SVG root:

```typescript
export function exportNodesToSvg(nodes: Node[], sceneGraph: SceneGraph): string {
  const defs: string[] = [];
  const elements = nodes.map((node) => nodeToSvgElement(node, sceneGraph, defs));

  // Compute combined bounds across all nodes
  const bounds = computeExportBounds(nodes, sceneGraph);
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX;
  const height = maxY - minY;

  const flipTransform = `scale(1,-1) translate(${fmt(-minX)},${fmt(-maxY)})`;

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` viewBox="0 0 ${fmt(width)} ${fmt(height)}"`,
    ` width="${fmt(width)}" height="${fmt(height)}">`,
    defsBlock,
    `<g transform="${flipTransform}">`,
    elements.join(''),
    `</g>`,
    `</svg>`,
  ].join('');
}
```

The `scale(1,-1)` flips the Y-axis. The `translate(-minX,-maxY)` repositions the content so it starts at the SVG origin. The `maxY` (not `minY`) is used because after the flip, what was the top (maximum Y in world space) becomes the origin (0 in SVG space).

This single transform at the root means every node converter works in world coordinates — the same coordinates the editor uses everywhere else. No per-node Y flipping, no sign errors, no forgetting to negate a handle offset.

### Converting Nodes to SVG Elements

Each node type has its own conversion path. The dispatcher routes by type:

```typescript
export function nodeToSvgElement(node: Node, sceneGraph: SceneGraph, defs: string[]): string {
  const transform = transformToSvgAttr(node.transform);

  switch (node.type) {
    case 'rectangle':
      return rectangleToSvg(node, defs, transform);
    case 'ellipse':
      return ellipseToSvg(node, defs, transform);
    case 'polygon':
      return polygonToSvg(node, defs, transform);
    case 'path':
      return pathToSvg(node, defs, transform);
    case 'text':
      return textToSvg(node, defs, transform);
    case 'image':
      return imageToSvg(node, transform);
    case 'group':
    case 'artboard':
      return groupToSvg(node, sceneGraph, defs, transform);
    default:
      return '';
  }
}
```

Rectangles with uniform corner radius use SVG's native `<rect rx="..." ry="...">`. Rectangles with per-corner radii — a feature from Chapter 16 — generate a `<path>` with arc commands, because SVG's `<rect>` only supports uniform corners:

```typescript
function rectangleToSvg(node: RectangleNode, defs: string[], transform: string): string {
  const anchorX = node.transform.anchor.x * node.width;
  const anchorY = node.transform.anchor.y * node.height;
  const x = -anchorX;
  const y = -anchorY;

  const fill = fillToSvgAttrs(node.fills?.[0], defs);
  const stroke = strokeToSvgAttrs(node.strokes?.[0], defs);
  const opacity = opacityAttr(node.opacity);

  const radii = node.cornerRadius;
  if (typeof radii === 'number' && radii > 0) {
    return (
      `<rect${transform} x="${fmt(x)}" y="${fmt(y)}"` +
      ` width="${fmt(node.width)}" height="${fmt(node.height)}"` +
      ` rx="${fmt(radii)}"${fill}${stroke}${opacity}/>`
    );
  }

  if (Array.isArray(radii)) {
    const d = roundedRectPath(x, y, node.width, node.height, radii);
    return `<path${transform} d="${d}"${fill}${stroke}${opacity}/>`;
  }

  return (
    `<rect${transform} x="${fmt(x)}" y="${fmt(y)}"` +
    ` width="${fmt(node.width)}" height="${fmt(node.height)}"` +
    `${fill}${stroke}${opacity}/>`
  );
}
```

Path nodes use `pathPointsToSvgD` to convert the editor's `PathPoint[]` representation to an SVG path `d` attribute:

```typescript
export function pathPointsToSvgD(points: PathPoint[], closed: boolean): string {
  if (points.length === 0) return '';

  const parts: string[] = [];
  const p0 = points[0]!;
  parts.push(`M${fmt(p0.position.x)},${fmt(p0.position.y)}`);

  forEachSegment(points, closed, (from, to) => {
    const { cp1, cp2 } = getAbsoluteControlPoints(from, to);
    const isLinear =
      cp1.x === from.position.x &&
      cp1.y === from.position.y &&
      cp2.x === to.position.x &&
      cp2.y === to.position.y;

    if (isLinear) {
      parts.push(`L${fmt(to.position.x)},${fmt(to.position.y)}`);
    } else {
      parts.push(
        `C${fmt(cp1.x)},${fmt(cp1.y)} ` +
          `${fmt(cp2.x)},${fmt(cp2.y)} ` +
          `${fmt(to.position.x)},${fmt(to.position.y)}`
      );
    }
  });

  if (closed) parts.push('Z');
  return parts.join('');
}
```

The function detects linear segments — where both control points coincide with their anchor positions — and emits `L` (lineto) commands instead of `C` (cubic Bezier) commands. This produces cleaner SVG for shapes that are mostly straight lines, like rectangles converted to paths.

Compound paths with subpaths concatenate their `d` attributes and set the fill rule:

```typescript
let d = pathPointsToSvgD(node.points, node.closed);
if (node.subpaths) {
  for (const sp of node.subpaths) {
    d += ' ' + pathPointsToSvgD(sp, true);
  }
}
const fillRule = node.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
```

### Gradient Definitions

SVG gradients live in a `<defs>` block, referenced by ID from fill or stroke attributes. The exporter accumulates definitions as it walks the node tree:

```typescript
export function fillToSvgAttrs(fill: Fill | undefined, defs: string[]): string {
  if (!fill) return ' fill="none"';

  if (fill.type === 'solid') {
    const hex = colorToHex(fill.color);
    const alpha =
      fill.color.a !== undefined && fill.color.a < 1 ? ` fill-opacity="${fmt(fill.color.a)}"` : '';
    return ` fill="${hex}"${alpha}`;
  }

  if (fill.type === 'gradient' && fill.gradient) {
    const id = nextDefsId('grad');
    defs.push(gradientToSvgDef(fill.gradient, id));
    return ` fill="url(#${id})"`;
  }

  return ' fill="none"';
}
```

A global counter generates unique IDs (`grad_1`, `grad_2`, `sgrad_1`) to prevent collisions when multiple nodes use gradients:

```typescript
let _defsIdCounter = 0;

function nextDefsId(prefix: string): string {
  return `${prefix}_${++_defsIdCounter}`;
}
```

The counter resets at the start of each export. Within a single SVG document, every gradient gets a unique ID. Across exports, the counter doesn't matter because each export produces an independent SVG file.

### Bounds Computation

The exporter needs to know how large the SVG should be. For a single node, this is its bounding box. For multiple selected nodes, it's the union of their bounding boxes. Both cases must account for world transforms — a rotated rectangle's bounding box is larger than its local dimensions.

```typescript
function getNodeWorldBounds(node: Node, sceneGraph: SceneGraph): ExportBounds | null {
  const local = getLocalExtent(node, sceneGraph);
  if (!local) return null;

  const wt = sceneGraph.getWorldTransform(node.id);

  // Transform all four corners through the world matrix
  const corners = [
    { x: local.minX, y: local.minY },
    { x: local.maxX, y: local.minY },
    { x: local.maxX, y: local.maxY },
    { x: local.minX, y: local.maxY },
  ];

  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  for (const c of corners) {
    const tx = wt[0] * c.x + wt[2] * c.y + wt[4];
    const ty = wt[1] * c.x + wt[3] * c.y + wt[5];
    minX = Math.min(minX, tx);
    minY = Math.min(minY, ty);
    maxX = Math.max(maxX, tx);
    maxY = Math.max(maxY, ty);
  }

  return { minX, minY, maxX, maxY };
}
```

This is the standard "transform AABB corners, compute new AABB" pattern. It overestimates the bounds for rotated shapes (the axis-aligned bounding box of a rotated rectangle is larger than the rectangle), but that's correct — the SVG viewport should include all visible pixels of every exported node.

### The Transform Attribute

Each node's local transform becomes an SVG `transform` attribute:

```typescript
export function transformToSvgAttr(transform: Transform): string {
  const parts: string[] = [];

  const { x, y } = transform.position;
  if (x !== 0 || y !== 0) {
    parts.push(`translate(${fmt(x)},${fmt(y)})`);
  }

  if (transform.rotation !== 0) {
    parts.push(`rotate(${fmt(transform.rotation)})`);
  }

  const { x: sx, y: sy } = transform.scale;
  if (sx !== 1 || sy !== 1) {
    parts.push(`scale(${fmt(sx)},${fmt(sy)})`);
  }

  const { x: ax, y: ay } = transform.anchor;
  if (ax !== 0 || ay !== 0) {
    // Anchor is applied as innermost (last) transform
    // Node geometry is offset by -anchor in local space
  }

  if (parts.length === 0) return '';
  return ` transform="${parts.join(' ')}"`;
}
```

SVG transforms apply right-to-left, matching the matrix multiplication order. Translate first, rotate second, scale third — the same order the rendering pipeline uses for the model matrix.

## PNG Export

PNG export is fundamentally different from SVG export. SVG is a data format conversion — nodes become markup. PNG requires actual rendering — nodes must be drawn to pixels by the GPU, then those pixels must be captured.

### The Offscreen Canvas Strategy

The export creates a temporary WebGL canvas, renders the selected nodes into it, and captures the result as a PNG blob:

```typescript
export async function exportSelectionAsPng(
  nodes: Node[],
  sceneGraph: SceneGraph,
  multiplier: number = 1,
  includeBackground: boolean = true
): Promise<void> {
  // Step 1: Compute export dimensions
  const isArtboard = nodes.length === 1
    && nodes[0].type === 'artboard';

  let pixelWidth: number, pixelHeight: number;
  let cx: number, cy: number;

  if (isArtboard) {
    const artboard = nodes[0] as ArtboardNode;
    pixelWidth = Math.ceil(artboard.width * multiplier);
    pixelHeight = Math.ceil(artboard.height * multiplier);
    cx = artboard.transform.position.x;
    cy = artboard.transform.position.y;
  } else {
    const sm = new SelectionManager();
    const ids = new Set(nodes.map((n) => n.id));
    const bounds = sm.getSelectionBounds(ids, sceneGraph);

    pixelWidth = Math.ceil(bounds.rect.width * multiplier);
    pixelHeight = Math.ceil(bounds.rect.height * multiplier);
    cx = bounds.rect.x + bounds.rect.width / 2;
    cy = bounds.rect.y + bounds.rect.height / 2;
  }

  // Step 2: Create offscreen WebGL canvas
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  const renderer = new WebGLRenderer({
    canvas,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  const shapeRenderer = new ShapeRenderer(renderer);
```

Artboard exports use the artboard's own dimensions — a 375×812 artboard produces a 375×812 PNG at 1x, or 750×1624 at 2x. Non-artboard exports compute bounds from the selection, which might be a single shape, a group, or multiple unrelated nodes.

### The preserveDrawingBuffer Flag

The `preserveDrawingBuffer: true` option is critical and easy to miss. By default, WebGL clears the drawing buffer after the browser composites the canvas into the page. This is a performance optimization — the GPU can discard the framebuffer contents once they've been copied to the display. But it means `canvas.toBlob()` called after rendering returns a transparent image, because the pixels have been discarded.

Setting `preserveDrawingBuffer: true` tells WebGL to keep the pixels in the drawing buffer after compositing. The performance cost is minimal for an offscreen canvas that's only rendered once. Without this flag, the export silently produces blank PNGs — no error, no warning, just a transparent image.

This is a context-creation option, not a runtime setting. You can't change it after the WebGL context is created. The editor's main canvas uses the default (`false`) because it renders every frame and never needs post-render pixel access. The export canvas uses `true` because its entire purpose is post-render pixel capture.

### The Orthographic Projection

The export canvas needs a view-projection matrix that maps the selected nodes' world-space bounds to the canvas's clip space. This is an orthographic projection — no perspective, no foreshortening, just a linear mapping from world coordinates to pixels:

```typescript
// Step 3: Build orthographic VP matrix
const halfW = isArtboard ? (nodes[0] as ArtboardNode).width / 2 : pixelWidth / multiplier / 2;
const halfH = isArtboard ? (nodes[0] as ArtboardNode).height / 2 : pixelHeight / multiplier / 2;

// Projection: maps [-halfW, halfW] × [-halfH, halfH] → [-1, 1]
const projection = mat3.create(1 / halfW, 0, 0, 1 / halfH, 0, 0);

// View: centers the camera on the export region
const view = mat3.create(1, 0, 0, 1, -cx, -cy);
const vpMatrix = mat3.multiply(projection, view);
```

The view matrix translates the world so the center of the export region lands at the origin. The projection matrix scales the world so the half-dimensions map to the [-1, 1] clip space range. This is the same math the editor's camera uses, just with fixed bounds instead of interactive zoom and pan.

### Rendering and Capture

With the projection set up, the export renders the scene and captures the result:

```typescript
  // Step 4: Clear to transparent
  const gl = renderer.context;
  gl.viewport(0, 0, pixelWidth, pixelHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Step 5: Handle artboard background toggle
  let savedFills: Fill[] | null = null;
  if (isArtboard && !includeBackground) {
    const artboard = nodes[0] as ArtboardNode;
    savedFills = artboard.fills;
    sceneGraph.updateNode(artboard.id, { fills: [] });
  }

  // Step 6: Render the full scene through the export viewport
  shapeRenderer.render(sceneGraph, vpMatrix);

  // Step 7: Restore artboard background
  if (savedFills !== null) {
    sceneGraph.updateNode(nodes[0].id, { fills: savedFills });
  }

  // Step 8: Capture and download
  const blob = await canvasToBlob(canvas, 'image/png');
  if (blob) {
    downloadBlob(blob, getExportFilename(nodes, 'png'));
  }

  // Step 9: Cleanup
  shapeRenderer.dispose();
  renderer.dispose();
}
```

The artboard background toggle uses a temporary mutation — clear the fills before rendering, restore them after. This is simpler than adding a "skip background" parameter to the entire rendering pipeline. The mutation is invisible to the user because it happens synchronously within one function call, before any React re-render.

The `shapeRenderer.render()` call uses the full rendering pipeline — the same code path as the main canvas. This means exports correctly handle groups, boolean operations, blend modes, visual effects, skinned meshes, and nested artboards. There's no separate "export renderer" that might fall out of sync with the main renderer.

### Filename Generation

Exported files need sensible names:

```typescript
export function getExportFilename(nodes: Node[], extension: string): string {
  if (nodes.length === 1) {
    const name = sanitizeFilename(nodes[0]?.name || 'untitled');
    return `${name}.${extension}`;
  }
  return `selection-${nodes.length}-items.${extension}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'untitled';
}
```

A single node uses the node's name — "Logo.png", "Icon.svg". Multiple nodes use a generic name — "selection-3-items.png". The sanitizer strips filesystem-illegal characters but preserves the rest, so a node named "Header / Main" becomes "Header \_ Main.png".

### The Download Helper

Browser downloads use the anchor-element trick:

```typescript
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

`URL.createObjectURL` creates a temporary URL pointing to the blob's memory. The `<a>` element with a `download` attribute triggers the browser's save dialog. `URL.revokeObjectURL` frees the memory. This pattern works in all modern browsers without any third-party download libraries.

## SVG Export as a One-Liner

With the SVG exporter producing a string, the export service wraps it in a blob and downloads:

```typescript
export function exportSelectionAsSvg(nodes: Node[], sceneGraph: SceneGraph): void {
  const svg = exportNodesToSvg(nodes, sceneGraph);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  downloadBlob(blob, getExportFilename(nodes, 'svg'));
}
```

No canvas, no WebGL, no async — just string to blob to download. The SVG exporter is synchronous because it doesn't need to render anything. It reads node data and writes markup. The contrast with PNG export is stark: PNG needs a full GPU pipeline and async blob capture. SVG needs `JSON.stringify`-level work.

## The Export Section UI

The export presets live in the Properties Panel. When a node is selected, the Export section shows its presets and lets the user add, configure, and trigger them.

### Adding and Removing Presets

Export presets are stored on the node itself, not in the editor store. This means they participate in undo/redo, copy/paste, and project serialization for free:

```typescript
const addExport = () => {
  const newSetting: ExportSetting = { format: 'png', multiplier: 1 };
  sceneGraph.updateNode(selectedId, {
    exports: [...exportSettings, newSetting],
  });
};

const removeExport = (index: number) => {
  const updated = exportSettings.filter((_, i) => i !== index);
  sceneGraph.updateNode(selectedId, {
    exports: updated.length > 0 ? updated : undefined,
  });
};
```

When the last preset is removed, the `exports` field is set to `undefined` rather than an empty array. This keeps the serialized JSON clean — nodes without export presets don't carry an empty `exports: []`.

### The Format Dropdown

The format and multiplier are combined into a single dropdown. PNG has four multiplier options; SVG has one:

```typescript
<select
  value={`${setting.format}${
    setting.format === 'png' ? ` ${setting.multiplier}x` : ''
  }`}
  onChange={(e) => {
    const val = e.target.value;
    if (val === 'svg') {
      updateExport(index, { format: 'svg', multiplier: 1 });
    } else {
      const mult = parseInt(val.split(' ')[1]!) as 1 | 2 | 3 | 4;
      updateExport(index, { format: 'png', multiplier: mult });
    }
  }}
>
  <option value="png 1x">PNG 1x</option>
  <option value="png 2x">PNG 2x</option>
  <option value="png 3x">PNG 3x</option>
  <option value="png 4x">PNG 4x</option>
  <option value="svg">SVG</option>
</select>
```

The combined dropdown is a UX choice. Separate dropdowns for format and multiplier would mean two clicks for the most common operation (changing from PNG 1x to PNG 2x). A single dropdown makes the most common presets — the ones people actually use — accessible with one click.

### Dimension Preview

Each preset shows the computed export dimensions:

```typescript
const boundsW = selectionBounds ? selectionBounds.rect.width : 0;
const boundsH = selectionBounds ? selectionBounds.rect.height : 0;
const displayW =
  setting.format === 'png' ? Math.ceil(boundsW * setting.multiplier) : Math.ceil(boundsW);
const displayH =
  setting.format === 'png' ? Math.ceil(boundsH * setting.multiplier) : Math.ceil(boundsH);
```

A 200×100 shape at PNG 2x shows "400 × 200". At SVG, it shows "200 × 100". The `Math.ceil` matches the rounding used in the actual export, so the preview is always exact.

### The Artboard Background Toggle

Artboards get an extra control — a checkbox for including the background fill:

```typescript
{node.type === 'artboard' && setting.format === 'png' && (
  <label>
    <input
      type="checkbox"
      checked={setting.includeBackground ?? true}
      onChange={(e) =>
        updateExport(index, {
          ...setting,
          includeBackground: e.target.checked,
        })
      }
    />
    Include background
  </label>
)}
```

The toggle only appears for artboards with PNG format. SVG doesn't need it — the background is a visible element in the SVG that the user can remove in any SVG editor. PNG is rasterized, so the choice must be made at export time.

### Triggering the Export

The export button iterates all presets and calls the appropriate export function for each:

```typescript
const handleExport = async () => {
  if (exportSettings.length === 0) return;
  setExporting(true);

  try {
    for (const setting of exportSettings) {
      if (setting.format === 'png') {
        await exportSelectionAsPng(
          nodes,
          sceneGraph,
          setting.multiplier,
          setting.includeBackground ?? true
        );
      } else {
        exportSelectionAsSvg(nodes, sceneGraph);
      }
    }
  } finally {
    setExporting(false);
  }
};
```

The `for` loop is sequential, not parallel. Each PNG export creates and destroys an offscreen WebGL canvas. Running them in parallel would create multiple WebGL contexts simultaneously, which some browsers limit. Sequential execution is slower but more reliable.

The `setExporting` flag disables the button during export to prevent double-clicks. The `finally` block ensures the flag is cleared even if an export fails.

## Testing the SVG Exporter

SVG export tests are pure: feed nodes in, check SVG strings out. No canvas, no WebGL, no DOM — just string assertions:

```typescript
describe('pathPointsToSvgD', () => {
  it('generates moveto and lineto for linear segments', () => {
    const points: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 50 }, handleIn: null, handleOut: null, type: 'corner' },
    ];

    const d = pathPointsToSvgD(points, true);
    expect(d).toBe('M0,0L100,0L100,50Z');
  });

  it('generates cubic bezier commands for curved segments', () => {
    const points: PathPoint[] = [
      {
        position: { x: 0, y: 0 },
        handleIn: null,
        handleOut: { x: 30, y: 0 },
        type: 'smooth',
      },
      {
        position: { x: 100, y: 100 },
        handleIn: { x: -30, y: 0 },
        handleOut: null,
        type: 'smooth',
      },
    ];

    const d = pathPointsToSvgD(points, false);
    expect(d).toBe('M0,0C30,0 70,100 100,100');
  });
});
```

Node conversion tests verify that each shape type produces correct SVG markup:

```typescript
describe('nodeToSvgElement', () => {
  it('converts rectangle with corner radius', () => {
    const node = createRectangleNode({
      width: 100, height: 50,
      cornerRadius: 8,
      fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } }],
    });

    const svg = nodeToSvgElement(node, sceneGraph, []);
    expect(svg).toContain('rx="8"');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('width="100"');
  });

  it('converts path with subpaths and fill rule', () => {
    const node = createPathNode({
      points: outerSquare,
      subpaths: [innerSquare],
      fillRule: 'evenodd',
    });

    const svg = nodeToSvgElement(node, sceneGraph, []);
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('emits gradient defs for gradient fills', () => {
    const defs: string[] = [];
    const node = createRectangleNode({
      fills: [{
        type: 'gradient',
        gradient: { type: 'linear', stops: [...], angle: 45 },
      }],
    });

    nodeToSvgElement(node, sceneGraph, defs);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toContain('linearGradient');
  });
});
```

The `defs` array is passed by reference. Tests can inspect it to verify that gradients produce `<defs>` entries without parsing the SVG string.

## Testing the Export Service

Export service tests focus on the non-rendering parts — filename generation and download mechanics:

```typescript
describe('getExportFilename', () => {
  it('uses node name for single node', () => {
    const nodes = [{ name: 'Logo', type: 'rectangle' }] as Node[];
    expect(getExportFilename(nodes, 'png')).toBe('Logo.png');
  });

  it('sanitizes filesystem-illegal characters', () => {
    const nodes = [{ name: 'Icon / Main', type: 'path' }] as Node[];
    expect(getExportFilename(nodes, 'svg')).toBe('Icon _ Main.svg');
  });

  it('generates generic name for multi-selection', () => {
    const nodes = [
      { name: 'A', type: 'rectangle' },
      { name: 'B', type: 'ellipse' },
    ] as Node[];
    expect(getExportFilename(nodes, 'png')).toBe('selection-2-items.png');
  });
});
```

The PNG rendering pipeline itself is difficult to unit test because it requires a real WebGL context. The tests verify everything around the pipeline — the inputs it receives and the outputs it produces — without testing the GPU rendering itself. End-to-end visual tests, if needed, would use a headless browser with WebGL support.

## Lessons

**Store export presets on nodes, not in a separate configuration.** By making `exports?: ExportSetting[]` a field on `BaseNode`, presets participate in undo/redo, copy/paste, and serialization automatically. The editor doesn't need a parallel data structure to track which nodes have which export settings. The preset travels with the node.

**A single Y-flip at the SVG root is safer than per-node coordinate conversion.** Flipping coordinates inside each node converter would mean every converter needs to negate Y, negate handle Y offsets, and swap minY/maxY — dozens of sign changes, each a potential bug. One `scale(1,-1)` transform on the root `<g>` handles everything, and the node converters work in the same coordinate system as the rest of the editor.

**`preserveDrawingBuffer` is a one-time context creation decision, not a runtime toggle.** The export canvas sets it to `true`; the main canvas leaves it at `false`. Getting this wrong produces blank exports with no error message — the most frustrating kind of bug. The lesson: always document WebGL context flags that can't be changed later, because "works on first render, fails on capture" is hard to diagnose.

**Use the full rendering pipeline for exports, never a simplified subset.** The export calls `shapeRenderer.render()` — the exact same function the main canvas uses. This means exports automatically support every feature: boolean groups, blend modes, drop shadows, skinned meshes, nested artboards. A separate "export renderer" would inevitably lag behind the main renderer, producing exports that don't match what the user sees on screen.

**Temporary mutation beats parameter threading for one-off rendering variations.** The artboard background toggle temporarily clears `fills`, renders, then restores. The alternative — adding an `includeBackground` parameter through the entire ShapeRenderer call chain — would touch dozens of functions for a feature used in exactly one place. The temporary mutation is three lines and zero API changes.

**Sequential export is more reliable than parallel for WebGL operations.** Browser limits on concurrent WebGL contexts mean parallel PNG exports can fail silently. Iterating presets with `for...of` and `await` ensures each export completes — including canvas creation and disposal — before the next begins.

## What We Built

This chapter covered selected element export — rendering individual nodes to downloadable PNG and SVG files:

- **`ExportSetting`** is a type with `format`, `multiplier`, and `includeBackground`, stored on any node via `BaseNode.exports?: ExportSetting[]`. Presets persist through undo/redo, serialization, and project save/load.
- **`exportNodesToSvg`** converts scene graph nodes to SVG markup with a single `scale(1,-1)` Y-flip at the root, `pathPointsToSvgD` for path data, gradient `<defs>` accumulation, and world-space bounds computation for the viewport.
- **`exportSelectionAsPng`** creates an offscreen WebGL canvas with `preserveDrawingBuffer: true`, builds an orthographic projection matrix, renders through the full `shapeRenderer.render()` pipeline, and captures the result via `canvas.toBlob()`.
- **Resolution multipliers** (1x through 4x) scale the export canvas dimensions while preserving the same world-space viewport, producing higher-resolution output for Retina displays and print.
- **Artboard export** uses the artboard's own dimensions as the viewport, with an `includeBackground` toggle that temporarily clears fills during rendering.
- **The Export Section UI** in the Properties Panel stores presets on nodes via `sceneGraph.updateNode`, combines format and multiplier into a single dropdown, shows computed pixel dimensions, and exports sequentially with a progress guard.
- **Filename generation** uses the node name for single-node exports and a generic pattern for multi-selection, with filesystem-illegal character sanitization.

The next chapter shifts to editor polish — the keyboard shortcuts system that makes every tool, menu command, and panel action accessible from the keyboard, with modifier key handling, focus management, and the Ctrl+Shift conflict resolution pattern.
