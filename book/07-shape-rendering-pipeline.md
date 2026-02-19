# Shape Rendering Pipeline

## From Vectors to Triangles

The previous chapter gave us a `WebGLRenderer` that can compile shaders, manage buffers, and draw arrays of triangles. But we have no triangles to draw. Our scene graph stores shapes as high-level descriptions — a rectangle has a position, width, height, and corner radius; a path has Bezier control points; an ellipse has two radii. The GPU doesn't understand any of that. It understands triangles.

This chapter builds the bridge: a `ShapeRenderer` that converts vector shapes into GPU-ready geometry and draws them with fills, strokes, and gradients. By the end, every shape type in the editor will render at 60fps with proper transforms, multiple fill and stroke layers, and three gradient types.

The pipeline has five stages:

```
PathPoint[]  →  tessellate  →  Float32Array  →  earcut  →  GPU draw
   shape         to lines       flat vertices   triangulate   triangles
definition                                       (fills)
                                    ↓
                        generateStrokeOutline  →  TRIANGLE_STRIP
                           miter bisectors         (strokes)
```

Every shape in the editor — rectangle, ellipse, polygon, star, path, text glyph — goes through this pipeline. The only difference is how it enters: primitives generate their path points from parameters, while paths already have them.

## Shape Paths: The Common Currency

Before we can tessellate anything, every shape type needs to produce a list of `PathPoint` objects — the universal representation of a Bezier outline:

```typescript
interface PathPoint {
  position: Vector2;
  handleIn: Vector2 | null; // relative to position
  handleOut: Vector2 | null; // relative to position
  type: 'corner' | 'smooth' | 'symmetric';
  cornerRadius?: number;
}
```

A corner point has no handles and connects to its neighbors with straight lines. A smooth point has handles that are collinear (they lie on the same line through the point). A symmetric point has handles that are collinear and equal in length.

The `handleIn` and `handleOut` vectors are _relative_ to `position`. This means moving a point moves its handles with it — the natural behavior when dragging path vertices.

### Rectangles

A plain rectangle is four corner points. A rounded rectangle expands each corner into two smooth points connected by a circular arc approximation:

```typescript
export function createRectanglePath(
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: [number, number, number, number]
): PathPoint[] {
  const points: PathPoint[] = [];
  const [tl, tr, br, bl] = cornerRadius;

  // Handle length that makes a cubic Bezier best approximate a quarter-circle
  const BEZIER_CIRCLE_KAPPA = 0.5522847498;

  // Top-left corner
  if (tl > 0) {
    points.push({
      position: { x, y: y + tl },
      handleIn: null,
      handleOut: { x: 0, y: -tl * BEZIER_CIRCLE_KAPPA },
      type: 'smooth',
    });
    points.push({
      position: { x: x + tl, y },
      handleIn: { x: -tl * BEZIER_CIRCLE_KAPPA, y: 0 },
      handleOut: null,
      type: 'smooth',
    });
  } else {
    points.push(createCornerPoint({ x, y }));
  }

  // ... top-right, bottom-right, bottom-left follow same pattern
}
```

That magic number `0.5522847498` — named `BEZIER_CIRCLE_KAPPA` in the actual codebase — is the handle length that makes a cubic Bezier curve best approximate a quarter-circle. We extract it as a named constant to avoid scattering an unexplained magic number across every function that draws arcs. It's derived from the condition that the midpoint of the Bezier and the midpoint of the arc should coincide. You'll see it in every vector graphics library.

### Ellipses

An ellipse is four symmetric points — top, right, bottom, left — with kappa-scaled handles:

```typescript
export function createEllipsePath(cx: number, cy: number, rx: number, ry: number): PathPoint[] {
  const BEZIER_CIRCLE_KAPPA = 0.5522847498;
  return [
    {
      position: { x: cx, y: cy - ry },
      handleIn: { x: -rx * BEZIER_CIRCLE_KAPPA, y: 0 },
      handleOut: { x: rx * BEZIER_CIRCLE_KAPPA, y: 0 },
      type: 'symmetric',
    },
    {
      position: { x: cx + rx, y: cy },
      handleIn: { x: 0, y: -ry * BEZIER_CIRCLE_KAPPA },
      handleOut: { x: 0, y: ry * BEZIER_CIRCLE_KAPPA },
      type: 'symmetric',
    },
    // ... bottom and left
  ];
}
```

Four cubic Bezier segments with kappa handles produce an ellipse approximation that's indistinguishable from a true ellipse at screen resolution. The maximum deviation is about 0.027% of the radius — far below a pixel at any reasonable zoom level.

### Polygons and Stars

Regular polygons are even simpler — N points equally spaced around a circle:

```typescript
export function createPolygonPath(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  innerRadius?: number
): PathPoint[] {
  const points: PathPoint[] = [];
  const step = (2 * Math.PI) / sides;
  const startAngle = Math.PI / 2; // First vertex at top

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + i * step;
    points.push(
      createCornerPoint({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      })
    );

    // Star: insert inner vertex between outer vertices
    if (innerRadius !== undefined) {
      const midAngle = angle + step / 2;
      points.push(
        createCornerPoint({
          x: cx + innerRadius * Math.cos(midAngle),
          y: cy + innerRadius * Math.sin(midAngle),
        })
      );
    }
  }

  return points;
}
```

The `startAngle = Math.PI / 2` puts the first vertex at the top of the polygon (positive Y in our Y-up coordinate system), which looks right visually — a triangle points up, a pentagon has a flat bottom edge.

