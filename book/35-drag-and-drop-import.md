# Drag-and-Drop Import

## Files Become Shapes

A graphic editor that can't import anything is a closed system. You can draw rectangles and circles, but the moment you need a logo from Illustrator, an icon from a design system, or a photograph for a mockup, you hit a wall. Import breaks that wall. And drag-and-drop is the most natural import gesture — grab a file from the desktop, drop it onto the canvas, and it appears where you released it.

This chapter builds the drag-and-drop import system and the SVG import pipeline that powers it. Dropping an SVG file routes through a full vector pipeline: parse the SVG DOM, convert elements to scene graph nodes, flip the Y axis, center paths at their AABB midpoints, and handle compound paths with holes. Dropping a raster image (PNG, JPG) takes a simpler path: read the file as a data URI, load it into an `Image` element to get its natural dimensions, and create an `ImageNode` at the drop position. Both paths support undo — a single Ctrl+Z removes everything that was just imported.

## The dragOver Handler

Before a drop can happen, the browser needs to know the canvas accepts drops. The `dragover` event handler does two things: prevent the browser's default behavior (which would navigate to the dropped file), and set the drop effect to `copy`:

```typescript
const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}, []);
```

Without `e.preventDefault()`, the browser treats the canvas as a non-drop-target and shows a "no drop" cursor. The `dropEffect = 'copy'` changes the cursor to a "+" icon, signaling that dropping will import the file rather than move it. The handler is wired to the canvas container:

```typescript
<div
  className={styles.canvasContainer}
  onDragOver={handleDragOver}
  onDrop={handleDrop}
>
```

## The Drop Handler: MIME Type Detection

The drop handler is the routing layer. It inspects the dropped file's MIME type and dispatches to either the vector import pipeline or the raster import path:

```typescript
const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  const camera = cameraRef.current;
  const sg = sceneGraphRef.current;
  if (!camera || !sg) return;

  const files = Array.from(e.dataTransfer.files);
  const imageFile = files.find((f) => f.type.startsWith('image/'));
  if (!imageFile) return;

  const MAX_SIZE = 10 * 1024 * 1024;
  if (imageFile.size > MAX_SIZE) return;

  // Convert drop screen position to world coordinates
  const canvas = canvasRef.current;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const screenPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
  const worldPos = camera.screenToWorld(screenPos);

  const isSvg = imageFile.type === 'image/svg+xml' || imageFile.name.endsWith('.svg');

  if (isSvg) {
    // Vector import path
    importSvgFromFile(imageFile, sg, worldPos);
  } else {
    // Raster import path
    importRasterFromFile(imageFile, sg, worldPos);
  }
}, []);
```

Three details matter here:

