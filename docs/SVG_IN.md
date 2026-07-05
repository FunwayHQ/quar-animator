# SVG Import — Implementation Plan

## Overview

Import SVG files (string or file upload) into the Quar Animator scene graph, converting SVG elements to native node types with full fill, stroke, gradient, and transform support.

## Scope

### In Scope (P0)

- `<rect>`, `<ellipse>`, `<circle>`, `<polygon>`, `<polyline>`, `<line>`, `<path>`, `<g>`
- SVG `d` path commands: M, L, H, V, C, S, Q, T, A, Z (absolute + relative)
- `fill`, `stroke`, `stroke-width`, `opacity`, `fill-opacity`, `stroke-opacity`
- `transform` attribute (translate, rotate, scale, matrix, skew)
- `<linearGradient>`, `<radialGradient>` in `<defs>`
- `viewBox` and dimension parsing
- Nested `<g>` groups
- `style` attribute inline CSS parsing
- Stroke properties: `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`

### In Scope (P1)

- `<text>` / `<tspan>` basic text import
- `<use>` / `<symbol>` (clone referenced element)
- CSS `<style>` block class-based styling
- `clip-path` (basic rectangle clips)

### Out of Scope

- `<filter>`, `<mask>`, `<pattern>`, `<marker>`
- CSS animations / SMIL `<animate>`
- `<foreignObject>`, `<switch>`
- Embedded images (`<image>`)
- Font embedding / `@font-face`

---

## Architecture

```
SVG string
  │
  ▼
┌─────────────────┐
│  SVGParser       │  DOMParser → walk SVG DOM tree
│  (svgParser.ts)  │  Collect <defs> (gradients, symbols)
└────────┬────────┘
         │  SvgElement[]
         ▼
┌─────────────────┐
│  SVGConverter    │  Map SVG elements → Quar Node types
│  (svgConverter.ts)│  Resolve styles, transforms, gradients
└────────┬────────┘
         │  Node[]
         ▼
┌─────────────────┐
│  SVGImporter     │  Add nodes to SceneGraph
│  (svgImporter.ts)│  ID generation, parent wiring, selection
└─────────────────┘
```

### File Structure

```
packages/core/src/svg/
  svgParser.ts        — Parse SVG string → intermediate representation
  svgPathParser.ts    — Parse SVG path `d` attribute → PathPoint[]
  svgConverter.ts     — Convert parsed SVG → Quar Node types
  svgImporter.ts      — Orchestrator: parse → convert → add to scene graph
  svgUtils.ts         — Color parsing, transform parsing, unit conversion
  __tests__/
    svgParser.test.ts
    svgPathParser.test.ts
    svgConverter.test.ts
    svgImporter.test.ts
    svgUtils.test.ts
```

---

## Phase 1: SVG Path Parser (`svgPathParser.ts`)

The most complex piece. Converts SVG `d` attribute string to `PathPoint[]`.

### SVG Path Commands → PathPoint Mapping

| SVG Command                       | Description      | PathPoint Result                                                                                                        |
| --------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `M x,y`                           | Move to          | Sets current position (start of subpath)                                                                                |
| `L x,y`                           | Line to          | `{position: {x,y}, handleIn: null, handleOut: null, type: 'corner'}`                                                    |
| `H x`                             | Horizontal line  | `{position: {x, prevY}, handleIn: null, handleOut: null, type: 'corner'}`                                               |
| `V y`                             | Vertical line    | `{position: {prevX, y}, handleIn: null, handleOut: null, type: 'corner'}`                                               |
| `C x1,y1 x2,y2 x,y`               | Cubic bezier     | Previous point gets `handleOut = {x1-px, y1-py}`, new point `{position: {x,y}, handleIn: {x2-x, y2-y}, type: 'smooth'}` |
| `S x2,y2 x,y`                     | Smooth cubic     | Reflect previous handleOut → handleIn of prev, then like C                                                              |
| `Q x1,y1 x,y`                     | Quadratic bezier | Convert to cubic: `cp1 = prev + 2/3*(ctrl-prev)`, `cp2 = end + 2/3*(ctrl-end)`                                          |
| `T x,y`                           | Smooth quadratic | Reflect previous quadratic control point                                                                                |
| `A rx,ry rot large-arc sweep x,y` | Elliptical arc   | Decompose into cubic bezier segments (see Arc Conversion below)                                                         |
| `Z`                               | Close path       | Set `closed = true`, connect last → first point                                                                         |

