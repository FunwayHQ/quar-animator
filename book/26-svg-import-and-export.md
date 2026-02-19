# SVG Import & Export

## The Lingua Franca of Vector Graphics

A graphic editor that cannot exchange files with other tools is an island. No matter how capable the internal drawing engine, users need to bring artwork in from Illustrator, Figma, and Inkscape, and they need to get finished work out in a format the rest of the world understands. SVG — Scalable Vector Graphics — is the closest thing vector graphics has to a universal language. It is an XML format that every browser renders, every design tool exports, and every developer can inspect with a text editor. Supporting SVG import and export is not optional; it is the bridge between our editor and the rest of the ecosystem.

The challenge is that SVG and our internal representation disagree on almost everything. SVG uses a Y-down coordinate system; our world is Y-up. SVG positions rectangles by their top-left corner; we position them by their center. SVG arcs are parameterized by endpoint, radii, and flags; our paths are pure cubic Beziers. SVG compound paths are a single `<path>` element with multiple subcommands; we need explicit `subpaths[]` arrays with a `fillRule`. This chapter traces the three-stage import pipeline that reconciles these differences, the export pipeline that reverses them, and the clipboard and drag-and-drop pathways that let users paste vectors directly from other applications.

## The Three-Stage Import Pipeline

SVG import is split into three pure layers, each with a single responsibility:

```
svgParser → svgConverter → svgImporter
  (string → IR)   (IR → Nodes)   (Nodes → SceneGraph)
```

The parser turns an SVG string into an intermediate representation. The converter transforms that IR into Quar node types. The importer places the converted nodes into the scene graph with optional centering and scaling. No stage knows about the one before it except through a data contract — `ParsedSvg`, then `Node[]`, then `SvgImportResult`.

### Stage 1: Parsing SVG DOM

`parseSvg` uses the browser's `DOMParser` to turn an SVG string into a DOM tree, then walks the tree to produce a `ParsedSvg` object:

```typescript
export interface ParsedSvg {
  viewBox: { x: number; y: number; width: number; height: number } | null;
  width: number;
  height: number;
  defs: SvgDefs;
  elements: SvgElement[];
}
```

The parser extracts dimensions from `width`, `height`, and `viewBox` attributes, falls back to SVG defaults (300x150) when none are specified, and rejects documents where the root element is not `<svg>`. It then does two passes over the tree.

The first pass collects `<defs>` — currently just gradients. Linear and radial gradients are parsed into a `ParsedGradient` structure that preserves stop colors, offsets, coordinate attributes, and `gradientUnits`. Gradient inheritance via `href` (one gradient referencing another for its stops or coordinates) is resolved in a second pass after all gradients are collected:

```typescript
function resolveGradientInheritance(gradients: Map<string, ParsedGradient>): void {
  const visited = new Set<string>();
  for (const [id, gradient] of gradients) {
    const href = (gradient as any)._href;
    if (!href) continue;
    if (href === id || visited.has(id)) {
      delete (gradient as any)._href;
      continue;
    }
    visited.add(id);
    const parent = gradients.get(href);
    if (!parent) continue;
    if (gradient.stops.length === 0 && parent.stops.length > 0) {
      gradient.stops = [...parent.stops];
    }
    // Inherit coordinates if not set...
  }
}
```

The second pass walks child elements with `walkChildren`, dispatching each to a type-specific parser. The intermediate types form a discriminated union:

```typescript
export type SvgElement =
  | SvgRect
  | SvgEllipse
  | SvgCircle
  | SvgLine
  | SvgPolygon
  | SvgPolyline
  | SvgPath
  | SvgGroup;
```

Each element carries a `style: ResolvedStyle` object that merges presentation attributes (`fill`, `stroke`, `stroke-width`) with inherited parent styles. The style cascade follows CSS specificity: inline `style` attribute beats presentation attributes, and child values override parent values for non-inherited properties. Elements with `display: none` are skipped entirely. Non-visual elements — `<defs>`, `<metadata>`, `<title>`, `<clipPath>`, `<mask>` — are filtered out of the walk.