**File filtering**: `files.find(f => f.type.startsWith('image/'))` accepts any image MIME type — `image/svg+xml`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`. Non-image files (PDFs, text files, ZIP archives) are silently ignored. The handler processes only the first matching image file, even if multiple files are dropped.

**Size guard**: The 10 MB limit prevents the browser from choking on enormous images. Reading a 50 MB PNG into a data URI would allocate ~67 MB of base64 string (33% overhead), potentially crashing the tab. The guard applies to both SVG and raster files.

**SVG detection**: The MIME type `image/svg+xml` catches most SVG files. The `.svg` extension fallback handles cases where the operating system doesn't set the correct MIME type — a common issue on Windows, where SVG files sometimes report `application/octet-stream`.

**Drop position**: The cursor position (`e.clientX`, `e.clientY`) is converted from browser viewport coordinates to canvas-local coordinates (subtracting the canvas element's bounding rect), then from screen space to world space via `camera.screenToWorld`. The imported content appears exactly where the user released the mouse — not at the canvas center, not at the origin, but at the drop point. This spatial precision is what makes drag-and-drop feel direct.

## The SVG Import Path

When the dropped file is SVG, the handler reads it as text and feeds it to the `importSvg` pipeline:

```typescript
const reader = new FileReader();
reader.onload = () => {
  const svgString = reader.result as string;
  let idCounter = Date.now();
  const generateId = () => `node_${idCounter++}`;
  try {
    useEditorStore.getState().pushUndo(sg);
    const result = importSvg(svgString, sg, generateId, {
      centerAtOrigin: false,
      position: worldPos,
    });
    if (result.rootIds.length > 1) {
      const groupId = generateId();
      const group = createGroupNode(groupId, 'Imported SVG');
      sg.addNode(group);
      for (const rootId of result.rootIds) {
        sg.moveNode(rootId, groupId);
      }
      useEditorStore.setState({ selectedNodeIds: new Set([groupId]) });
    } else if (result.rootIds.length === 1) {
      useEditorStore.setState({ selectedNodeIds: new Set(result.rootIds) });
    }
  } catch {
    // Invalid SVG — silently ignore
  }
};
reader.readAsText(imageFile);
```

`FileReader.readAsText` reads the file as a UTF-8 string. This is the right choice for SVG — it's XML text, not binary data. The `onload` callback fires asynchronously after the read completes.

The `generateId` function creates sequential IDs based on `Date.now()`. Each imported node gets a unique ID: `node_1708234567890`, `node_1708234567891`, `node_1708234567892`. The counter increments per call, guaranteeing uniqueness within a single import operation.

The `importSvg` function returns a result with `rootIds` — the IDs of the top-level imported nodes. When an SVG contains multiple root elements (e.g., three `<rect>` elements at the top level), they're wrapped in a group named "Imported SVG". This keeps the import as a single selectable unit. When there's only one root element, it's selected directly without wrapping.

The `centerAtOrigin: false` option tells the importer not to move the content to the world origin. Instead, `position: worldPos` places it at the drop point. The SVG's own coordinate system is preserved relative to that position.

The `pushUndo` call before the import creates an undo snapshot. A single Ctrl+Z after importing removes all the imported nodes, regardless of how many elements the SVG contained.

## The Raster Import Path

Raster images (PNG, JPG, GIF, WebP) take a different route. They can't be parsed into vector shapes — they're pixel grids. The handler reads the file as a data URI and creates an `ImageNode`:

```typescript
const reader = new FileReader();
reader.onload = () => {
  const dataUri = reader.result as string;
  const img = new Image();
  img.onload = () => {
    const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const imageNode = {
      id: nodeId,
      name: imageFile.name.replace(/\.[^.]+$/, ''),
      type: 'image' as const,
      parent: null,
      children: [],
      transform: {
        position: { x: worldPos.x, y: worldPos.y },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      src: dataUri,
      width: img.naturalWidth,
      height: img.naturalHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
    };

    useEditorStore.getState().pushUndo(sg);
    sg.addNode(imageNode);
    useEditorStore.setState({ selectedNodeIds: new Set([nodeId]) });
  };
  img.src = dataUri;
};
reader.readAsDataURL(imageFile);
```

The two-step asynchronous process is important:

1. **FileReader.readAsDataURL** converts the binary file to a base64 data URI string (`data:image/png;base64,...`). This is the format the `ImageNode` stores in its `src` field, and it's what the WebGL texture loader expects.

2. **Image element loading**: Setting `img.src = dataUri` triggers the browser's image decoder. The `onload` callback fires when decoding is complete, and `img.naturalWidth` / `img.naturalHeight` provide the true pixel dimensions. We need these to set the node's `width` and `height` correctly — without decoding the image, we'd have to guess or hardcode dimensions.

The node's `name` comes from the filename with the extension stripped: `photo.png` becomes `photo`, `icon-logo.svg` becomes `icon-logo`. The regex `/\.[^.]+$/` matches the last dot and everything after it. This gives the Layer Panel a readable name instead of a full filename with extension.

The `anchor: { x: 0.5, y: 0.5 }` centers the image at the drop position. Without this, the image's top-left corner would land at the drop point, making placement feel imprecise — the user expects the image to appear centered under the cursor.

## The SVG Import Pipeline

The `importSvg` function orchestrates a four-stage pipeline that transforms an SVG string into scene graph nodes.

### Stage 1: Parse SVG DOM

```typescript
export function parseSvg(svgString: string): ParsedSvg {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    return {
      elements: [],
      viewBox: null,
      width: 0,
      height: 0,
      defs: { gradients: {} },
      warnings: ['Invalid SVG: parse error'],
    };
  }
  // ...
}
```

`DOMParser` with `'image/svg+xml'` parses the string into a DOM tree. The `<parsererror>` check catches malformed XML — if present, the function returns an empty result with a warning instead of throwing.

The parser walks the SVG DOM recursively, converting each element into a typed intermediate representation: `SvgRect`, `SvgEllipse`, `SvgCircle`, `SvgPath`, `SvgPolygon`, `SvgPolyline`, `SvgLine`, `SvgGroup`. It skips non-visual elements (`<defs>`, `<metadata>`, `<title>`, `<style>`, `<clipPath>`, `<mask>`) and invisible elements (`display: none`).

Gradient definitions are collected separately. A `collectDefs` pass extracts all `<linearGradient>` and `<radialGradient>` elements, and `resolveGradientInheritance` follows `href`/`xlink:href` chains to inherit stops and coordinates from parent gradient definitions.

### Stage 2: Parse the `d` Attribute

SVG path data is its own mini-language. The `parseSvgPath` function tokenizes and interprets it:

```typescript
export function parseSvgPath(d: string): ParsedSubpath[] {
  const tokens = tokenize(d);
  const subpaths: ParsedSubpath[] = [];
  let current: ParsedSubpath = { points: [], closed: false };
  // ...
}
```

Each command type produces different `PathPoint` structures:

- **M/m** (moveto): Starts a new subpath. If a subpath was already in progress, it's pushed to the result.
- **L/l, H/h, V/v** (lineto): Creates corner points with no Bezier handles.
- **C/c** (cubic Bezier): Sets `handleOut` on the previous point and `handleIn` on the new point. This is the core curve command — most SVG editors export paths as sequences of cubic Beziers.
- **S/s** (smooth cubic): Reflects the previous control point to create a smooth continuation. The reflected handle is computed as `2 * currentPoint - previousHandleOut`.
- **Q/q** (quadratic Bezier): Promoted to cubic via the standard formula: `cp1 = start + 2/3 * (ctrl - start)`, `cp2 = end + 2/3 * (ctrl - end)`. The editor works exclusively with cubic Beziers, so quadratics are upgraded on import.
- **A/a** (arc): Converted to 1-4 cubic Bezier segments via center parameterization. Arcs are split into segments of 90 degrees or less, each approximated by a cubic curve. This is the most complex conversion — SVG arcs use endpoint parameterization (rx, ry, rotation, large-arc, sweep), but Bezier approximation requires center parameterization (center, start angle, end angle).
- **Z/z** (close): Marks the subpath as closed. If the last point coincides with the first (within a 0.01 tolerance), the last point is removed and its `handleIn` is transferred to the first point, creating a clean loop without duplicate vertices.

Implicit command repetition is handled: after an `M` command, subsequent coordinate pairs are treated as `L` (lineto). After any other command, repeating coordinates repeat the same command. This matches the SVG specification's implicit repeat rules.

### Stage 3: Convert to Scene Graph Nodes

The converter transforms the parsed intermediate representation into Quar node types:

```typescript
export function convertSvgToNodes(parsed: ParsedSvg, generateId: () => string): ConvertedNode[] {
  const viewBoxHeight = parsed.viewBox ? parsed.viewBox.height : parsed.height;
  // ...
}
```

Each SVG element maps to a specific node type:

- `<rect>` becomes a `RectangleNode` with `width`, `height`, and optional `cornerRadius` from `rx`/`ry`.
- `<ellipse>` and `<circle>` become `EllipseNode` with `radiusX` and `radiusY`.
- `<line>` becomes a two-point open `PathNode` with no fills.
- `<polygon>` becomes a closed `PathNode` with fills and strokes.
- `<polyline>` becomes an open `PathNode` with strokes only.
- `<path>` becomes one or more `PathNode`s, depending on subpath count.
- `<g>` becomes a `GroupNode` with children wired via `parent`/`children` references.

### The Y-Axis Flip

SVG uses a Y-down coordinate system (positive Y points downward). The editor uses Y-up (positive Y points upward). Every Y coordinate must be flipped during import:

```typescript
const centerY = viewBoxHeight - (svgRect.y + svgRect.height / 2);
```

For rectangles and ellipses, the center Y coordinate is flipped relative to the viewBox height. For paths, every point position and every Bezier handle Y component is negated:

```typescript
// Point positions
point.y = viewBoxHeight - point.y;
// Bezier handles
if (point.handleIn) point.handleIn.y = -point.handleIn.y;
if (point.handleOut) point.handleOut.y = -point.handleOut.y;
```

Handle Y coordinates are negated (not flipped relative to viewBox height) because handles are relative to their point position, not absolute. Negating the Y component mirrors the curve direction around the point, which is the correct transformation when the Y axis is inverted.

### Path Centering

After Y-flipping, all path-type nodes have their points centered at their AABB (axis-aligned bounding box) midpoint. The AABB center becomes the node's `transform.position`, and all point coordinates are offset to be relative to that center:

```typescript
const bounds = computePointsBounds(points);
const center = {
  x: (bounds.minX + bounds.maxX) / 2,
  y: (bounds.minY + bounds.maxY) / 2,
};