### Key Design Decisions

**Handles are relative offsets** from their anchor position (not absolute):

```typescript
// SVG: C 150,50 250,50 300,100
// Previous point at (100, 100)
// New point at (300, 100)
previousPoint.handleOut = { x: 150 - 100, y: 50 - 100 }; // = {50, -50}
newPoint.handleIn = { x: 250 - 300, y: 50 - 100 }; // = {-50, -50}
```

**Subpaths**: SVG `d` can contain multiple `M` commands creating separate subpaths. Each subpath becomes a separate `PathNode`.

**Arc conversion**: SVG arcs (`A` command) have no direct PathPoint equivalent. Convert to cubic bezier approximation:

1. Convert endpoint parameterization → center parameterization
2. Split arc into segments ≤ 90° each
3. Approximate each segment with a cubic bezier using the standard formula:
   ```
   alpha = sin(dTheta) * (sqrt(4 + 3*tan(dTheta/2)^2) - 1) / 3
   ```

### Interface

```typescript
interface ParsedPath {
  points: PathPoint[];
  closed: boolean;
}

function parseSvgPath(d: string): ParsedPath[];
// Returns array because d can contain multiple subpaths (multiple M commands)
```

### Tokenizer

```typescript
function tokenizePath(d: string): PathToken[] {
  // Split into command letter + number sequences
  // Handle negative numbers (which act as separators)
  // Handle comma and whitespace separators
  // Handle implicit repeated commands (e.g., L 0,0 10,10 → two L commands)
}
```

---

## Phase 2: SVG Utilities (`svgUtils.ts`)

### Color Parsing

SVG colors can be: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, named colors (`red`, `blue`, etc.), `none`, `currentColor`.

```typescript
function parseSvgColor(value: string): Color | null;
// Returns null for 'none' / 'inherit' / 'currentColor'
// Color: { r: 0-255, g: 0-255, b: 0-255, a: 0-1 }
```

Named colors map (148 CSS named colors):

```typescript
const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  // ... all 148
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  // etc.
};
```

### Transform Parsing

SVG `transform` attribute → decomposed `Transform`:

```typescript
function parseSvgTransform(attr: string): Transform;
// Supports: translate(tx,ty), rotate(deg,cx,cy), scale(sx,sy),
//           matrix(a,b,c,d,e,f), skewX(deg), skewY(deg)
// Multiple transforms are composed left-to-right
```

Strategy:

1. Parse each transform function into a 3x3 matrix
2. Multiply all matrices together (left-to-right)
3. Decompose the final matrix into `{position, rotation, scale, skew}`

Matrix decomposition (QR-style):

```
Given matrix [a b tx; c d ty; 0 0 1]:
  scaleX = sqrt(a² + c²)
  scaleY = sqrt(b² + d²)
  rotation = atan2(c, a)  // in degrees
  skewX = atan2(a*b + c*d, a*d - b*c)
  position = {x: tx, y: ty}
```

Note: SVG transforms include the translation in the matrix. For Quar nodes, `position` is the transform center offset, and `anchor` is separate. The anchor defaults to `{x: 0.5, y: 0.5}` (center of bounds). The import must compute the correct `position` so that `anchor` can remain at center.

### Unit Conversion

```typescript
function parseSvgLength(value: string, reference?: number): number;
// Handles: px, pt, em, %, none (defaults to px)
// 'reference' used for percentage resolution
```

### Style Resolution

SVG style priority: `style` attribute > `class` CSS > presentation attributes.

```typescript
function resolveStyle(
  element: Element,
  stylesheets: Map<string, Record<string, string>>
): ResolvedStyle;

interface ResolvedStyle {
  fill: string | null;
  fillOpacity: number;
  stroke: string | null;
  strokeWidth: number;
  strokeOpacity: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  strokeLinejoin: 'miter' | 'round' | 'bevel';
  strokeMiterlimit: number;
  strokeDasharray: number[] | null;
  strokeDashoffset: number;
  opacity: number;
  display: string;
  visibility: string;
}
```

---

## Phase 3: SVG Parser (`svgParser.ts`)

Parse SVG string into an intermediate representation using DOMParser.

### Strategy