The parser is deliberately thin. It does not attempt to evaluate `<use>` references, CSS stylesheets, or `<animate>` elements. It captures what the converter needs — geometry, style, and structure — and nothing more.

### Stage 2: Converting to Quar Nodes

`convertSvgToNodes` takes the `ParsedSvg` and a `generateId` function, and returns a flat array of nodes plus a list of root IDs. A `ConvertContext` carries the ID generator, parsed defs, the viewBox height (needed for Y-flip), and an accumulator for all created nodes.

Each SVG element type maps to a Quar node type:

| SVG Element  | Quar Node       | Key Conversion                                   |
| ------------ | --------------- | ------------------------------------------------ |
| `<rect>`     | `RectangleNode` | Top-left → center position, rx/ry → cornerRadius |
| `<ellipse>`  | `EllipseNode`   | cx/cy center preserved, rx/ry → radiusX/Y        |
| `<circle>`   | `EllipseNode`   | r → radiusX = radiusY                            |
| `<line>`     | `PathNode`      | Two corner points, open path                     |
| `<polygon>`  | `PathNode`      | Point list → closed path                         |
| `<polyline>` | `PathNode`      | Point list → open path                           |
| `<path>`     | `PathNode` (1+) | d attribute parsed, compound paths merged        |
| `<g>`        | `GroupNode`     | Recursive children conversion                    |

The critical coordinate transformation happens in every converter: the Y-axis flip. SVG's Y increases downward; our world's Y increases upward. For shapes with a known center, the flip is straightforward:

```typescript
function buildTransform(
  centerX: number,
  centerY: number,
  svgTransformAttr: string | undefined,
  viewBoxHeight: number
): Transform {
  const transform = createDefaultTransform();
  if (svgTransformAttr) {
    const svgTransform = parseSvgTransform(svgTransformAttr);
    transform.position = {
      x: centerX + svgTransform.position.x,
      y: viewBoxHeight - (centerY + svgTransform.position.y),
    };
    transform.rotation = -svgTransform.rotation; // SVG clockwise → Quar counterclockwise
    transform.scale = svgTransform.scale;
  } else {
    transform.position = { x: centerX, y: viewBoxHeight - centerY };
  }
  return transform;
}
```

The `viewBoxHeight - y` formula flips the Y coordinate. SVG rotation is clockwise; Quar rotation is counterclockwise, so the sign is negated.

For rectangles, the center is computed from the SVG top-left position:

```typescript
function convertRect(el: SvgRect, ctx: ConvertContext): RectangleNode {
  const centerX = el.x + el.width / 2;
  const centerY = el.y + el.height / 2;
  const transform = buildTransform(centerX, centerY, el.transform, ctx.viewBoxHeight);
  const rx = el.rx ?? el.ry ?? 0;
  const ry = el.ry ?? el.rx ?? 0;
  const cr = Math.min(rx, ry, el.width / 2, el.height / 2);
  // ... create RectangleNode with width, height, cornerRadius: [cr, cr, cr, cr]
}
```

The `rx ?? ry` fallback follows the SVG spec: if only `rx` is specified, `ry` defaults to the same value and vice versa.

Fill and stroke conversion resolves both solid colors and gradient references. `convertFills` checks for a `url(#id)` reference in the fill attribute, looks up the gradient in the defs map, and converts it to a Quar `Gradient` with stops, start/end points, or center/radius. Solid colors are parsed through `parseSvgColor`, which handles hex, `rgb()`, `rgba()`, and named color keywords.

### Centering Paths with Anchor (0.5, 0.5)

Paths, polygons, polylines, and lines all undergo a centering step after Y-flip. The goal is to place the node's transform position at the AABB center of its geometry, with the anchor at (0.5, 0.5) — the same pattern used by the PenTool and BrushTool when creating paths interactively:

```typescript
function centerPathPoints(points: PathPoint[]): {
  centeredPoints: PathPoint[];
  center: Vector2;
} {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    if (p.position.y < minY) minY = p.position.y;
    if (p.position.y > maxY) maxY = p.position.y;
  }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const centeredPoints = points.map((p) => ({
    ...p,
    position: { x: p.position.x - center.x, y: p.position.y - center.y },
  }));
  return { centeredPoints, center };
}
```