for (const point of points) {
  point.x -= center.x;
  point.y -= center.y;
}

node.transform.position = center;
node.transform.anchor = { x: 0.5, y: 0.5 };
```

This centering step ensures that rotation pivots around the visual center of the path, not around the SVG origin. Without it, a star shape imported from SVG would rotate around the top-left corner of the SVG canvas — visually wrong, even though mathematically correct in SVG's coordinate system.

### Compound Paths

An SVG `<path>` element can contain multiple closed subpaths — for example, the letter "O" has an outer ring and an inner ring that creates the hole. The converter handles this by splitting subpaths:

```typescript
if (closedSubpaths.length > 1) {
  node.points = closedSubpaths[0].points;
  node.subpaths = closedSubpaths.slice(1).map((sp) => sp.points);
  node.fillRule = svgFillRule || 'evenodd';
}
```

The first closed subpath becomes the node's `points` array. Additional subpaths are stored in the `subpaths` array. The `fillRule` (typically `'evenodd'`) tells the renderer how to determine which regions are inside the shape — with even-odd filling, overlapping regions alternate between filled and unfilled, creating holes where inner paths overlap outer paths.

### Stage 4: Add to Scene Graph

The importer adds nodes to the scene graph in dependency order — parents before children:

```typescript
function addNodeRecursive(node: ConvertedNode, sceneGraph: SceneGraph) {
  sceneGraph.addNode(node);
  for (const child of node.children) {
    addNodeRecursive(child, sceneGraph);
  }
}
```

If a `position` option is provided, root-level node positions are offset to place the imported content at the target location. If `centerAtOrigin` is true, the content's bounding box center is computed and subtracted from all root positions, centering the import at the world origin. If `scale` is provided, root node dimensions and positions are scaled proportionally.

The function returns an `SvgImportResult`:

```typescript
export interface SvgImportResult {
  nodes: Node[]; // all imported nodes (flat array)
  rootIds: string[]; // IDs of root-level nodes
  warnings: string[]; // non-fatal issues (unsupported features, parse errors)
}
```

The `warnings` array collects non-fatal issues: unsupported SVG features (filters, clip paths, masks), gradient references that couldn't be resolved, or empty groups. The caller can display these as toasts or log them silently.

## Three Import Paths, Same Pipeline

The SVG import pipeline is used by three different entry points, each with different positioning behavior:

**Drag-and-drop** places content at the drop position. `centerAtOrigin: false` preserves the SVG's internal layout, and `position: worldPos` translates root nodes to where the user released the mouse. This feels the most direct — you drop a file and it appears under the cursor.

```typescript
const result = importSvg(svgString, sg, generateId, {
  centerAtOrigin: false,
  position: worldPos,
});
```

**Clipboard paste** places content at the viewport center. `getCanvasCenter()` converts the screen midpoint to world coordinates, so the imported content appears in the middle of the user's current view:

```typescript
const worldCenter = getCanvasCenter();
const result = importSvg(svgString, sg, generateId, {
  centerAtOrigin: false,
  position: worldCenter,
});
```

**File menu import** places content at the world origin. `centerAtOrigin: true` computes the content's bounding box and translates it so the center lands at `(0, 0)`:

```typescript
const result = importSvg(svgString, sg, generateId, {
  centerAtOrigin: true,
});
```

All three paths share the same `importSvg` function, the same parser, the same converter, and the same node construction logic. The only differences are positioning options and error reporting — drag-and-drop silently ignores errors, while the menu import shows toast notifications for success, failure, and warnings.

All three paths also share the multi-root wrapping logic: when the SVG contains multiple top-level elements, they're gathered into a group named "Imported SVG". This ensures the import behaves as a single unit for selection, transformation, and undo.

## Fill and Stroke Conversion

The SVG import pipeline preserves visual appearance by converting fills and strokes:

```typescript
// Solid color fill
const fillColor = parseSvgColor(style.fill);
if (fillColor) {
  node.fills = [{ type: 'solid', color: fillColor, visible: true }];
}