```typescript
function parseSvg(svgString: string): ParsedSvg;

interface ParsedSvg {
  viewBox: { x: number; y: number; width: number; height: number } | null;
  width: number;
  height: number;
  defs: SvgDefs;
  elements: SvgElement[];
}

interface SvgDefs {
  gradients: Map<string, ParsedGradient>;
  symbols: Map<string, SvgElement[]>;
  clipPaths: Map<string, SvgElement[]>;
}

interface ParsedGradient {
  type: 'linear' | 'radial';
  stops: { offset: number; color: Color }[];
  // Linear: x1, y1, x2, y2 (0-1 normalized or userSpaceOnUse)
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // Radial: cx, cy, r, fx, fy
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
  gradientUnits: 'objectBoundingBox' | 'userSpaceOnUse';
  gradientTransform?: string;
  spreadMethod: 'pad' | 'reflect' | 'repeat';
}

type SvgElement =
  | SvgRect
  | SvgEllipse
  | SvgCircle
  | SvgLine
  | SvgPolygon
  | SvgPolyline
  | SvgPath
  | SvgGroup
  | SvgText;

interface SvgElementBase {
  tag: string;
  id?: string;
  transform?: string;
  style: ResolvedStyle;
  classes: string[];
}

interface SvgRect extends SvgElementBase {
  tag: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
}
interface SvgEllipse extends SvgElementBase {
  tag: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
interface SvgCircle extends SvgElementBase {
  tag: 'circle';
  cx: number;
  cy: number;
  r: number;
}
interface SvgLine extends SvgElementBase {
  tag: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface SvgPolygon extends SvgElementBase {
  tag: 'polygon';
  points: Vector2[];
}
interface SvgPolyline extends SvgElementBase {
  tag: 'polyline';
  points: Vector2[];
}
interface SvgPath extends SvgElementBase {
  tag: 'path';
  d: string;
}
interface SvgGroup extends SvgElementBase {
  tag: 'g';
  children: SvgElement[];
}
interface SvgText extends SvgElementBase {
  tag: 'text';
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
}
```

### DOM Walking Algorithm

```
1. DOMParser.parseFromString(svgString, 'image/svg+xml')
2. Extract <svg> root: viewBox, width, height
3. First pass: collect all <defs> children
   - Parse <linearGradient>, <radialGradient> → defs.gradients
   - Parse <symbol> → defs.symbols
   - Resolve gradient href/xlink:href inheritance
4. Second pass: walk <svg> children (excluding <defs>)
   - For each element, resolve style (inline > class > attribute)
   - Skip display:none elements
   - Recurse into <g> children
   - Parse element-specific attributes
```

---

## Phase 4: SVG Converter (`svgConverter.ts`)

Convert parsed SVG elements to Quar node types.

```typescript
function convertSvgToNodes(parsed: ParsedSvg, generateId: () => string): Node[];
```

### Element → Node Mapping

| SVG Element  | Quar Node       | Conversion Notes                                 |
| ------------ | --------------- | ------------------------------------------------ |
| `<rect>`     | `RectangleNode` | `width`, `height`, `cornerRadius` from `rx`/`ry` |
| `<ellipse>`  | `EllipseNode`   | `radiusX = rx`, `radiusY = ry`                   |
| `<circle>`   | `EllipseNode`   | `radiusX = radiusY = r`                          |
| `<line>`     | `PathNode`      | 2-point open path                                |
| `<polyline>` | `PathNode`      | Corner points, `closed = false`                  |
| `<polygon>`  | `PathNode`      | Corner points, `closed = true`                   |
| `<path>`     | `PathNode`      | Via `parseSvgPath(d)`                            |
| `<g>`        | `GroupNode`     | Recursive children                               |
| `<text>`     | `TextNode` (P1) | Basic text content                               |

### Coordinate System Conversion

**SVG uses Y-down, Quar uses Y-up.** All Y coordinates must be flipped:

```typescript
function svgToWorld(x: number, y: number, viewBoxHeight: number): Vector2 {
  return { x, y: viewBoxHeight - y };
}
```

This applies to:

- All positions (rect x/y, circle cx/cy, path points, etc.)
- Transform translations
- Gradient coordinates
- Handle Y components (flip sign)

### Rectangle Conversion