### Per-Vertex Corner Radius

Any corner point can have a `cornerRadius` that rounds it into a smooth arc. This is applied as a preprocessing step before tessellation:

```typescript
export function applyCornerRadius(points: PathPoint[]): PathPoint[] {
  const result: PathPoint[] = [];
  const BEZIER_CIRCLE_KAPPA = 0.5522847498;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const r = pt.cornerRadius;

    if (!r || r <= 0 || pt.type !== 'corner') {
      result.push(pt);
      continue;
    }

    // Get directions to neighbors
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];

    const toPrev = vec2.subtract(prev.position, pt.position);
    const toNext = vec2.subtract(next.position, pt.position);
    const distPrev = vec2.length(toPrev);
    const distNext = vec2.length(toNext);

    // Clamp radius to half the distance to nearest neighbor
    const clampedR = Math.min(r, distPrev / 2, distNext / 2);

    // Unit vectors
    const uPrev = vec2.scale(toPrev, 1 / distPrev);
    const uNext = vec2.scale(toNext, 1 / distNext);

    // Entry point (toward prev)
    const entry = vec2.add(pt.position, vec2.scale(uPrev, clampedR));
    result.push({
      position: entry,
      handleIn: null,
      handleOut: vec2.scale(uPrev, -clampedR * BEZIER_CIRCLE_KAPPA),
      type: 'smooth',
    });

    // Exit point (toward next)
    const exit = vec2.add(pt.position, vec2.scale(uNext, clampedR));
    result.push({
      position: exit,
      handleIn: vec2.scale(uNext, -clampedR * BEZIER_CIRCLE_KAPPA),
      handleOut: null,
      type: 'smooth',
    });
  }

  return result;
}
```

The clamping is critical. Without it, adjacent corner radii could overlap — the rounded arcs would extend past each other, creating a self-intersecting path. Clamping to half the distance to each neighbor guarantees the arcs never meet in the middle.

## Adaptive Tessellation

Once we have `PathPoint[]`, the next step is converting Bezier curves into straight line segments the GPU can work with. This is tessellation.

The naive approach — divide each curve into N equal segments — wastes geometry on flat sections and produces jagged results on sharp curves. We use adaptive subdivision instead: recursively split a curve at its midpoint until it's "flat enough."

### The Flatness Test

The key insight is the de Casteljau subdivision algorithm. Given four control points of a cubic Bezier, you can split it at any parameter t into two smaller Bezier curves that together trace the original:

```typescript
subdivide(
  p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, t: number
): [CubicCurve, CubicCurve] {
  // Level 1: lerp each adjacent pair
  const p01 = vec2.lerp(p0, p1, t);
  const p12 = vec2.lerp(p1, p2, t);
  const p23 = vec2.lerp(p2, p3, t);

  // Level 2
  const p012 = vec2.lerp(p01, p12, t);
  const p123 = vec2.lerp(p12, p23, t);

  // Level 3 — the point on the curve
  const p0123 = vec2.lerp(p012, p123, t);

  return [
    { p0, p1: p01, p2: p012, p3: p0123 },
    { p0: p0123, p1: p123, p2: p23, p3 },
  ];
}
```

A curve is "flat enough" when its control points are close to the straight line from start to end. We measure this by computing the perpendicular distance from each interior control point to the line segment `p0→p3`. If the sum of these distances is less than a tolerance (typically 1 pixel), we can replace the curve with a straight line to its endpoint:

```typescript
tessellate(
  p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2,
  tolerance: number = 1.0
): Vector2[] {
  const points: Vector2[] = [vec2.clone(p0)];

  const subdivideAdaptive = (
    p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2,
    depth: number = 0
  ): void => {
    const d1 = pointLineDistance(p1, p0, p3);
    const d2 = pointLineDistance(p2, p0, p3);

    if ((d1 + d2 < tolerance && depth > 0) || depth > 10) {
      points.push(vec2.clone(p3));
      return;
    }

    const [left, right] = bezier.subdivide(p0, p1, p2, p3, 0.5);
    subdivideAdaptive(left.p0, left.p1, left.p2, left.p3, depth + 1);
    subdivideAdaptive(right.p0, right.p1, right.p2, right.p3, depth + 1);
  };

  subdivideAdaptive(p0, p1, p2, p3);
  return points;
}
```

The `depth > 10` guard caps recursion at 2^10 = 1024 segments per curve — more than enough for any screen resolution. The `depth > 0` check ensures we always subdivide at least once, handling the degenerate case where all four control points are collinear (the flatness test would pass immediately, but we still need intermediate points for the stroke outline to work correctly).

### From Paths to Flat Vertices

The tessellation step converts individual segments. We need to stitch them together into a continuous outline:

```typescript
export function tessellatePathToVertices(
  points: PathPoint[],
  closed: boolean,
  tolerance: number = 1.0
): Float32Array {
  if (points.length === 0) return new Float32Array(0);
  if (points.length === 1) {
    return new Float32Array([points[0].position.x, points[0].position.y]);
  }

  const vertices: number[] = [];

  forEachSegment(points, closed, (p0, p1, index) => {
    const segmentPoints = tessellateSegment(p0, p1, tolerance);

    // Skip first point for subsequent segments to avoid duplicates
    const startIndex = index === 0 ? 0 : 1;
    for (let j = startIndex; j < segmentPoints.length; j++) {
      vertices.push(segmentPoints[j].x, segmentPoints[j].y);
    }
  });

  // Remove duplicate closing vertex for earcut compatibility
  if (closed && vertices.length >= 6) {
    const firstX = vertices[0];
    const firstY = vertices[1];
    const lastX = vertices[vertices.length - 2];
    const lastY = vertices[vertices.length - 1];

    if (
      Math.abs(lastX - firstX) <= GEOMETRY_EPSILON &&
      Math.abs(lastY - firstY) <= GEOMETRY_EPSILON
    ) {
      vertices.splice(vertices.length - 2, 2);
    }
  }

  return new Float32Array(vertices);
}
```