// Gradient fill via url(#id) reference
const gradientRef = parseUrlRef(style.fill);
if (gradientRef && defs.gradients[gradientRef]) {
  const gradient = convertGradient(defs.gradients[gradientRef]);
  node.fills = [{ type: gradient.type, gradient, visible: true }];
}
```

The `parseSvgColor` utility handles the full spectrum of CSS color formats: hex shorthand (`#rgb`), hex full (`#rrggbb`), hex with alpha (`#rrggbbaa`), `rgb()`, `rgba()`, `hsl()`, `hsla()`, all 148 named CSS colors, and the special value `transparent`. It returns `null` for `none`, `inherit`, and `currentColor`, which the converter interprets as "no fill".

Gradient references (`url(#gradientId)`) are resolved from the collected `<defs>`. Linear gradients map to `{ type: 'linear', start, end, stops }`. Radial gradients map to `{ type: 'radial', center, radius, stops }`. Gradient inheritance chains (where one gradient references another via `href`) are resolved before conversion, so each gradient has complete stop and coordinate data.

Strokes carry more properties:

```typescript
node.strokes = [
  {
    color: strokeColor,
    width: parseFloat(style.strokeWidth) || 1,
    opacity: parseFloat(style.strokeOpacity) ?? 1,
    visible: true,
    cap: style.strokeLinecap || 'butt',
    join: style.strokeLinejoin || 'miter',
    miterLimit: parseFloat(style.strokeMiterLimit) || 4,
    dashArray: parseDashArray(style.strokeDasharray),
    dashOffset: parseFloat(style.strokeDashoffset) || 0,
    align: 'center',
  },
];
```