```typescript
function convertRect(rect: SvgRect, ...): RectangleNode {
  // SVG rect: top-left origin + width/height
  // Quar rect: center position + anchor(0.5, 0.5) + width/height
  const centerX = rect.x + rect.width / 2;
  const centerY = viewBoxHeight - (rect.y + rect.height / 2); // Y-flip

  const transform = createDefaultTransform();
  transform.position = { x: centerX, y: centerY };

  // Corner radius: SVG rx/ry → uniform [rx, rx, rx, rx]
  // SVG allows different rx/ry per axis; Quar uses per-corner values
  const rx = rect.rx ?? rect.ry ?? 0;
  const ry = rect.ry ?? rect.rx ?? 0;
  const cr = Math.min(rx, ry); // Simplify to uniform for now

  return {
    id: generateId(),
    name: rect.id || 'Rectangle',
    type: 'rectangle',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: style.opacity,
    blendMode: 'normal',
    width: rect.width,
    height: rect.height,
    cornerRadius: [cr, cr, cr, cr],
    fills: convertFills(style, defs),
    strokes: convertStrokes(style, defs),
  };
}
```

### Ellipse/Circle Conversion

```typescript
function convertEllipse(el: SvgEllipse | SvgCircle, ...): EllipseNode {
  const rx = el.tag === 'circle' ? el.r : el.rx;
  const ry = el.tag === 'circle' ? el.r : el.ry;
  const cx = el.tag === 'circle' ? el.cx : el.cx;
  const cy = el.tag === 'circle' ? el.cy : el.cy;

  const transform = createDefaultTransform();
  transform.position = { x: cx, y: viewBoxHeight - cy }; // Y-flip

  return {
    id: generateId(),
    name: el.id || 'Ellipse',
    type: 'ellipse',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: style.opacity,
    blendMode: 'normal',
    radiusX: rx,
    radiusY: ry,
    fills: convertFills(style, defs),
    strokes: convertStrokes(style, defs),
  };
}
```

### Path Conversion

```typescript
function convertPath(path: SvgPath, ...): PathNode[] {
  const subpaths = parseSvgPath(path.d);
  // Each subpath → separate PathNode
  return subpaths.map(subpath => {
    // Flip Y for all points and handles
    const points = subpath.points.map(p => ({
      position: { x: p.position.x, y: viewBoxHeight - p.position.y },
      handleIn: p.handleIn ? { x: p.handleIn.x, y: -p.handleIn.y } : null,
      handleOut: p.handleOut ? { x: p.handleOut.x, y: -p.handleOut.y } : null,
      type: p.type,
    }));

    return {
      id: generateId(),
      name: path.id || 'Path',
      type: 'path',
      parent: null,
      children: [],
      transform: createDefaultTransform(), // anchor {0, 0} for paths
      visible: true,
      locked: false,
      opacity: style.opacity,
      blendMode: 'normal',
      points,
      closed: subpath.closed,
      fills: subpath.closed ? convertFills(style, defs) : [],
      strokes: convertStrokes(style, defs),
    };
  });
}
```

### Fill/Stroke Conversion

```typescript
function convertFills(style: ResolvedStyle, defs: SvgDefs): Fill[] {
  if (!style.fill || style.fill === 'none') return [];

  // Check for gradient reference: url(#gradientId)
  const gradientRef = parseUrlRef(style.fill);
  if (gradientRef) {
    const gradient = defs.gradients.get(gradientRef);
    if (gradient) {
      return [
        {
          type: 'gradient',
          gradient: convertGradient(gradient),
          opacity: style.fillOpacity,
          visible: true,
        },
      ];
    }
  }

  // Solid color
  const color = parseSvgColor(style.fill);
  if (!color) return [];

  return [
    {
      type: 'solid',
      color,
      opacity: style.fillOpacity,
      visible: true,
    },
  ];
}

function convertStrokes(style: ResolvedStyle, defs: SvgDefs): Stroke[] {
  if (!style.stroke || style.stroke === 'none' || style.strokeWidth <= 0) return [];

  const color = parseSvgColor(style.stroke) ?? { r: 0, g: 0, b: 0, a: 1 };

  return [
    {
      color,
      width: style.strokeWidth,
      opacity: style.strokeOpacity,
      cap: style.strokeLinecap,
      join: style.strokeLinejoin,
      miterLimit: style.strokeMiterlimit,
      dashArray: style.strokeDasharray ?? undefined,
      dashOffset: style.strokeDashoffset || undefined,
      visible: true,
      align: 'center',
    },
  ];
}
```