The output is a flat `Float32Array` of `[x, y, x, y, ...]` pairs — the format that maps directly to a WebGL vertex buffer. Two details matter:

**Skip first point of subsequent segments.** Each segment's tessellation includes both endpoints. Without skipping, adjacent segments would duplicate the shared vertex. One extra vertex sounds harmless, but it creates a zero-length edge that confuses the earcut triangulator.

**Remove duplicate closing vertex.** For closed paths, the last segment connects the last point back to the first. Its tessellation produces a final vertex that matches the first vertex. Earcut assumes closed polygons — it automatically connects the last vertex to the first — so this duplicate creates a zero-length edge that can produce incorrect triangulation. We detect and remove it.

The `forEachSegment` helper handles the closed/open distinction:

```typescript
export function forEachSegment(
  points: PathPoint[],
  closed: boolean,
  callback: (p0: PathPoint, p1: PathPoint, index: number) => void
): void {
  for (let i = 0; i < points.length - 1; i++) {
    callback(points[i], points[i + 1], i);
  }
  if (closed && points.length > 1) {
    callback(points[points.length - 1], points[0], points.length - 1);
  }
}
```

And `tessellateSegment` decides whether a segment needs Bezier subdivision at all:

```typescript
export function tessellateSegment(
  p0: PathPoint,
  p1: PathPoint,
  tolerance: number = 1.0
): Vector2[] {
  if (!p0.handleOut && !p1.handleIn) {
    return [vec2.clone(p0.position), vec2.clone(p1.position)];
  }

  const { cp1, cp2 } = getAbsoluteControlPoints(p0, p1);
  return bezier.tessellate(p0.position, cp1, cp2, p1.position, tolerance);
}
```

Straight lines (no handles) skip the Bezier machinery entirely — just two endpoints.

## Fill Rendering with Earcut

We now have a `Float32Array` of outline vertices for every shape. To render a fill, we need to convert this outline into triangles. This is polygon triangulation — one of the classic problems in computational geometry.