Stroke alignment is always `'center'` — SVG doesn't support inside or outside stroke alignment. Dash arrays are parsed from the comma-separated string format that SVG uses.

## Style Resolution

SVG styles can come from three sources: inline `style` attributes, presentation attributes (like `fill="red"`), and inherited parent styles. The `resolveStyle` function merges all three:

```typescript
export function resolveStyle(element: Element, parentStyle?: ResolvedStyle): ResolvedStyle {
  const style: ResolvedStyle = { ...parentStyle };

  // Presentation attributes (lower priority)
  for (const attr of INHERITABLE_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) style[attr] = value;
  }

  // Inline style (higher priority)
  const inlineStyle = element.getAttribute('style');
  if (inlineStyle) {
    for (const declaration of inlineStyle.split(';')) {
      const [prop, val] = declaration.split(':').map((s) => s.trim());
      if (prop && val) style[prop] = val;
    }
  }

  return style;
}
```

Inheritance flows from parent to child. A `<g fill="blue">` sets the fill for all descendants unless they override it. The `parentStyle` parameter carries inherited values down the tree. Inline styles take priority over presentation attributes, which take priority over inherited values — matching CSS specificity rules.

## Transform Parsing

SVG transform attributes can contain multiple transform functions:

```typescript
<g transform="translate(100, 50) rotate(45) scale(2)">
```

The `parseSvgTransform` function parses and composes them:

```typescript
export function parseSvgTransform(attr: string): {
  position: Vector2;
  rotation: number;
  scale: Vector2;
  skew: Vector2;
} {
  const matrix = parseSvgTransformToMatrix(attr);
  return decomposeMatrix(matrix);
}
```

Transform functions are composed left-to-right as 2D affine matrices. The composed matrix is then decomposed into separate position, rotation, scale, and skew values that the scene graph node can store. The decomposition extracts:

- **Position**: the translation components `(tx, ty)`
- **Rotation**: `atan2(b, a)` from the matrix elements
- **Scale**: the length of the matrix column vectors
- **Skew**: the angle between the column vectors