### Gradient Conversion

```typescript
function convertGradient(g: ParsedGradient): Gradient {
  const stops: GradientStop[] = g.stops.map((s) => ({
    offset: s.offset,
    color: s.color,
  }));

  if (g.type === 'linear') {
    // SVG linearGradient: x1,y1 → x2,y2 (default 0,0 → 1,0)
    // Quar gradient: start/end in normalized 0-1 coords
    return {
      type: 'linear',
      stops,
      start: { x: g.x1 ?? 0, y: g.y1 ?? 0 },
      end: { x: g.x2 ?? 1, y: g.y2 ?? 0 },
    };
  }

  // Radial
  return {
    type: 'radial',
    stops,
    center: { x: g.cx ?? 0.5, y: g.cy ?? 0.5 },
    radius: g.r ?? 0.5,
  };
}
```

### Transform Handling

When an SVG element has a `transform`, it's applied differently depending on the node type:

**Shapes (rect, ellipse, circle):**

1. Decompose SVG transform matrix → position, rotation, scale, skew
2. Merge with element's position (rect.x, circle.cx, etc.)
3. Set on the node's `transform` property

**Groups:**

1. Full decomposition → group node's `transform`
2. Children inherit parent transform automatically via scene graph

**Paths:**

1. For simple transforms (translate only), offset all point positions
2. For complex transforms (rotate, scale, skew), bake into the node's `transform`

---

## Phase 5: SVG Importer (`svgImporter.ts`)

Orchestrator that ties everything together.

```typescript
interface SvgImportOptions {
  /** Center imported content at world origin */
  centerAtOrigin?: boolean;
  /** Scale factor (default: 1) */
  scale?: number;
  /** Target position in world coords */
  position?: Vector2;
  /** Import into this parent group (null = root) */
  parentId?: string | null;
  /** Select imported nodes after import */
  selectAfterImport?: boolean;
}

interface SvgImportResult {
  nodes: Node[];
  rootIds: string[];
  warnings: string[];
}

function importSvg(
  svgString: string,
  sceneGraph: SceneGraph,
  generateId: () => string,
  options?: SvgImportOptions
): SvgImportResult;
```

### Import Flow

```
1. parseSvg(svgString) → ParsedSvg
2. convertSvgToNodes(parsed, generateId) → Node[]
3. If options.centerAtOrigin:
   - Compute bounding box of all nodes
   - Offset all positions so center = (0, 0) or options.position
4. If options.scale !== 1:
   - Scale all positions and dimensions
5. For each node:
   - sceneGraph.addNode(node, parentId)
6. Return { nodes, rootIds, warnings }
```

---

## Phase 6: UI Integration

### File Upload

Add to MenuBar or a dedicated import dialog:

```typescript
// In MenuBar.tsx or a new ImportDialog.tsx
function handleSvgImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,image/svg+xml';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const svgString = await file.text();
    const result = importSvg(svgString, sceneGraph, generateId, {
      centerAtOrigin: true,
      selectAfterImport: true,
    });
    if (result.warnings.length > 0) {
      toast.info(`Imported with ${result.warnings.length} warnings`);
    }
    setSelectedIds(result.rootIds);
  };
  input.click();
}
```

### Paste SVG

Detect SVG in clipboard paste (Ctrl+V):

```typescript
// In clipboard handler
function handlePaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain');
  if (text && text.trim().startsWith('<svg')) {
    e.preventDefault();
    importSvg(text, sceneGraph, generateId, { centerAtOrigin: true });
  }
}
```

### Keyboard Shortcut

- `Ctrl+I` or `Ctrl+Shift+I` → Open SVG import file dialog

---

## Implementation Order

| Step | Files                      | Estimated Tests | Description                                             |
| ---- | -------------------------- | --------------- | ------------------------------------------------------- |
| 1    | `svgUtils.ts` + tests      | ~40             | Color parsing, transform parsing, unit conversion       |
| 2    | `svgPathParser.ts` + tests | ~60             | SVG `d` tokenizer + command parser → PathPoint[]        |
| 3    | `svgParser.ts` + tests     | ~30             | DOMParser wrapper, defs collection, element parsing     |
| 4    | `svgConverter.ts` + tests  | ~40             | SVG elements → Quar nodes, Y-flip, fill/stroke/gradient |
| 5    | `svgImporter.ts` + tests   | ~15             | Orchestrator, scene graph wiring, options               |
| 6    | UI integration             | ~10             | MenuBar item, file upload, clipboard paste              |