We use the [earcut](https://github.com/mapbox/earcut) library by Mapbox. It implements the ear-clipping algorithm: find a triangle (an "ear") at the polygon's edge that doesn't intersect any other edges, clip it off, and repeat until only one triangle remains. Earcut handles holes (we'll need those later), runs in O(n log n) for most inputs, and accepts the exact flat `[x, y, x, y, ...]` format we produce.

```typescript
import earcut from 'earcut';

const vertices = tessellatePathToVertices(pathPoints, closed, tolerance);
const numVerts = vertices.length / 2;
const fillIndices = numVerts >= 3 ? earcut(vertices) : [];
```

Earcut returns an array of indices into the vertex array — every three consecutive indices form one triangle. To draw a filled rectangle, earcut returns `[0, 1, 2, 0, 2, 3]` — two triangles sharing a diagonal.

### Solid Color Fills

With vertices and indices, the GPU draw call is straightforward:

```typescript
private renderFill(
  vertices: Float32Array, fillIndices: number[], fill: Fill, nodeOpacity: number
): void {
  if (fill.type === 'gradient' && fill.gradient) {
    this.renderFillGradient(vertices, fillIndices, fill.gradient, fill.opacity * nodeOpacity);
    return;
  }

  const gl = this.renderer.context;
  this.renderer.useProgram(this.program);

  const color = hexToRgb(fill.color);
  gl.uniform4fv(this.program.uniforms.u_color, new Float32Array([
    color.r / 255, color.g / 255, color.b / 255, fill.opacity * nodeOpacity,
  ]));

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);

  gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, new Uint16Array(fillIndices));
  gl.drawElements(gl.TRIANGLES, fillIndices.length, gl.UNSIGNED_SHORT, 0);
}
```

Upload vertices to the vertex buffer, upload indices to the element buffer, issue `drawElements`. The vertex shader transforms each vertex from local space to clip space; the fragment shader outputs the uniform color.

### Gradient Fills

Gradients are more interesting. The vertex shader passes each vertex's local-space position (`v_localPos`) to the fragment shader. The fragment shader normalizes this position against the shape's bounding box, then computes a gradient parameter `t` depending on the gradient type:

```glsl
vec2 size = u_bounds.zw - u_bounds.xy;
vec2 npos = (v_localPos - u_bounds.xy) / size;

float t;
if (u_gradientType == 0) {
  // Linear: project onto gradient direction
  vec2 gradDir = u_gradEnd - u_gradStart;
  float gradLen = length(gradDir);
  vec2 normDir = gradDir / max(gradLen, 0.001);
  t = dot(npos - u_gradStart, normDir) / max(gradLen, 0.001);
} else if (u_gradientType == 1) {
  // Radial: distance from center
  t = length(npos - u_center) / max(u_radius, 0.001);
} else {
  // Conic: angle around center
  vec2 d = npos - u_center;
  float a = atan(d.y, d.x) + 3.14159265;
  float startRad = u_angle * 3.14159265 / 180.0;
  t = mod(a - startRad, 6.28318530) / 6.28318530;
}
t = clamp(t, 0.0, 1.0);
```

Then `t` indexes into an array of up to 16 color stops:

```glsl
vec4 color = u_stops[0];
for (int i = 1; i < MAX_GRADIENT_STOPS; i++) {
  if (i >= u_stopCount) break;
  if (t <= u_offsets[i]) {
    float denom = u_offsets[i] - u_offsets[i-1];
    float st = denom > 0.0 ? (t - u_offsets[i-1]) / denom : 0.0;
    color = mix(u_stops[i-1], u_stops[i], clamp(st, 0.0, 1.0));
    break;
  }
  if (i == u_stopCount - 1) color = u_stops[i];
}
```

The beauty of this approach is that linear, radial, and conic gradients use the same shader and the same draw call. The only difference is how `t` is computed — everything else (stop interpolation, opacity, triangle rendering) is shared.

Setting the gradient uniforms requires computing the shape's bounding box from the tessellated vertices and normalizing the gradient's start/end/center/radius into that coordinate space:

```typescript
private setGradientUniforms(
  gradient: Gradient, bounds: [number, number, number, number], opacity: number
): void {
  const gl = this.renderer.context;
  const u = this.gradientProgram.uniforms;

  const typeMap = { linear: 0, radial: 1, conic: 2 };
  gl.uniform1i(u['u_gradientType'], typeMap[gradient.type] ?? 0);

  const stops = normalizeGradientStops(gradient.stops);
  const stopCount = Math.min(stops.length, MAX_GRADIENT_STOPS);
  gl.uniform1i(u['u_stopCount'], stopCount);

  for (let i = 0; i < stopCount; i++) {
    gl.uniform4fv(u[`u_stops[${i}]`], new Float32Array([
      stops[i].color.r / 255, stops[i].color.g / 255,
      stops[i].color.b / 255, stops[i].color.a,
    ]));
    gl.uniform1f(u[`u_offsets[${i}]`], stops[i].offset);
  }

  gl.uniform4fv(u['u_bounds'], new Float32Array(bounds));
  gl.uniform1f(u['u_opacity'], opacity);
  // ... gradient-specific params (angle, center, radius, start, end)
}
```

## Geometry Caching

Tessellation and earcut are expensive. A smooth Bezier curve might produce 50-100 line segments, and earcut runs in O(n log n). If we retessellated every shape every frame, a scene with 200 shapes would struggle to hit 60fps.

The solution is a geometry cache. Each node's tessellated vertices and triangulation indices are cached and reused until the shape's geometry changes.

### Cache Keys

The cache is a `Map<string, TessellationCacheEntry>` keyed by node ID. Each entry stores a "geometry key" — a string that changes whenever the shape's geometry changes:

```typescript
function buildGeometryKey(node: Node): string {
  switch (node.type) {
    case 'rectangle':
      return (
        `R:${node.width}:${node.height}:${node.transform.anchor.x}:` +
        `${node.transform.anchor.y}:${node.cornerRadius}`
      );
    case 'ellipse':
      return `E:${node.radiusX}:${node.radiusY}`;
    case 'polygon':
      return `P:${node.radius}:${node.sides}:${node.innerRadius}:${node.cornerRadius}`;
    case 'path': {
      const parts = ['X', String(node.closed), String(node.fillRule ?? 'nonzero')];
      for (const pt of node.points) {
        parts.push(`${pt.position.x}:${pt.position.y}:${pt.type}`);
        if (pt.handleIn) parts.push(`i${pt.handleIn.x}:${pt.handleIn.y}`);
        if (pt.handleOut) parts.push(`o${pt.handleOut.x}:${pt.handleOut.y}`);
        if (pt.cornerRadius) parts.push(`cr${pt.cornerRadius}`);
      }
      // ... subpaths separated by '|'
      return parts.join(',');
    }
    // ... text, image, artboard cases
  }
}
```

The key is designed so that _any_ geometry change — resizing, moving a point, adjusting a handle, changing corner radius — produces a different key. But changes that don't affect geometry — position, rotation, fill color, opacity — don't. The position and rotation are handled by the transform matrix (set as a uniform), not by the geometry.

A lesson learned the hard way: every node type that has renderable geometry must have a case in `buildGeometryKey`. The default return value is `''`. If you add a new node type and forget to add its case, the empty string means "never invalidate the cache" — the shape appears to render correctly once, then doesn't update when you resize it. This is exactly what happened with artboard nodes during development, and it took a while to track down because the shape rendered fine on first draw.

### The Cache Lookup

```typescript
private getCachedTessellation(
  nodeId: string, node: Node, pathPoints: PathPoint[],
  closed: boolean, tolerance: number
) {
  const geoKey = buildGeometryKey(node);
  const cached = this.geometryCache.get(nodeId);

  if (cached && cached.geoKey === geoKey) {
    return { vertices: cached.vertices, fillIndices: cached.fillIndices };
  }

  // Cache miss — tessellate fresh
  const vertices = tessellatePathToVertices(pathPoints, closed, tolerance);
  const numVerts = vertices.length / 2;
  const fillIndices = numVerts >= 3
    ? Array.from(earcut(vertices.subarray(0, numVerts * 2)))
    : [];

  const entry: TessellationCacheEntry = {
    geoKey,
    vertices,
    fillIndices,
    strokeCache: new Map(),
  };
  this.geometryCache.set(nodeId, entry);

  return { vertices, fillIndices };
}
```

The full cache entry stores more than just fill geometry:

```typescript
interface TessellationCacheEntry {
  geoKey: string;
  vertices: Float32Array;
  fillIndices: number[];
  strokeCache: Map<string, { outline: Float32Array; indices: number[] }>;
  contours?: Float32Array[];
  contourVertexCounts?: number[];
  // ... additional fields for specialized rendering
}
```

The `strokeCache` is a nested cache — stroke outlines are cached per combination of stroke width and alignment. A shape can have multiple strokes with different widths, and each needs its own outline. The stroke cache is invalidated whenever the geometry key changes (since the outline depends on vertex positions).

## Stroke Rendering

Strokes are significantly harder than fills. A fill is the _interior_ of a polygon. A stroke is the _outline_ — a ribbon of constant width that follows the path's contour. Converting a one-dimensional path into a two-dimensional ribbon involves computing perpendicular offsets at every vertex, which introduces its own set of geometric challenges.

### The Outline Generation

The core function is `generateStrokeOutlineVertices`. It takes the flat tessellated vertices and produces a wider polygon that represents the stroke:

```typescript
export function generateStrokeOutlineVertices(
  vertices: Float32Array, numVertices: number,
  width: number, closed: boolean,
  align: 'center' | 'inside' | 'outside' = 'center',
  widthProfile?: number[]
): Float32Array {
  if (numVertices < 2) return new Float32Array(0);

  const halfWidth = Math.max(width / 2, 0.5);
  let leftOffset: number;
  let rightOffset: number;

  if (align === 'inside') {
    leftOffset = 0;
    rightOffset = -Math.max(width, 0.5);
  } else if (align === 'outside') {
    leftOffset = Math.max(width, 0.5);
    rightOffset = 0;
  } else {
    leftOffset = halfWidth;
    rightOffset = -halfWidth;
  }

  const leftSide: number[] = [];
  const rightSide: number[] = [];
```

The algorithm walks each vertex and computes a perpendicular direction — the direction to offset the stroke. For interior vertices (those with both a previous and next neighbor), this is the _miter bisector_: the average of the two edge normals.

### Miter Joins

At each vertex where two edges meet, we need to decide how the stroke turns the corner. The miter join extends both edges until they meet at a point:

```typescript
// Per-edge normals (rotate tangent 90° CCW)
const n1x = -inDy / inLen; // incoming edge normal
const n1y = inDx / inLen;
const n2x = -outDy / outLen; // outgoing edge normal
const n2y = outDx / outLen;

// Miter bisector = average of the two normals
const mx = n1x + n2x;
const my = n1y + n2y;
const mLen = Math.sqrt(mx * mx + my * my);

perpX = mx / mLen;
perpY = my / mLen;

// Scale so perpendicular distance from each edge = stroke offset
const dot = n1x * perpX + n1y * perpY;
if (dot > GEOMETRY_EPSILON) {
  miterScale = 1 / dot;
  if (miterScale > 4) miterScale = 4; // Miter limit
}
```

The `1 / dot` scaling is the key insight. The miter bisector points in the average normal direction, but a naive offset along this direction wouldn't maintain constant perpendicular distance from the original edges. The dot product between the edge normal and the miter direction tells you how much the miter deviates from perpendicular. Dividing by it corrects for this deviation, ensuring the stroke has exactly the right width measured perpendicular to each edge.

The miter limit (capped at 4×) prevents extremely long spikes at acute angles. When two edges meet at a very sharp angle, the miter point shoots far away from the vertex. A limit of 4× the stroke width is the SVG default and looks correct for the vast majority of shapes.

### The Ribbon Polygon

After computing the perpendicular and miter scale for every vertex, the function builds two parallel arrays — the left side (offset outward) and the right side (offset inward):

```typescript
const scaledLeft = effLeftOffset * miterScale;
const scaledRight = effRightOffset * miterScale;
leftSide.push(cx + perpX * scaledLeft, cy + perpY * scaledLeft);
rightSide.push(cx + perpX * scaledRight, cy + perpY * scaledRight);
```

Then combines them into a single closed polygon by concatenating the left side forward with the right side reversed:

```
Left[0] → Left[1] → Left[2] → ... → Left[N-1]
                                         ↓
Right[N-1] → Right[N-2] → ... → Right[1] → Right[0]
```

This produces a closed ribbon polygon where the left side traces the path in one direction and the right side traces it back.

### Why TRIANGLE_STRIP, Not Earcut

You might think we'd triangulate this ribbon polygon with earcut, just like we did for fills. We tried that. It doesn't work for concave shapes.

The problem is self-intersection. When you offset a concave polygon's outline outward, the offset curves cross each other at concavities. The ribbon polygon is technically self-intersecting — a well-defined polygon that earcut can't handle:

```
               ╱╲
              ╱  ╲
offset left  ╱    ╲ offset right
            ╱  ╳   ╲  ← self-intersection at concavity
           ╱  ╱ ╲   ╲
          ╱  ╱   ╲   ╲
```

Earcut on a self-intersecting polygon produces garbage — dark triangular artifacts that flicker with the shape's geometry. We discovered this bug early and spent a frustrating afternoon debugging it.

The solution is `gl.TRIANGLE_STRIP`. Instead of triangulating the entire ribbon as one polygon, we interleave the left and right vertices into a strip:

```typescript
private outlineToTriangleStrip(
  outline: Float32Array, closed: boolean
): Float32Array | null {
  const totalOutlineVerts = outline.length / 2;
  if (totalOutlineVerts < 4 || totalOutlineVerts % 2 !== 0) return null;

  const N = totalOutlineVerts / 2; // vertices per side
  const stripPairs = closed ? N + 1 : N;
  const strip = new Float32Array(stripPairs * 4);

  for (let i = 0; i < N; i++) {
    // Left vertex at index i
    strip[i * 4] = outline[i * 2];
    strip[i * 4 + 1] = outline[i * 2 + 1];
    // Right vertex at index (2N - 1 - i) — right side is reversed in outline
    const ri = 2 * N - 1 - i;
    strip[i * 4 + 2] = outline[ri * 2];
    strip[i * 4 + 3] = outline[ri * 2 + 1];
  }

  if (closed) {
    // Close the strip by repeating the first pair
    strip[N * 4] = outline[0];
    strip[N * 4 + 1] = outline[1];
    const ri = 2 * N - 1;
    strip[N * 4 + 2] = outline[ri * 2];
    strip[N * 4 + 3] = outline[ri * 2 + 1];
  }

  return strip;
}
```

A `TRIANGLE_STRIP` draws triangles from every three consecutive vertices: `(0,1,2)`, `(1,2,3)`, `(2,3,4)`, etc. By interleaving `[left[0], right[0], left[1], right[1], ...]`, each quad between two consecutive path vertices becomes two triangles. Each quad is independent — self-intersection at one vertex can't corrupt another quad.

The draw call is simple:

```typescript
private renderStrokeStrip(
  outline: Float32Array, color: Float32Array, closed: boolean
): void {
  const strip = this.outlineToTriangleStrip(outline, closed);
  if (!strip) return;

  const gl = this.renderer.context;
  this.renderer.useProgram(this.program);
  gl.uniform4fv(this.program.uniforms.u_color, color);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, strip);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip.length / 2);
}
```

### Gradient Strokes

Gradient strokes use the same TRIANGLE_STRIP technique, but with the gradient shader instead of the flat-color shader. The vertex shader passes each vertex's local-space position through to the fragment shader, which computes the gradient color per-pixel:

```typescript
private renderStrokeStripGradient(
  outline: Float32Array, gradient: Gradient, opacity: number, closed: boolean
): void {
  const strip = this.outlineToTriangleStrip(outline, closed);
  if (!strip) return;

  const gl = this.renderer.context;
  this.renderer.useProgram(this.gradientProgram);
  this.setGradientUniforms(gradient, computeBounds(outline), opacity);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, strip);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip.length / 2);
}
```

The gradient is computed in the local coordinate space of the stroke outline, so it follows the shape naturally. A linear gradient across a stroked circle sweeps around the stroke just like across the fill.

### Width Profiles

Brush strokes have variable width — thicker at pressure-heavy segments, thinner at the ends. The `widthProfile` parameter is an array of multipliers sampled along the path:

```typescript
if (widthProfile && widthProfile.length >= 2) {
  const t = numVertices > 1 ? i / (numVertices - 1) : 0;
  const profileLen = widthProfile.length;
  const fi = t * (profileLen - 1);
  const lo = Math.floor(fi);
  const hi = Math.min(lo + 1, profileLen - 1);
  const frac = fi - lo;
  const multiplier = widthProfile[lo] + frac * (widthProfile[hi] - widthProfile[lo]);
  effLeftOffset = leftOffset * multiplier;
  effRightOffset = rightOffset * multiplier;
}
```

The multiplier is linearly interpolated along the path, scaling the stroke width at each vertex. A profile of `[0, 1, 1, 0]` produces a stroke that tapers at both ends — the classic calligraphic stroke shape.

## Multi-Contour Rendering

Simple shapes have one contour. But compound paths — the letter "O," a donut, an SVG with multiple subpaths — have multiple contours, and some of those contours are holes inside others. If you naively earcut all contours together, you get a solid mass with no holes.

The solution requires two steps: figure out which contours are holes, and tell earcut about the holes.

### Containment Analysis

`groupContoursByContainment` takes an array of tessellated contour vertex arrays and groups them into `{ outer, holes[] }` sets:

```typescript
function groupContoursByContainment(
  contourArrays: Float32Array[],
  fillRule: 'nonzero' | 'evenodd' = 'evenodd'
): ContourGroup[] {
```

First, it builds a containment graph. For each pair of contours, it checks whether one contains the other using a two-step test:

1. **AABB pre-check**: If contour A's bounding box isn't fully inside contour B's bounding box, A can't be inside B. Skip the expensive test.

2. **Point-in-polygon**: Take the first vertex of contour A and test whether it's inside contour B using ray casting — cast a horizontal ray from the point and count how many edges of B it crosses. Odd count = inside.

```typescript
function pointInContour(px: number, py: number, verts: Float32Array): boolean {
  let inside = false;
  const n = verts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i * 2];
    const yi = verts[i * 2 + 1];
    const xj = verts[j * 2];
    const yj = verts[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
```

### Fill Rules

Once we know which contours contain which, the fill rule determines which ones are holes:

**Even-odd** (the default): Count how many contours contain a given contour. If the count is odd, it's a hole. This means alternating filled/empty/filled/empty as you nest contours deeper. It's the intuitive behavior — draw a circle inside a circle and the inner one is a hole.

**Non-zero**: A contained contour is a hole only if its winding direction (computed via the shoelace formula) differs from its immediate parent. Two contours wound in the same direction are both filled, even if one is inside the other. This is less intuitive but important for certain SVG imports.

```typescript
if (fillRule === 'evenodd') {
  for (let i = 0; i < n; i++) {
    isHole[i] = depth[i] % 2 === 1;
  }
} else {
  for (let i = 0; i < n; i++) {
    if (depth[i] === 0) continue;
    // Find tightest container
    let parentIdx = -1;
    let parentArea = Infinity;
    for (const p of containedBy[i]) {
      const absA = Math.abs(areas[p]);
      if (absA < parentArea) {
        parentArea = absA;
        parentIdx = p;
      }
    }
    if (parentIdx >= 0) {
      const sameWinding = areas[i] > 0 === areas[parentIdx] > 0;
      isHole[i] = !sameWinding;
    }
  }
}
```

### Earcut with Holes

Each `{ outer, holes[] }` group gets tessellated independently. Earcut's hole support works through a second parameter — an array of indices marking where each hole starts in the combined vertex array:

```
// Concatenate outer + holes into one buffer
groupVertices = [outer vertices..., hole1 vertices..., hole2 vertices...]
holeIndices  = [outer.length/2, outer.length/2 + hole1.length/2]
                ↑                ↑
                where hole 1     where hole 2
                starts           starts

fillIndices = earcut(groupVertices, holeIndices);
```

Earcut uses these hole markers to connect each hole to the outer contour with a bridge edge (a zero-width cut), turning the multi-contour polygon into a single simple polygon that it can triangulate. The result is a triangulation that fills the outer contour while leaving the holes empty.

After earcut runs on each group, we remap the local indices to global indices (since each group only sees its own subset of vertices) and combine everything into one set of fill indices and one vertex buffer.

## The Transform Pipeline

Every shape is defined in its own local coordinate space. A rectangle's vertices go from `(-width * anchor.x, -height * anchor.y)` to `(width * (1 - anchor.x), height * (1 - anchor.y))`. To get it on screen, we need two matrix transforms.

### The Model Matrix

The model matrix converts local coordinates to world coordinates. It encodes the node's position, rotation, scale, and anchor (we first built this in Chapter 4's coordinate system):