The positions are shifted so the AABB center becomes the origin. Handle vectors are relative offsets, so they do not change. The computed center becomes the node's `transform.position`, and the anchor is set to (0.5, 0.5). This ensures that rotation and scaling pivot around the visual center of the path, matching user expectations for every path regardless of whether it was drawn by hand or imported from SVG.

## Parsing the SVG Path `d` Attribute

The `<path>` element's `d` attribute is by far the most complex part of SVG import. It is a mini-language of move, line, curve, and arc commands that can describe any shape — from a simple rectangle to the intricate curves of a font glyph. Our parser converts `d` strings into arrays of `ParsedSubpath`, each containing `PathPoint[]` and a `closed` flag.

### Tokenization

The tokenizer splits the `d` string into command-argument pairs using a regex that matches either a command letter or a numeric value:

```typescript
const commandRegex = /([MmZzLlHhVvCcSsQqTtAa])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
```

Each command has a known argument count — M takes 2, C takes 6, A takes 7, Z takes 0. When enough arguments accumulate, the tokenizer flushes a token and begins the next. A subtle SVG rule governs implicit repetition: after an `M` (moveto), subsequent coordinate pairs are treated as `L` (lineto) commands. After any other command, subsequent groups repeat the same command. This is what allows `M0,0 10,10 20,0` to draw two line segments rather than three disconnected move commands.

### Command Processing

The main parser loop maintains state: the current position (`currentX`, `currentY`), the subpath start (for `Z` closepath), and the last control point (for smooth continuations). Each command handles both absolute and relative variants — lowercase letters are relative to the current position:

```typescript
case 'L': {
  const x = isRelative ? currentX + args[0]! : args[0]!;
  const y = isRelative ? currentY + args[1]! : args[1]!;
  addCornerPoint(x, y);
  currentX = x;
  currentY = y;
  break;
}
```