**Total estimated: ~195 new tests**

---

## Edge Cases & Gotchas

### Y-Axis Flip

SVG is Y-down, Quar is Y-up. Every Y coordinate and every handle Y component must be negated. Gradients in `objectBoundingBox` space must also flip.

### SVG `viewBox` Scaling

If SVG has `viewBox="0 0 100 100"` but `width="200" height="200"`, all coordinates are in viewBox space (100x100). The import should use viewBox dimensions for coordinate conversion and apply the width/height ratio as a scale factor if desired.

### Implicit SVG Defaults

- `fill` defaults to `black` (not `none`)
- `stroke` defaults to `none`
- `stroke-width` defaults to `1`
- `opacity` defaults to `1`
- `fill-opacity` and `stroke-opacity` default to `1`

### Path d Implicit Commands

- After `M`, subsequent coordinate pairs are treated as implicit `L` commands
- After `m`, subsequent pairs are implicit `l` (relative)
- Numbers can run together: `M0,0L10-20` is valid (negative sign is separator)

### Arc to Bezier Approximation

SVG arc (`A` command) needs decomposition to cubic bezier segments. Standard algorithm:

1. Convert endpoint → center parameterization
2. Split arc span into ≤90° chunks
3. Each chunk → cubic bezier using:
   ```
   t = tan(dTheta / 4)
   alpha = sin(dTheta) * (sqrt(4 + 3*t*t) - 1) / 3
   ```

### Gradient `gradientUnits`

- `objectBoundingBox` (default): coordinates 0-1 relative to shape bounds
- `userSpaceOnUse`: absolute coordinates in SVG space → need to normalize to shape bounds

### Multiple Fill/Stroke

SVG elements have exactly one fill and one stroke. The Quar model supports arrays. Import creates single-element arrays: `fills: [fill]`, `strokes: [stroke]`.

### Group Transform Composition

SVG group transforms compound with children. Quar's scene graph handles this automatically via `getWorldTransform()`. Import should preserve the SVG hierarchy as-is: group transform on the GroupNode, child transforms on child nodes.

### Named Colors

Must support all 148 CSS named colors. Use a lookup table.

### Percentage Values in Gradients

`<stop offset="50%">` → `0.5`. Colors like `rgb(100%, 0%, 0%)` → `{r: 255, g: 0, b: 0}`.

---

## Test Strategy

### Unit Tests per Module

**svgUtils.test.ts** (~40 tests):

- Color parsing: hex3, hex6, hex8, rgb(), rgba(), hsl(), hsla(), named, none
- Transform parsing: translate, rotate, scale, matrix, skewX, skewY, combined
- Unit parsing: px, pt, em, %
- Style resolution priority

**svgPathParser.test.ts** (~60 tests):

- Each command: M, L, H, V, C, S, Q, T, A, Z (absolute + relative)
- Implicit commands after M
- Multiple subpaths
- Arc decomposition accuracy
- Edge cases: empty d, single point, degenerate curves

**svgConverter.test.ts** (~40 tests):

- Each element type → correct node type
- Y-axis flip correctness
- Fill/stroke/gradient conversion
- Transform decomposition
- Nested groups
- viewBox scaling

**svgImporter.test.ts** (~15 tests):

- Full SVG → scene graph pipeline
- Center at origin
- Scale factor
- Parent group import
- Warning collection

### Integration Tests

Test with real-world SVGs:

- Simple icon (rect + circle + path)
- Logo with gradients
- Complex illustration with nested groups
- Path-heavy design (icon set)
- SVG with transforms at every level

---

## Future Enhancements

- **Smart shape detection**: Detect when a `<path>` is actually a rectangle/ellipse/polygon and create the corresponding native node type
- **SVG optimization**: Remove redundant groups, merge identical fills/strokes
- **Incremental import**: Import specific layers/groups from complex SVGs
- **SVG Export**: Reverse the pipeline (Quar nodes → SVG string)
- **Drag-and-drop**: Drop .svg files onto the canvas