```typescript
compose(
  position: Vector2, rotation: number, scale: Vector2,
  anchor: Vector2 = { x: 0, y: 0 }
): Matrix3 {
  let m = mat3.identity();
  m = mat3.translate(m, position.x, position.y);  // move to world position
  m = mat3.rotate(m, rotation * Math.PI / 180);   // rotate around position
  m = mat3.scale(m, scale.x, scale.y);            // scale
  m = mat3.translate(m, -anchor.x, -anchor.y);    // offset by anchor
  return m;
}
```

The anchor offset is applied _last_ (innermost transform — remember, matrix multiplication applies right-to-left). This means geometry centered around `(0, 0)` in local space gets shifted so the anchor point lands at the node's position. A rectangle with anchor `(0.5, 0.5)` has its center at the node's position; one with anchor `(0, 0)` has its top-left corner there.

For nested nodes (children of groups), the model matrix is the product of the parent's world matrix and the child's local matrix:

```typescript
getWorldTransform(id: string): Matrix3 {
  const node = this.nodes.get(id);
  const localMatrix = this.computeLocalMatrix(node.transform);

  if (node.parent) {
    const parentWorld = this.getWorldTransform(node.parent);
    return mat3.multiply(parentWorld, localMatrix);
  }
  return localMatrix;
}
```