Cubic Bezier curves (`C`) map directly to our data model. The first control point becomes `handleOut` on the previous point (relative to that point's position), and the second control point becomes `handleIn` on the new point:

```typescript
case 'C': {
  // ... resolve absolute coordinates
  if (currentPoints.length > 0) {
    const prev = currentPoints[currentPoints.length - 1]!;
    prev.handleOut = { x: x1 - currentX, y: y1 - currentY };
    if (prev.type === 'corner') prev.type = 'smooth';
  }
  currentPoints.push({
    position: { x, y },
    handleIn: { x: x2 - x, y: y2 - y },
    handleOut: null,
    type: 'smooth',
  });
}
```

### Quadratic-to-Cubic Promotion

SVG supports quadratic Bezier curves (`Q`), but our PathPoint model only stores cubic handles. The conversion uses the standard 2/3 formula — a quadratic curve with control point `q` is equivalent to a cubic with control points at `start + 2/3*(q - start)` and `end + 2/3*(q - end)`:

```typescript
case 'Q': {
  const qx = isRelative ? currentX + args[0]! : args[0]!;
  const qy = isRelative ? currentY + args[1]! : args[1]!;
  const x = isRelative ? currentX + args[2]! : args[2]!;
  const y = isRelative ? currentY + args[3]! : args[3]!;
  const cp1x = currentX + (2 / 3) * (qx - currentX);
  const cp1y = currentY + (2 / 3) * (qy - currentY);
  const cp2x = x + (2 / 3) * (qx - x);
  const cp2y = y + (2 / 3) * (qy - y);
  // ... store as cubic handles
}
```

The smooth variants (`S` for cubic, `T` for quadratic) reflect the previous control point across the current position. The parser tracks `lastCommand` to know whether reflection applies — if the previous command was not the matching curve type, the reflected control point collapses to the current position.

### Arc-to-Cubic Conversion

SVG arcs are the hardest command to handle. An arc is defined by an endpoint (`x, y`), radii (`rx, ry`), an X-axis rotation, and two flags (`large-arc` and `sweep`) that choose among the four possible arcs connecting two points on an ellipse. Our path model has no arc primitive, so every arc must be approximated with cubic Bezier curves.

The conversion follows the SVG spec's center parameterization algorithm:

1. **Compute the transformed midpoint** between start and end, accounting for the X-axis rotation.
2. **Correct out-of-range radii** — if the radii are too small to connect the endpoints, scale them up by `sqrt(lambda)`.
3. **Find the ellipse center** using the corrected radii, with the sign determined by comparing the `large-arc` and `sweep` flags.
4. **Compute start and sweep angles** in the ellipse's rotated coordinate system.
5. **Split into segments of at most 90 degrees**, each approximated by a cubic Bezier using the tangent-based `alpha = (4/3) * tan(segAngle / 4)` formula.

```typescript
function arcToCubicBeziers(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number
): { handleOut: Vector2; point: Vector2; handleIn: Vector2 }[] {
  if (rx === 0 || ry === 0) {
    return [{ handleOut: { x: 0, y: 0 }, point: { x: x2, y: y2 }, handleIn: { x: 0, y: 0 } }];
  }
  // ... center parameterization, radius correction, angle computation
  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const segAngle = dTheta / segments;
  const alpha = (4 / 3) * Math.tan(segAngle / 4);
  // ... generate cubic control points per segment
}
```

The degenerate case where `rx` or `ry` is zero produces a straight line — the function returns a single point with zero handles. The 90-degree segment limit ensures that each cubic approximation stays within machine-epsilon of the true elliptical arc. A full circle produces four segments, a semicircle produces two.

### Closepath and Subpath Management

The `Z` command closes the current subpath. When the last point coincides with the first (within a 0.01 tolerance), the parser merges them — transferring the last point's `handleIn` to the first point and popping the duplicate. This prevents the double-vertex artifact where a closed path has two points at exactly the same position, which would create a degenerate zero-length segment that confuses tessellation.

Each `M` command starts a new subpath. The final open subpath (no `Z` encountered) is flushed at the end of parsing. Multiple subpaths from a single `<path>` element trigger the compound path handling described next.

## Compound Paths and `fillRule`

When a `<path>` element contains multiple closed subpaths — such as the letter "O" with its outer contour and inner hole — the converter merges them into a single `PathNode` with a `subpaths` array:

```typescript
function convertPath(el: SvgPath, ctx: ConvertContext): PathNode[] {
  const parsedSubpaths = parseSvgPath(el.d);
  // ... Y-flip all subpaths
  const closedSubpaths = flippedSubpaths.filter((sp) => sp.closed);
  if (closedSubpaths.length > 1) {
    return [convertCompoundPath(el, closedSubpaths, flippedSubpaths, ctx, el.fillRule)];
  }
  // ... simple path handling
}
```

`convertCompoundPath` gathers all subpath points for a shared AABB center, then centers each contour relative to that center. The first closed contour becomes the node's `points`, and the remaining contours go into `subpaths[]`. The `fillRule` is preserved from the SVG element — `evenodd` for standard hole detection, `nonzero` as the SVG default:

```typescript
function convertCompoundPath(/* ... */): PathNode {
  const allPoints = allSubpaths.flatMap((sp) => sp.points);
  const { center } = centerPathPoints(allPoints);
  const centeredContours = closedSubpaths.map((sp) =>
    sp.points.map((p) => ({
      ...p,
      position: { x: p.position.x - center.x, y: p.position.y - center.y },
    }))
  );
  const primaryContour = centeredContours[0];
  const additionalContours = centeredContours.slice(1);
  // ... build PathNode with points, subpaths, fillRule
}
```

This structure feeds directly into the multi-contour rendering pipeline described in earlier chapters — `groupContoursByContainment` determines which contours are holes, and earcut tessellates each outer-plus-holes group independently.

### Stage 3: The Importer Orchestrator

`importSvg` is the entry point that ties the pipeline together. It calls `parseSvg`, then `convertSvgToNodes`, then applies optional transformations (centering, scaling, positioning), and finally adds nodes to the scene graph in dependency order:

```typescript
export function importSvg(
  svgString: string,
  sceneGraph: SceneGraph,
  generateId: () => string,
  options: SvgImportOptions = {}
): SvgImportResult {
  const { centerAtOrigin = true, scale = 1, position, parentId = null } = options;
  // Step 1: Parse SVG
  let parsed = parseSvg(svgString);
  // Step 2: Convert to Quar nodes
  const { nodes, rootIds } = convertSvgToNodes(parsed, generateId);
  // Step 3: Compute bounds and apply transformations
  // ... offset root nodes to target position, scale dimensions
  // Step 4: Add to scene graph in dependency order
  for (const rootId of rootIds) addNode(rootId);
  return { nodes, rootIds, warnings };
}
```

The dependency-order insertion is important for groups: a parent group must exist in the scene graph before its children can be added. The `addNode` helper recursively adds parents first, then adds each node with the correct scene graph parent. The `SvgImportOptions` allow callers to place imported content at a specific world position (for drag-and-drop), scale it uniformly, or nest it under an existing parent group.

Scaling applies to both positions and dimensions — path point positions and handles are multiplied by the scale factor, as are rectangle width/height and ellipse radii. Position scaling combines with the centering offset so that the entire import is placed at the target position at the target size in a single pass.

## SVG Export

The export pipeline reverses the import process. `exportNodesToSvg` takes an array of nodes and a scene graph, computes the combined world bounds, and generates an SVG string with all coordinates in Y-down space.

The Y-flip is handled at the SVG root level with a single `<g>` transform:

```typescript
export function exportNodesToSvg(nodes: Node[], sceneGraph: SceneGraph): string {
  const bounds = computeExportBounds(nodes, sceneGraph);
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX;
  const height = maxY - minY;
  const defs: string[] = [];
  const elements: string[] = [];
  for (const node of nodes) {
    if (!node.visible) continue;
    elements.push(nodeToSvgElement(node, sceneGraph, defs));
  }
  const flipTransform = `transform="scale(1,-1) translate(${-minX},${-maxY})"`;
  return `<svg xmlns="..." viewBox="0 0 ${width} ${height}">
    ${defsBlock}
    <g ${flipTransform}>${elements.join('')}</g>
  </svg>`;
}
```

The `scale(1,-1)` mirrors the Y axis. The `translate(-minX, -maxY)` shifts the content so the top-left corner of the bounding box maps to SVG coordinate (0, 0). Because the Y-flip happens at the root `<g>`, individual node converters emit coordinates in our native Y-up space without any transformation — positions, handles, and dimensions are written as-is.

### Node-to-SVG Element Conversion

`nodeToSvgElement` dispatches by node type, mirroring the import converter in reverse. Each converter computes anchor-aware offsets and emits the appropriate SVG element:

```typescript
function rectangleToSvg(node: RectangleNode, defs: string[]): string {
  const anchorX = node.transform.anchor.x * node.width;
  const anchorY = node.transform.anchor.y * node.height;
  // Per-corner radius? Use <path> with arc commands.
  // Uniform radius? Use <rect rx="..." ry="...">.
  return `<rect x="${-anchorX}" y="${-anchorY}" width="${node.width}" height="${node.height}" .../>`;
}
```

Per-corner radius rectangles cannot use SVG's `<rect>` element, which only supports uniform `rx`/`ry`. The exporter generates a `<path>` with arc commands for each rounded corner instead.

`pathPointsToSvgD` converts a `PathPoint[]` array back to an SVG `d` string. It uses `forEachSegment` (the same utility used by the tessellator) to iterate over consecutive point pairs and `getAbsoluteControlPoints` to resolve relative handles into absolute positions. If both control points coincide with their respective endpoints, the segment is linear and emits an `L` command; otherwise it emits a `C` command:

```typescript
export function pathPointsToSvgD(points: PathPoint[], closed: boolean): string {
  const parts: string[] = [];
  parts.push(`M${fmt(p0.position.x)},${fmt(p0.position.y)}`);
  forEachSegment(points, closed, (from, to) => {
    const { cp1, cp2 } = getAbsoluteControlPoints(from, to);
    const isLinear =
      cp1.x === from.position.x &&
      cp1.y === from.position.y &&
      cp2.x === to.position.x &&
      cp2.y === to.position.y;
    if (isLinear) parts.push(`L${fmt(to.position.x)},${fmt(to.position.y)}`);
    else parts.push(`C${fmt(cp1.x)},${fmt(cp1.y)} ${fmt(cp2.x)},${fmt(cp2.y)} ...`);
  });
  if (closed) parts.push('Z');
  return parts.join('');
}
```

Compound paths concatenate each subpath's `d` string with a space separator, and the `fill-rule="evenodd"` attribute is emitted when the node's `fillRule` is set.

Fill and stroke attributes are generated by `fillToSvgAttrs` and `strokeToSvgAttrs`, which handle solid colors, opacity, and gradient references. Gradients are emitted as `<defs>` elements with auto-incremented IDs (`grad_1`, `grad_2`, etc.) and referenced via `url(#grad_1)`. The defs array is accumulated across all node conversions and injected into the SVG's `<defs>` block at the end.

Groups recurse into their children, emitting `<g>` elements with transform and opacity attributes. Non-visual nodes (bones, IK targets) produce empty strings and are silently excluded from the output.

## Drag-and-Drop Import

The Canvas component handles file drops through React's `onDrop` event. The handler distinguishes SVG files from raster images by checking both the MIME type and the file extension:

```typescript
const isSvg = imageFile.type === 'image/svg+xml' || imageFile.name.endsWith('.svg');
```

SVG files are read as text via `FileReader.readAsText`, then passed to `importSvg` with the drop position as the target:

```typescript
if (isSvg) {
  const reader = new FileReader();
  reader.onload = () => {
    const svgString = reader.result as string;
    useEditorStore.getState().pushUndo(sg);
    const result = importSvg(svgString, sg, generateId, {
      centerAtOrigin: false,
      position: worldPos,
    });
    if (result.rootIds.length > 1) {
      // Wrap multiple roots in a group
    }
    store.setSelectedNodeIds(result.rootIds);
  };
  reader.readAsText(imageFile);
}
```

The `centerAtOrigin: false` option combined with an explicit `position` places the imported SVG centered at the drop location in world space. If the SVG produces multiple root nodes, they are wrapped in a group so the user can manipulate them as a unit. An undo snapshot is pushed before the import so the entire operation can be reversed with Ctrl+Z. Raster images (PNG, JPG) take a different path — they are read as data URIs and inserted as `ImageNode` objects.

## External Clipboard Paste

Clipboard interoperability is more complex than drag-and-drop because the clipboard contents can arrive in several different MIME types depending on the source application.

The paste handler implements a three-tier strategy. The first tier uses the modern Clipboard API (`navigator.clipboard.readText()`) to look for SVG markup in the plain text clipboard:

```typescript
const text = await navigator.clipboard.readText();
if (text) {
  const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgMatch) {
    importSvgString(svgMatch[0]);
    return true;
  }
}
```

The second tier handles `text/html` clipboard data, which is how Figma and Illustrator embed vectors when the user copies from their canvas. The HTML may contain an inline `<svg>` element wrapped in HTML markup:

```typescript
const items = await navigator.clipboard.read();
for (const item of items) {
  if (item.types.includes('text/html')) {
    const htmlBlob = await item.getType('text/html');
    const html = await htmlBlob.text();
    const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      importSvgString(svgMatch[0]);
      return true;
    }
  }
}
```

The third tier handles raster images in the clipboard — screenshots, copied pixels — by extracting `image/*` blobs and creating `ImageNode` objects.

A native `paste` event listener runs in parallel as a fallback. The browser's native paste event provides `ClipboardData` with direct access to all MIME types without the permissions prompt that the Clipboard API requires. The handler checks for text items that might contain SVG and image items for raster data:

```typescript
const handlePaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  // ... look for text/plain or text/html with SVG regex match
  // ... look for image/* items
  // ... fall back to internal clipboard paste
};
```

The dual strategy — Clipboard API for proactive paste and native event for passive — ensures that SVG paste works regardless of browser permissions state. When both fire (the keydown handler triggers the Clipboard API attempt, and the native paste event arrives moments later), a `pasteHandledRef` flag prevents double-import.

## Lessons

**A three-stage pipeline isolates concerns cleanly.** The parser knows about XML but not about Quar nodes. The converter knows about geometry transforms but not about scene graphs. The importer knows about scene graphs but not about SVG syntax. This separation makes each stage independently testable and allows future format support (DXF, AI) to plug in at the converter level without touching the importer.

**Y-flip is cheaper at the boundary than scattered through the code.** The import converter applies `viewBoxHeight - y` exactly once per coordinate during conversion. The export wraps all content in a single `<g scale(1,-1)>`. If the flip happened per-node or per-render-call, it would be easy to miss a case and produce inverted shapes. Doing it once, at the format boundary, is both simpler and more reliable.

**SVG arcs are a dead end for internal representation.** The arc command is compact for authors but terrible for computation — finding the arc center from the endpoint parameterization involves correcting out-of-range radii, choosing among four candidate arcs via two boolean flags, and splitting into segments for cubic approximation. Converting arcs to cubics at import time means the rest of the codebase never deals with arcs at all. The 90-degree segment limit keeps the approximation error well below a pixel at any practical scale.

**Compound paths need explicit structure.** SVG's `<path>` element encodes holes implicitly through `fill-rule` and winding direction. Our `subpaths[]` array makes the structure explicit — the renderer can see exactly which contours exist and use `groupContoursByContainment` to determine nesting. This is more work at import time but avoids ambiguity at render time.

**Clipboard formats are a minefield of MIME types.** Plain text might contain SVG (from a text editor or terminal). HTML might contain SVG (from Figma). Image blobs might be raster screenshots. Each source application has its own conventions, and the clipboard API's availability varies by browser and permissions state. The defensive approach — try multiple tiers, fall back gracefully, prevent double-import — handles the diversity of real-world clipboard behavior.

## What We Built

This chapter covered SVG import and export — the bridge between our internal node model and the universal vector graphics format:

- **`parseSvg`** uses `DOMParser` to convert an SVG string into a `ParsedSvg` intermediate representation containing viewBox dimensions, gradient defs with `href` inheritance resolution, and a discriminated union of typed element structures.
- **`parseSvgPath`** tokenizes the SVG `d` attribute into command-argument pairs, handles all 10 command types (M, L, H, V, C, S, Q, T, A, Z) in both absolute and relative variants, promotes quadratic curves to cubics via the 2/3 formula, and converts arcs to cubic Bezier segments through center parameterization.
- **`convertSvgToNodes`** transforms parsed elements into Quar node types with Y-axis flip (`viewBoxHeight - y`), center-based positioning, anchor (0.5, 0.5) centering for all path-like nodes, and fill/stroke/gradient conversion.
- **Compound paths** with multiple closed subpaths become a single `PathNode` with `subpaths[]` and `fillRule`, feeding directly into the multi-contour rendering pipeline for correct hole detection.
- **`importSvg`** orchestrates the three-stage pipeline, computes bounds for optional centering and scaling, and inserts nodes into the scene graph in dependency order (parents before children).
- **`exportNodesToSvg`** reverses the process with a root `<g scale(1,-1) translate(...)>` Y-flip, dispatches per node type, and collects gradient defs into a shared `<defs>` block. Per-corner radius rectangles fall back to `<path>` with arc commands.
- **Drag-and-drop** detects SVG files by MIME type or `.svg` extension, reads them as text, and imports at the drop position in world coordinates.
- **Clipboard paste** uses a three-tier strategy — Clipboard API text, Clipboard API `text/html`, and native `ClipboardEvent` — to extract SVG from any source application, with a fallback to raster image import and internal clipboard paste.

The next chapter shifts from exchanging data with external tools to organizing data within the editor itself — multi-page projects, where each page maintains its own scene graph, timeline, and undo stack, and switching between them means serializing and deserializing entire editor states on the fly.