This decomposition is lossy for some transform combinations (e.g., non-uniform scale followed by rotation doesn't decompose cleanly), but it handles the vast majority of real-world SVG transforms correctly.

## Undo Support

Every import path calls `pushUndo` before adding nodes to the scene graph:

```typescript
useEditorStore.getState().pushUndo(sg);
const result = importSvg(svgString, sg, generateId, { ... });
```

This creates a single undo snapshot that captures the scene graph state before the import. Pressing Ctrl+Z after importing a complex SVG with dozens of elements removes all of them in one step — the scene graph reverts to the pre-import snapshot. The user doesn't need to undo each imported element individually.

For raster imports, the `pushUndo` call is placed inside the `img.onload` callback, right before `sg.addNode`:

```typescript
img.onload = () => {
  useEditorStore.getState().pushUndo(sg);
  sg.addNode(imageNode);
};
```

This placement ensures the undo snapshot isn't created if the image fails to load. A failed load (corrupted file, unsupported format) leaves the undo stack untouched — no phantom undo entry for an import that never completed.

## Testing the Import Pipeline

The SVG importer has dedicated tests covering the full pipeline:

```typescript
describe('importSvg', () => {
  it('imports a simple SVG rect', () => {
    const sg = new SceneGraph();
    const result = importSvg(
      '<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>',
      sg,
      createIdGenerator()
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].type).toBe('rectangle');
    expect(result.rootIds).toHaveLength(1);
  });

  it('centers at origin by default', () => {
    const sg = new SceneGraph();
    const result = importSvg(
      '<svg viewBox="0 0 100 100"><rect x="50" y="25" width="50" height="50"/></svg>',
      sg,
      createIdGenerator()
    );
    // centerAtOrigin: true (default) places content at (0,0)
    const node = result.nodes[0];
    expect(Math.abs(node.transform.position.x)).toBeLessThan(1);
    expect(Math.abs(node.transform.position.y)).toBeLessThan(1);
  });

  it('places at target position', () => {
    const sg = new SceneGraph();
    const result = importSvg(
      '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>',
      sg,
      createIdGenerator(),
      { position: { x: 300, y: 200 }, centerAtOrigin: false }
    );
    expect(result.nodes[0].transform.position.x).toBeCloseTo(300, 0);
    expect(result.nodes[0].transform.position.y).toBeCloseTo(200, 0);
  });

  it('handles groups with children', () => {
    const sg = new SceneGraph();
    const result = importSvg(
      '<svg viewBox="0 0 100 100"><g><rect width="50" height="50"/><circle cx="75" cy="75" r="10"/></g></svg>',
      sg,
      createIdGenerator()
    );
    expect(result.nodes).toHaveLength(3); // group + rect + circle
    expect(result.rootIds).toHaveLength(1); // only the group is root
  });

  it('returns warnings for invalid SVG', () => {
    const sg = new SceneGraph();
    const result = importSvg('<not-svg>', sg, createIdGenerator());
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.nodes).toHaveLength(0);
  });

  it('returns warning for empty SVG', () => {
    const sg = new SceneGraph();
    const result = importSvg('<svg viewBox="0 0 100 100"></svg>', sg, createIdGenerator());
    expect(result.warnings).toContain('SVG contains no visible elements');
  });
});
```

The converter tests verify each element type mapping:

```typescript
describe('convertSvgToNodes', () => {
  it('converts rect to RectangleNode with Y-flip', () => {
    const result = convertSvgToNodes(
      parseSvg('<svg viewBox="0 0 200 100"><rect x="10" y="20" width="80" height="40"/></svg>'),
      createIdGenerator()
    );
    const node = result[0];
    expect(node.type).toBe('rectangle');
    expect(node.width).toBe(80);
    expect(node.height).toBe(40);
    // Y-flipped center: 100 - (20 + 40/2) = 60
    expect(node.transform.position.y).toBeCloseTo(60);
  });

  it('converts path with multiple subpaths to compound path', () => {
    const result = convertSvgToNodes(
      parseSvg(
        '<svg viewBox="0 0 100 100"><path d="M0,0 L100,0 L100,100 L0,100 Z M25,25 L75,25 L75,75 L25,75 Z"/></svg>'
      ),
      createIdGenerator()
    );
    const node = result[0];
    expect(node.subpaths).toHaveLength(1); // second subpath stored here
    expect(node.fillRule).toBe('evenodd');
  });

  it('converts linear gradient fills', () => {
    const svg = `<svg viewBox="0 0 100 100">
      <defs><linearGradient id="g1">
        <stop offset="0%" stop-color="red"/>
        <stop offset="100%" stop-color="blue"/>
      </linearGradient></defs>
      <rect width="100" height="100" fill="url(#g1)"/>
    </svg>`;
    const result = convertSvgToNodes(parseSvg(svg), createIdGenerator());
    expect(result[0].fills[0].type).toBe('linear');
  });
});
```

The path parser tests cover each SVG command type, arc-to-cubic conversion, implicit command repetition, and the close-path deduplication logic.

## Lessons

**Route on MIME type, fallback on file extension.** `image/svg+xml` catches most SVG files, but the `.svg` extension fallback is necessary because operating systems don't always set the MIME type correctly. The pattern — check the MIME type first, then the extension — is reliable across all platforms. Apply the same principle to any file type detection: MIME type when available, extension when not.

**Read SVGs as text, raster images as data URIs.** SVG files are XML text that needs parsing. Raster images are binary data that needs base64 encoding for storage in the scene graph's `src` field. Using `readAsText` for SVG and `readAsDataURL` for raster images matches each format's nature. Reading an SVG as a data URI would work (the browser can render it), but you'd lose the ability to extract individual shapes.

**Always decode images before creating nodes.** The `Image` element's `onload` callback provides `naturalWidth` and `naturalHeight` — the true pixel dimensions. Without decoding, you'd have to read image headers manually (PNG has dimensions at byte offset 16, JPEG requires parsing SOF markers) or hard-code a default size. Letting the browser decode the image is simpler and handles all formats, including WebP and GIF.

**Center imported paths at their visual midpoint.** SVG paths use absolute coordinates in the SVG canvas. Importing these coordinates directly would place the path's rotation center at the SVG origin, not at the shape's visual center. The centering step — compute AABB center, subtract from all points, set position to center — ensures rotation, scaling, and anchor behavior work correctly in the editor's Y-up coordinate system.

**One undo snapshot per import, not per node.** Importing a complex SVG might create dozens of nodes. If each `addNode` call pushed an undo snapshot, the user would need to press Ctrl+Z dozens of times to reverse the import. A single `pushUndo` before the batch `addNode` calls creates one undo entry for the entire import — one Ctrl+Z removes everything.

**The same pipeline with different positioning options beats separate pipelines.** Drag-and-drop, clipboard paste, and file menu import all need the same SVG parsing, converting, and node creation logic. Only the positioning differs: drop point, canvas center, or world origin. Parameterizing position as an option to a shared `importSvg` function eliminates code duplication and ensures all three paths produce identical results for the same SVG input.

## What We Built

This chapter covered drag-and-drop import — the system that turns external files into scene graph nodes with a single gesture:

- **`handleDrop`** routes dropped files by MIME type: `image/svg+xml` (or `.svg` extension) to the vector import pipeline, and `image/png`, `image/jpeg`, and other raster types to the `ImageNode` creation path. A 10 MB size guard prevents browser memory issues.
- **SVG vector import** reads the file as text, feeds it to `importSvg` which runs a four-stage pipeline (DOM parse, path `d` attribute parse, element-to-node conversion with Y-flip and path centering, scene graph insertion), and wraps multiple root elements in an "Imported SVG" group.
- **Raster image import** reads the file as a data URI, decodes it via an `Image` element to get `naturalWidth`/`naturalHeight`, and creates an `ImageNode` at the drop position with anchor `(0.5, 0.5)` for centered placement.
- **The SVG pipeline** handles the full SVG path command set (M, L, C, S, Q, T, A, Z with implicit repetition), promotes quadratic beziers to cubic, converts arcs to cubic approximations, resolves gradient `url(#id)` references with inheritance chains, and produces compound paths with `fillRule: 'evenodd'` for shapes with holes.
- **Three import entry points** share the same `importSvg` function with different positioning: drag-and-drop places at the cursor's world position, clipboard paste places at the viewport center, and File menu import centers at the world origin.
- **Undo support** creates a single snapshot before the import, so one Ctrl+Z removes all imported nodes regardless of how many elements the SVG contained.
- **Drop position precision** converts browser viewport coordinates to canvas-local coordinates to world space via `camera.screenToWorld`, placing content exactly where the user released the mouse.

The next chapter shifts to lessons learned — the WebGL pitfalls we hit during development and the solutions that emerged. From state leaks and VAO cache desync to FBO scissor interactions and premultiplied alpha blending, every GPU bug taught a rule that prevented the next one.