World transforms are cached and invalidated when a node or any of its ancestors changes, propagating down through the subtree.

### The View-Projection Matrix

The view-projection matrix converts world coordinates to clip space (the -1 to +1 range that WebGL maps to the viewport). It encodes the camera's pan and zoom:

```
clipX = (worldX - panX) / zoom * (2 / viewportWidth)
clipY = (worldY - panY) / zoom * (2 / viewportHeight)
```

This single matrix is set once per frame and shared across all shapes.

### The Vertex Shader

The full transform in the vertex shader is two matrix multiplies:

```glsl
uniform mat3 u_viewProjection;
uniform mat3 u_model;

void main() {
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
```

`u_model` changes per shape. `u_viewProjection` changes per frame. The vertex position is the tessellated outline vertex, already in local space. The multiplication chain — model then view-projection — is the standard MVP pipeline with the "P" (projection) folded into the "V" (view) since we're 2D and don't need perspective.

### Why Not Bake World Positions?

An alternative design is to transform all vertices into world space on the CPU and skip the model matrix entirely. We do this for boolean groups (where the result is already in world space) but not for regular shapes. The reason: geometry caching.

If we baked world positions, the tessellation cache would be invalidated every time a shape moves, rotates, or scales. By keeping geometry in local space and applying the transform as a uniform, we can reuse the cached tessellation through any number of position, rotation, and scale changes. The only things that invalidate the cache are changes to the shape's intrinsic geometry — its width, height, corner radius, control points, and so on.

## Putting It All Together

A complete shape render for a rectangle looks like this:

```typescript
renderRectangle(node: RectangleNode, worldMatrix: Matrix3): void {
  const gl = this.renderer.context;

  // 1. Generate path points
  const pathPoints = createRectanglePath(
    -node.width * node.transform.anchor.x,
    -node.height * node.transform.anchor.y,
    node.width, node.height,
    node.cornerRadius
  );

  // 2. Tessellate and cache
  const { vertices, fillIndices } = this.getCachedTessellation(
    node.id, node, pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE
  );

  // 3. Set model matrix
  const modelArray = mat3.toFloat32Array(worldMatrix);
  this.currentModelMatrix = modelArray;
  gl.uniformMatrix3fv(this.program.uniforms.u_model, false, modelArray);

  // 4. Render fills and strokes
  this.renderFillsAndStrokes(
    node.id, vertices, fillIndices,
    node.fills, node.strokes, true,
    this.currentEffectiveOpacity
  );
}
```

And `renderFillsAndStrokes` iterates over the node's fill and stroke arrays:

```typescript
private renderFillsAndStrokes(
  nodeId: string, tessellated: Float32Array, fillIndices: number[],
  fills: Fill[], strokes: Stroke[], closed: boolean, nodeOpacity: number
): void {
  for (const fill of fills) {
    if (fill.visible && fill.type !== 'none')
      this.renderFill(tessellated, fillIndices, fill, nodeOpacity);
  }
  for (const stroke of strokes) {
    if (stroke.visible && stroke.width > 0)
      this.renderStroke(nodeId, tessellated, stroke, closed, nodeOpacity);
  }
}
```

A single node can have multiple fills stacked on top of each other (solid color under a semi-transparent gradient) and multiple strokes with different widths, colors, and alignments. Each fill or stroke is one draw call. A shape with one fill and one stroke takes two draw calls. The geometry — tessellation, earcut indices, stroke outline — is computed once and cached.

The main render loop traverses the scene graph in paint order, calling the appropriate render method for each visible node:

```typescript
render(sceneGraph: SceneGraph, viewProjectionMatrix: Matrix3): void {
  this.renderer.useProgram(this.program);
  this.renderer.bindVAO(this.vao);

  const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
  gl.uniformMatrix3fv(this.program.uniforms.u_viewProjection, false, vpArray);

  sceneGraph.traverseVisible((node) => {
    const worldMatrix = sceneGraph.getWorldTransform(node.id);

    switch (node.type) {
      case 'rectangle': this.renderRectangle(node, worldMatrix); break;
      case 'ellipse':   this.renderEllipse(node, worldMatrix);   break;
      case 'polygon':   this.renderPolygon(node, worldMatrix);   break;
      case 'path':      this.renderPath(node, worldMatrix);      break;
      // ... text, image, artboard
    }
    return true; // continue traversal
  });
}
```

The view-projection matrix is set once. The model matrix changes per node. Geometry is read from cache or tessellated fresh. Fills and strokes are drawn with the appropriate shader. The GPU takes care of the rest.

## Lessons

**Normalize everything to a common representation before processing.** Every shape type — rectangle, ellipse, polygon, star, path — converts to `PathPoint[]` before tessellation. This means the tessellator, the earcut triangulator, the stroke outline generator, and the geometry cache all deal with one format. Adding a new shape type means writing one conversion function, not touching five pipeline stages.

**Adaptive subdivision beats fixed subdivision.** Dividing every Bezier curve into a fixed number of segments wastes geometry on flat curves and produces jagged results on sharp ones. The flatness test — measuring control point distance from the chord — puts vertices only where curvature demands them. The depth cap prevents runaway recursion, and the minimum-one-subdivision rule handles degenerate cases.

**Cache geometry in local space, apply transforms as uniforms.** If you bake world positions into the vertex buffer, moving or rotating a shape invalidates the cache. By keeping tessellated vertices in local space and setting the model matrix as a uniform, the cached geometry survives any number of position, rotation, and scale changes. Only intrinsic geometry changes — width, corner radius, control points — trigger retessellation.

**Every renderable node type must have a cache key case, and an empty default is a silent bug.** A `buildGeometryKey` that returns `''` for an unrecognized type means "never invalidate." The shape renders correctly once, then silently ignores all subsequent changes. This is the kind of bug that passes visual inspection on first draw and only surfaces when someone tries to resize.

**TRIANGLE_STRIP solves the concave stroke problem that earcut cannot.** Stroke outlines for concave shapes produce self-intersecting ribbon polygons. Earcut on self-intersecting input generates garbage triangles. Interleaving left and right vertices into a strip renders each segment as an independent quad, eliminating the self-intersection entirely with simpler code and fewer indices.

**Miter scaling by `1/dot` is the geometry you must not skip.** A naive perpendicular offset along the miter bisector does not maintain constant stroke width. The dot product between the edge normal and the miter direction measures the angular deviation; dividing by it corrects the offset to the true perpendicular distance. Without this, strokes appear wider on longer edges of non-square shapes.

## What We Built

This chapter covered the core rendering pipeline — the system that turns abstract shape descriptions into pixels on screen:

- **Shape paths**: Every shape type converts to `PathPoint[]` — the universal Bezier representation
- **Adaptive tessellation**: de Casteljau subdivision with flatness testing, capped at depth 10
- **Fill triangulation**: Earcut converts outlines to triangle indices, cached by geometry key
- **Gradient fills**: A single GLSL shader handles linear, radial, and conic gradients via normalized local coordinates
- **Stroke outlines**: Perpendicular offset with miter bisectors, `1/dot` scaling, and 4× miter limit
- **TRIANGLE_STRIP strokes**: Solves the self-intersection problem for concave shapes
- **Multi-contour rendering**: Containment analysis with AABB pre-check + ray-casting, even-odd and non-zero fill rules, earcut with hole indices
- **Geometry caching**: Tessellate once per geometry change, render many times per frame
- **Transform pipeline**: Local geometry × model matrix × view-projection matrix, all in the vertex shader

The next chapter adds the infinite adaptive grid — the visual background that makes a blank canvas feel like a professional design tool.
