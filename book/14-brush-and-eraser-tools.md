# Brush & Eraser Tools

## The Freehand Problem

The pen tool creates paths by placing one point at a time. The brush tool creates paths by recording continuous mouse movement — potentially hundreds of points per second — and converting that noisy stream into a clean Bezier path. This is a fundamentally different challenge. The pen tool's input is precise (each point is exactly where the user clicked). The brush tool's input is messy: the mouse jitters, the pointer events arrive at irregular intervals, the user's hand shakes.

The brush tool needs a pipeline. Raw pointer positions come in, smooth Bezier paths come out. Between those endpoints, three algorithms work in sequence: a Kalman filter stabilizes the raw input, a distance filter removes redundant samples, and Schneider's curve fitting algorithm converts the surviving points into optimal cubic Bezier segments. The result is a clean path that looks like the user drew it with a steady hand.

The eraser tool has its own complexity: it doesn't just delete shapes — it boolean-subtracts a freehand stroke outline from every overlapping shape, producing new paths that have the erased region cut out. It's constructive geometry masquerading as a destructive operation.

## Input Capture

Every pointer event during a brush stroke is captured with three pieces of data:

```typescript
interface BrushPoint {
  position: Vector2;
  pressure: number;
  timestamp: number;
  width: number;
}
```

The `pressure` comes from the pointer event — stylus tablets report pressure between 0 and 1, mice always report 0. The `timestamp` is used by the Kalman filter to model velocity. The `width` is pre-computed at capture time: `size * mappedPressure`, so the tool doesn't need to re-derive it later.

The pressure mapping is careful about edge cases:

```typescript
const rawPressure = event.pressure;
const pressure = !this.options.pressureEnabled
  ? 1.0
  : rawPressure != null && rawPressure > 0
    ? rawPressure
    : 0.5;
const mappedPressure =
  this.options.pressureMin + pressure * (this.options.pressureMax - this.options.pressureMin);
const pointWidth = this.options.size * mappedPressure;
```

When pressure is disabled, every point gets full width. When enabled, three guards protect against bad data: `null` (synthetic events in tests), `undefined` (unlikely but defensive), and `0` (mouse devices report zero pressure, which would produce invisible strokes). The fallback of 0.5 gives a reasonable default width. The `pressureMin`/`pressureMax` range maps pressure to a configurable envelope — a `pressureMin` of 0.1 means even zero pressure still produces 10% of the brush size, preventing the stroke from vanishing entirely.

This defensive pressure handling was born from a bug: early versions used `event.pressure || 1.0`, which treated 0 (mouse) the same as null (missing). Mouse users got full-width strokes, which was correct, but the `||` operator also treated valid low-pressure stylus input as missing. The explicit three-way check — null, zero, valid — handles all devices correctly.

## The Kalman Filter

Raw pointer positions jitter. Even on a high-resolution display with a steady hand, consecutive pointer events can differ by a pixel or two in both axes. At normal zoom levels this is invisible, but when the user is zoomed in and drawing slowly, the jitter becomes visible as a wobbly path.

The solution is a Kalman filter — a recursive estimator that maintains a belief about the pointer's true position and velocity, updating that belief with each new measurement. The implementation uses a constant-velocity model: it predicts where the pointer should be based on how fast it was moving, then blends that prediction with the actual measurement.

```typescript
export class KalmanFilter1D {
  private x: number = 0; // estimated position
  private v: number = 0; // estimated velocity
  private pXX: number = 1; // position covariance
  private pXV: number = 0; // position-velocity covariance
  private pVV: number = 1; // velocity covariance
  private readonly q: number; // process noise
  private readonly r: number; // measurement noise

  predict(dt: number): number {
    if (!this.initialized) return this.x;

    // State prediction: position += velocity * dt
    this.x += this.v * dt;

    // Covariance prediction: P' = F*P*F^T + Q*dt
    const qDt = this.q * dt;
    this.pXX += 2 * dt * this.pXV + dt * dt * this.pVV + qDt;
    this.pXV += dt * this.pVV;
    this.pVV += qDt;

    return this.x;
  }

  update(measurement: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }

    // Innovation: difference between prediction and measurement
    const y = measurement - this.x;

    // Innovation covariance
    const s = this.pXX + this.r;

    // Kalman gain
    const kX = this.pXX / s;
    const kV = this.pXV / s;

    // Blend prediction with measurement
    this.x += kX * y;
    this.v += kV * y;

    // Update covariance
    this.pXX -= kX * this.pXX;
    this.pXV -= kX * this.pXV;
    this.pVV -= kV * this.pXV;

    return this.x;
  }
}
```

The two noise parameters control the filter's behavior. **Process noise** (`q`) represents how unpredictable the user's motion is — high values let the filter follow rapid direction changes. **Measurement noise** (`r`) represents how noisy the input device is — high values make the filter smooth more aggressively.

The 2D filter is simply two independent 1D filters, one for X and one for Y:

```typescript
export class KalmanFilter2D {
  private filterX: KalmanFilter1D;
  private filterY: KalmanFilter1D;

  filter(measurement: Vector2, dt: number): Vector2 {
    this.filterX.predict(dt);
    this.filterY.predict(dt);
    return {
      x: this.filterX.update(measurement.x),
      y: this.filterY.update(measurement.y),
    };
  }
}
```

The brush tool maps the user-facing "smoothing" slider (0-100) to Kalman parameters via a logarithmic curve:

```typescript
export function smoothingToKalmanParams(smoothing: number) {
  const s = Math.max(0, Math.min(100, smoothing)) / 100;
  return {
    processNoise: Math.pow(10, 2 - 4 * s), // 100 → 0.01
    measurementNoise: Math.pow(10, -2 + 4 * s), // 0.01 → 100
  };
}
```

At smoothing=0, process noise is 100 and measurement noise is 0.01 — the filter trusts measurements almost completely, producing raw/responsive output. At smoothing=100, the ratio inverts — the filter smooths aggressively, ignoring most high-frequency jitter. At the default smoothing=50, both noises are 1.0, giving a balanced blend.

The logarithmic scale is important. Human perception of smoothing is roughly logarithmic — the difference between 0 and 10 on the slider should feel similar to the difference between 90 and 100. Linear noise mapping would cluster all the perceptual change in the last 10% of the slider range.

### Distance Filtering

After the Kalman filter, a minimum distance check prevents redundant points:

```typescript
if (this.allPoints.length > 0) {
  const lastPoint = this.allPoints[this.allPoints.length - 1];
  const minDistance = 2 / this.context.camera.zoom;
  if (vec2.distance(filteredPos, lastPoint.position) < minDistance) {
    return;
  }
}
```

The threshold is `2 / zoom` — 2 screen pixels at the current zoom level. When the user draws slowly or the pointer hovers in place, the filter might output nearly identical positions. Discarding these duplicates prevents the curve fitter from wasting effort on degenerate segments and keeps the point count proportional to the actual path length.

## Schneider's Curve Fitting Algorithm

The heart of the brush tool is Schneider's algorithm, published in _Graphics Gems I_ (1990). Given a sequence of points, it produces a chain of cubic Bezier curves that approximates the polyline within a specified error tolerance. The algorithm is recursive and operates in four phases.

### Phase 1: Parameterization

Each input point gets a parameter value between 0 and 1, based on chord-length parameterization:

```typescript
function chordLengthParameterize(points: Vector2[], first: number, last: number): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) {
    u.push(u[u.length - 1] + vec2.distance(points[i], points[i - 1]));
  }

  // Normalize to [0, 1]
  const totalLength = u[u.length - 1];
  if (totalLength > EPSILON) {
    for (let i = 1; i < u.length; i++) {
      u[i] /= totalLength;
    }
  }
  u[u.length - 1] = 1;
  return u;
}
```

The first point gets parameter 0, the last gets 1, and intermediate points are distributed proportionally to their cumulative distance along the polyline. This is the natural parameterization for a freehand stroke — a point halfway along the stroke gets parameter 0.5.

### Phase 2: Least-Squares Bezier Generation

Given the endpoint tangent directions and the parameterized points, the algorithm finds the cubic Bezier that minimizes the sum of squared distances from each point to its corresponding position on the curve:

```typescript
function generateBezier(
  points: Vector2[],
  first: number,
  last: number,
  uPrime: number[],
  tHat1: Vector2,
  tHat2: Vector2
): CubicSegment {
  const p0 = points[first];
  const p3 = points[last];

  // Build A matrix: Bernstein basis scaled by tangents
  const A: [Vector2, Vector2][] = [];
  for (let i = 0; i < nPts; i++) {
    const u = uPrime[i];
    A.push([vec2.multiply(tHat1, bernstein1(u)), vec2.multiply(tHat2, bernstein2(u))]);
  }

  // Solve 2x2 system for alpha_l, alpha_r
  // (the distances along tangent directions for control points)
  const det = C[0][0] * C[1][1] - C[0][1] * C[1][0];
  let alphaL, alphaR;

  if (Math.abs(det) > EPSILON) {
    alphaL = (C[1][1] * X[0] - C[0][1] * X[1]) / det;
    alphaR = (C[0][0] * X[1] - C[1][0] * X[0]) / det;
  } else {
    alphaL = alphaR = vec2.distance(p0, p3) / 3;
  }

  const p1 = vec2.add(p0, vec2.multiply(tHat1, alphaL));
  const p2 = vec2.add(p3, vec2.multiply(tHat2, alphaR));

  return { p0, p1, p2, p3 };
}
```

The key insight: the endpoints (`p0`, `p3`) and tangent directions (`tHat1`, `tHat2`) are fixed. The only unknowns are `alphaL` and `alphaR` — how far along those tangent directions the control points should be. This reduces the curve fitting to a 2x2 linear system, which has a closed-form solution via Cramer's rule. When the determinant is near zero (collinear tangents), the fallback of `distance / 3` produces a reasonable curve.

### Phase 3: Reparameterization

The initial parameterization is based on straight-line chord lengths, but the optimal parameterization depends on the actual curve — which depends on the parameterization. This chicken-and-egg problem is resolved iteratively using Newton-Raphson refinement:

```typescript
function reparameterize(
  points: Vector2[],
  first: number,
  last: number,
  u: number[],
  bezCurve: CubicSegment
): number[] {
  const uPrime: number[] = [];

  for (let i = 0; i < nPts; i++) {
    const qU = bezier.cubicPoint(/* curve at u[i] */);
    const qPrime = bezier.cubicDerivative(/* first derivative */);
    const qPrimePrime = bezier.cubicSecondDerivative(/* second derivative */);

    const diff = vec2.subtract(qU, points[first + i]);
    const numerator = vec2.dot(diff, qPrime);
    const denominator = vec2.dot(qPrime, qPrime) + vec2.dot(diff, qPrimePrime);

    if (Math.abs(denominator) > EPSILON) {
      uPrime.push(Math.max(0, Math.min(1, u[i] - numerator / denominator)));
    } else {
      uPrime.push(u[i]);
    }
  }

  return uPrime;
}
```

Each point's parameter is adjusted to minimize its distance to the curve. The formula is Newton's method applied to the function "distance from point to curve as a function of parameter" — the numerator is the first-order error term and the denominator includes the second-order correction. The `clamp(0, 1)` prevents parameters from escaping the valid range.

Up to 4 iterations of reparameterization are attempted. Each iteration produces a better parameterization, which produces a better curve, which produces a better parameterization. In practice, 2-3 iterations are enough for convergence.

### Phase 4: Subdivision

If after reparameterization the maximum error still exceeds the threshold, the algorithm splits the point sequence at the worst-fitting point and recurses:

```typescript
if (depth >= MAX_DEPTH) {
  result.push(bezCurve); // bail
  return;
}

const tHatCenter = computeCenterTangent(points, splitPoint);
fitCubic(points, first, splitPoint, tHat1, tHatCenter, error, result, depth + 1);
fitCubic(points, splitPoint, last, vec2.multiply(tHatCenter, -1), tHat2, error, result, depth + 1);
```

The split produces two sub-problems. The tangent at the split point is computed from the neighboring points, and the two halves get opposite tangent directions (the negative ensures G1 continuity — the curves join smoothly). Each half is fitted independently, possibly splitting further. A depth limit of 20 prevents pathological recursion on noisy data.

### Conversion to PathPoints

The Schneider algorithm outputs `CubicSegment[]` — raw control point quadruples. The `curvesToPathPoints` function converts these to the `PathPoint[]` format used by the rest of the system:

```typescript
export function curvesToPathPoints(curves: CubicSegment[]): PathPoint[] {
  const pathPoints: PathPoint[] = [];

  for (let i = 0; i < curves.length; i++) {
    const seg = curves[i];

    if (i === 0) {
      const handleOut = vec2.subtract(seg.p1, seg.p0);
      pathPoints.push({
        position: { ...seg.p0 },
        handleIn: null,
        handleOut: vec2.length(handleOut) > EPSILON ? handleOut : null,
        type: 'smooth',
      });
    }

    const handleIn = vec2.subtract(seg.p2, seg.p3);
    if (i < curves.length - 1) {
      const nextSeg = curves[i + 1];
      const handleOut = vec2.subtract(nextSeg.p1, nextSeg.p0);
      pathPoints.push({
        position: { ...seg.p3 },
        handleIn: vec2.length(handleIn) > EPSILON ? handleIn : null,
        handleOut: vec2.length(handleOut) > EPSILON ? handleOut : null,
        type: 'smooth',
      });
    } else {
      pathPoints.push({
        position: { ...seg.p3 },
        handleIn: vec2.length(handleIn) > EPSILON ? handleIn : null,
        handleOut: null,
        type: 'smooth',
      });
    }
  }

  return pathPoints;
}
```

Adjacent Bezier segments share endpoints — the `p3` of segment _i_ is the `p0` of segment _i+1_. The conversion merges these shared points, taking the `handleIn` from the ending segment and the `handleOut` from the starting segment. The result is a chain of smooth path points, each with incoming and outgoing Bezier handles.

## From Spine to Outline

The Schneider algorithm produces the _centerline_ of the brush stroke — the path that the cursor traced. But a brush stroke has width. The tool needs to convert this spine curve into a closed outline polygon that can be filled.

`generateBrushOutline` does this in four steps.

### Step 1: Tessellate and Resample

The spine path is tessellated into a dense polyline, then resampled at uniform arc-length intervals:

```typescript
const tessellated = tessellatePathToPoints(spinePoints, false, 0.5);
const totalLength = computePolylineLength(tessellated);
const step = totalLength / (sampleCount - 1);
```

The uniform resampling is critical. Raw tessellation produces points clustered at curves and sparse on straight segments. Uniform spacing ensures the outline has consistent density everywhere, preventing visual artifacts where the outline is jagged on straight segments and smooth on curves.

### Step 2: Interpolate Widths

Each sample needs a width. The original `widths` array has one entry per raw input point, but the resampled spine has a different number of samples. Linear interpolation maps the original widths to the new sample positions:

```typescript
const widthT = t * (widths.length - 1);
const wLo = Math.floor(widthT);
const wHi = Math.min(wLo + 1, widths.length - 1);
const wFrac = widthT - wLo;
let w = widths[wLo] + wFrac * (widths[wHi] - widths[wLo]);
```

When the user varies pressure during a stroke, the width changes along the path. The interpolation produces smooth width transitions even though the original samples were captured at irregular intervals.

### Step 3: Perpendicular Offsets

For each sample, the algorithm computes a perpendicular direction from the averaged tangent of the neighboring points, then offsets left and right by half the width:

```typescript
for (let i = 0; i < samples.length; i++) {
  const prev = i > 0 ? samples[i - 1] : null;
  const next = i < samples.length - 1 ? samples[i + 1] : null;

  let dx = 0,
    dy = 0;
  if (prev && next) {
    dx = next.x - prev.x;
    dy = next.y - prev.y;
  } else if (next) {
    dx = next.x - curr.x;
    dy = next.y - curr.y;
  } else if (prev) {
    dx = curr.x - prev.x;
    dy = curr.y - prev.y;
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  let perpX, perpY;
  if (len < 0.001) {
    perpX = lastPerpX; // Reuse last valid perpendicular
    perpY = lastPerpY;
  } else {
    perpX = -dy / len;
    perpY = dx / len;
    lastPerpX = perpX;
    lastPerpY = perpY;
  }

  const halfWidth = Math.max(sampleWidths[i] / 2, 0.5);
  leftSide.push({ x: curr.x + perpX * halfWidth, y: curr.y + perpY * halfWidth });
  rightSide.push({ x: curr.x - perpX * halfWidth, y: curr.y - perpY * halfWidth });
}
```

The perpendicular of `(dx, dy)` is `(-dy, dx)`, normalized. The `lastPerpX/Y` fallback handles degenerate cases where two consecutive samples are at the same position — without it, the perpendicular would be `(0, 0)`, producing zero-width strokes and `NaN` values that propagate silently through subsequent math.

The `0.5` minimum half-width prevents completely invisible strokes at near-zero pressure. Even the lightest touch produces a 1-unit-wide line.

### Step 4: Close the Outline

The left side runs forward, the right side runs backward, and round caps optionally bridge the ends:

```typescript
// Left side forward
for (const p of leftSide) outline.push(cornerPoint(p));

// End cap (only for narrow ends)
if (endWidth < capThreshold) {
  const endCap = generateRoundCap(/* ... */);
  for (const p of endCap) outline.push(cornerPoint(p));
}

// Right side reversed
for (let i = rightSide.length - 1; i >= 0; i--) {
  outline.push(cornerPoint(rightSide[i]));
}
```

The result is a closed polygon: left edge forward, optional end cap, right edge backward, optional start cap. This polygon is used as the path node's `points` array with `closed: true` — it renders as a filled shape, producing the visual appearance of a variable-width stroke.

Round caps are only added at narrow ends (below 30% of the maximum stroke width). At wide ends, the flat connection between the left and right sides looks clean. At narrow tapered ends, a flat connection creates a visible blunt edge, so a semicircular cap smooths it.

## The Brush Pipeline: From Event to Node

The full pipeline ties together:

```typescript
onPointerDown(event: CanvasPointerEvent): void {
  this.isDrawing = true;

  // Initialize Kalman filter
  const params = smoothingToKalmanParams(this.options.smoothing);
  this.kalman = new KalmanFilter2D(params.processNoise, params.measurementNoise);

  // Reset pipeline state
  this.committedCurves = [];
  this.floatingPoints = [];
  this.allPoints = [];

  this.capturePoint(event);
  this.updatePreviewNode();
}

onPointerMove(event: CanvasPointerEvent): void {
  if (!this.isDrawing) return;

  this.capturePoint(event);

  if (this.floatingPoints.length >= COMMIT_THRESHOLD) {
    this.commitFloatingPoints();
  }

  this.updatePreviewNode();
}
```

The `floatingPoints` buffer accumulates points during the stroke. When it reaches the `COMMIT_THRESHOLD` (12 points), the front portion is committed via Schneider fitting, keeping the last 3 points as overlap for the next batch. This incremental fitting prevents the algorithm from processing the entire stroke on every mouse move — it only fits the new segment. The overlap ensures the junction between committed and uncommitted segments is smooth.

On pointer up, a final Schneider fit runs on _all_ accumulated points, not just the floating buffer. This produces a higher-quality result than the incremental fits because the algorithm can optimize the entire path holistically:

```typescript
private finalizeStroke(): void {
  if (this.allPoints.length < 2) { this.cancelStroke(); return; }

  const positions = this.allPoints.map(p => p.position);
  const widths = this.allPoints.map(p => p.width);
  const curves = schneiderFitCurve(positions, SCHNEIDER_ERROR);
  const pathPoints = curvesToPathPoints(curves);

  const node = this.createPathNode(pathPoints, widths);
  centerPathNodeGeometry(node);

  this.context.onTransformStart?.();
  this.context.sceneGraph.addNode(node);
  this.context.setSelectedIds([node.id]);
  this.context.setActiveTool('selection');
  this.resetBrushState();
}
```

The preview uses a looser error threshold (`SCHNEIDER_ERROR * 2`) for speed — during the drag, the preview updates every frame and doesn't need pixel-perfect accuracy. The final fit uses the strict threshold for a clean result.

### BrushData: Remembering the Spine

The committed node stores `brushData` alongside the outline:

```typescript
brushData: {
  spine: spinePoints.map(p => ({ ...p, position: { ...p.position } })),
  widths: [...widths],
  profileId: null,
}
```

The outline points define the visible shape, but they're derived from the spine and widths. Storing the originals enables non-destructive editing: the user can later change the brush profile (the width envelope) and the outline regenerates from the original spine data. Without `brushData`, changing the profile would require reverse-engineering the spine from the outline — a lossy operation.

## The Eraser: Boolean Subtraction

The eraser tool operates in two modes. **Point mode** is simple — it finds path points near the cursor and deletes them. **Stroke mode** is the interesting one: it accumulates a freehand stroke, generates a closed outline from it, and boolean-subtracts that outline from every overlapping shape.

### Accumulating the Stroke

The eraser's stroke accumulation is simpler than the brush tool's — no Kalman filter, no curve fitting. It just collects world-space positions with a minimum distance filter:

```typescript
onPointerMove(event: CanvasPointerEvent): void {
  if (!this.isErasing) return;

  if (this.options.mode === 'stroke') {
    const minDist = Math.max(
      EraserTool.MIN_POINT_DIST,
      (this.options.size * 0.1) / this.context.camera.zoom
    );
    const last = this.strokePoints[this.strokePoints.length - 1];
    if (vec2.distance(last, event.worldPosition) >= minDist) {
      this.strokePoints.push({ ...event.worldPosition });
    }
  }
}
```

No smoothing is needed because the eraser outline doesn't need to look smooth — it just needs to approximate the area the user swept. The minimum distance scales with eraser size: larger erasers need fewer points because small position differences are negligible relative to the eraser width.

### Generating the Eraser Outline

On pointer up, the accumulated points become a closed outline using the same `generateBrushOutline` function as the brush tool:

```typescript
private generateEraserOutline(): PathPoint[] | null {
  const eraserRadius = this.options.size / this.context.camera.zoom;

  if (this.strokePoints.length < 2) {
    // Single click: circle subtraction
    const center = this.strokePoints[0];
    if (!center) return null;
    return createPolygonPath(center.x, center.y, eraserRadius, 24);
  }

  const spine = this.strokePoints.map(p => cornerPoint(p));
  const diameter = 2 * eraserRadius;
  const widths = Array(spine.length).fill(diameter);

  return generateBrushOutline(spine, widths);
}
```

For a single click (no drag), the eraser creates a 24-sided polygon — essentially a circle. For a drag, it generates a uniform-width outline from the accumulated stroke points. The width is constant (the eraser has no pressure sensitivity), so all entries in the `widths` array are identical.

### The Subtraction Pass

The core of the eraser is `finalizeStrokeErase`, which iterates over every visible shape in the scene graph and subtracts the eraser outline from each:

```typescript
private finalizeStrokeErase(): void {
  const outline = this.generateEraserOutline();
  if (!outline || outline.length < 3) return;

  const eraserPoly = this.buildEraserMultiPolygon(outline);
  if (!eraserPoly) return;

  const eraserAABB = this.computeOutlineAABB(outline);

  // Collect candidates (don't modify during traversal)
  const candidates: Array<{ node: Node; parentId: string | null; index: number }> = [];

  this.context.sceneGraph.traverseVisible((node) => {
    if (node.type !== 'path' && node.type !== 'rectangle' &&
        node.type !== 'ellipse' && node.type !== 'polygon') return;
    if (node.locked) return;
    if (node.type === 'path' && !node.closed) return;
    candidates.push({ node, parentId, index });
  });

  for (const { node, parentId, index } of candidates) {
    // AABB quick rejection
    const nodeAABB = this.computeNodeWorldAABB(node, worldMatrix);
    if (/* AABBs don't overlap */) continue;

    // Boolean subtract
    const shapePoly = nodeToPolygon(node, worldMatrix);
    const result = performBoolean(shapePoly, eraserPoly, 'subtract');

    if (!result || result.length === 0) {
      // Shape fully erased — remove it
      this.context.sceneGraph.removeNode(node.id);
      continue;
    }

    // Create replacement PathNode from boolean result
    const contours = polygonToContours(result);
    const resultNode = createBooleanResultNode(contours, fills, strokes, ...);
    resultNode.opacity = node.opacity;
    resultNode.blendMode = node.blendMode;

    // Replace in scene graph at same position
    this.context.sceneGraph.removeNode(node.id);
    this.context.sceneGraph.addNode(resultNode, parentId);
    this.context.sceneGraph.moveNode(resultNode.id, parentId, index);
  }
}
```

Several important design decisions:

**Candidates are collected before mutation.** The traversal collects all candidate nodes into an array, then the mutation loop processes them. This prevents the classic bug of modifying a collection during iteration — removing a node during traversal would skip subsequent siblings or visit invalid indices.

**AABB quick rejection skips most shapes.** Before running the expensive boolean operation, the eraser checks whether the node's world-space bounding box overlaps the eraser's bounding box. For a canvas with 100 shapes, the eraser typically only touches 2-3 — the AABB test skips the other 97+ without any polygon math.

**Fully erased shapes are removed.** If the boolean result is empty, the shape was entirely inside the eraser stroke. The node is deleted from the scene graph rather than replaced with a zero-area path.

**Replacement preserves identity.** The new PathNode inherits the original's fills, strokes, opacity, and blend mode. It's placed at the same index in its parent, so the z-order doesn't change. The selection is updated to map old IDs to new IDs, so if the user had the erased shape selected, the replacement stays selected.

**Grouped nodes need coordinate conversion.** If the original node had a parent (was inside a group), the boolean result is in world space, but the replacement node needs local-space coordinates. An inverse parent transform converts the position.

### Lazy Undo

The eraser uses a lazy undo pattern:

```typescript
private ensureUndo(): void {
  if (!this.undoPushed) {
    this.context.onTransformStart?.();
    this.undoPushed = true;
  }
}
```

The undo snapshot is pushed on the _first actual mutation_, not on pointer down. If the user makes an eraser stroke that doesn't overlap any shapes, no undo entry is created. This prevents empty undo entries from cluttering the history.

### The Preview

During the stroke, a semi-transparent red preview shows what area will be erased:

```typescript
getPreviewNode(): PathNode | null {
  if (this.options.mode !== 'stroke' || !this.isErasing) return null;

  const outline = this.generateEraserOutline();
  if (!outline || outline.length < 3) return null;

  return {
    id: '__eraser-preview__',
    name: 'Eraser Preview',
    type: 'path',
    // ...
    opacity: 0.3,
    points: outline,
    closed: true,
    fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
    strokes: [],
  };
}
```

The preview node uses a hardcoded red fill at 30% opacity — a universal visual convention for "this area will be affected." It's regenerated from the current stroke points every frame, using the same `generateEraserOutline` that the final subtraction uses. The preview is exactly the shape that will be subtracted.

### Point Mode

Point mode is the simpler eraser mode. It doesn't subtract — it deletes individual path points that fall within the eraser radius:

```typescript
private erasePoints(worldPos: Vector2, radius: number): void {
  const pathsToUpdate: Map<string, PathNode> = new Map();
  const pathsToRemove: string[] = [];

  this.context.sceneGraph.traverse((node) => {
    if (node.type !== 'path') return;

    const worldMatrix = this.context.sceneGraph.getWorldTransform(node.id);

    const pointsToKeep: number[] = [];
    for (let i = 0; i < pathNode.points.length; i++) {
      const worldPoint = mat3.transformPoint(worldMatrix, point.position);
      if (vec2.distance(worldPoint, worldPos) > radius) {
        pointsToKeep.push(i);
      }
    }

    if (pointsToKeep.length < pathNode.points.length) {
      if (pointsToKeep.length < 2) {
        pathsToRemove.push(pathNode.id);
      } else {
        pathsToUpdate.set(pathNode.id, {
          ...pathNode,
          points: pointsToKeep.map(i => pathNode.points[i]),
          closed: pathNode.closed && pointsToKeep.length === pathNode.points.length,
        });
      }
    }
  });
}
```

Points are tested in world space — the transform chain is applied before distance comparison. This ensures the eraser works correctly on rotated, scaled, or nested shapes. If fewer than 2 points survive, the entire path is removed (a single point isn't a valid path). If any points are removed from a closed path, the path becomes open — you can't close a polygon that's had a vertex removed.

Point mode runs on every `pointerMove` during the drag, not just on release. This gives immediate feedback as the user paints over points with the eraser.

## Lessons

**Compose simple pipeline stages rather than building one complex algorithm.** The brush tool chains Kalman filter, distance filter, Schneider fitting, outline generation, and path centering. Each stage is independent, testable, and replaceable. The pipeline's quality comes from composition, not from any single clever algorithm.

**Map perceptual controls to parameters logarithmically.** The smoothing slider (0-100) maps to Kalman noise parameters via `Math.pow(10, ...)`. Human perception of smoothing is roughly logarithmic — a linear mapping would cluster all the perceptible change in the last 10% of the slider. Logarithmic mapping distributes perceptual change evenly across the range.

**Defensive pressure handling prevents silent NaN propagation.** Mouse devices report pressure 0, synthetic events may report null or undefined, and stylus tablets report 0-1. A three-way guard (`null`, zero, valid) with a 0.5 fallback prevents any path through the code from producing NaN, which would propagate silently through all subsequent math and produce invisible shapes.

**Store the original spine alongside the derived outline for non-destructive editing.** The BrushData on each brush stroke preserves the raw spine points and per-point widths. Changing the brush profile later regenerates the outline from the originals. Without this, changing the profile would require reverse-engineering the spine from the outline — a lossy operation that degrades with each edit.

**Boolean subtraction turns a destructive operation into a constructive one.** The eraser doesn't delete pixels or remove shapes — it generates a closed polygon from the stroke and subtracts it from every overlapping shape using the same boolean operations as the menu-bar boolean tools. The result is a new PathNode that inherits the original's visual properties, preserving the vector workflow.

**Push the undo snapshot on first mutation, not on pointer down.** The eraser's lazy undo pattern only creates a history entry when the stroke actually modifies something. An eraser drag over empty canvas produces no undo entry, preventing the history from filling with no-ops.

## What We Built

This chapter covered two tools with contrasting architectures — about 900 lines total, plus 600 lines of supporting algorithms:

- **Kalman filter**: A constant-velocity 1D filter (X/Y independent), mapping a 0-100 smoothing slider to logarithmic process/measurement noise parameters. Stabilizes noisy pointer input without visible lag.
- **Distance filter**: Minimum `2/zoom` pixel spacing prevents redundant samples that would waste curve fitting effort.
- **Schneider's algorithm**: Recursive cubic Bezier fitting with chord-length parameterization, least-squares generation, Newton-Raphson reparameterization, and subdivide-at-worst-error recursion. Converts hundreds of raw points into a handful of optimal Bezier segments.
- **`generateBrushOutline`**: Tessellate spine, resample uniformly, interpolate per-point widths, compute perpendicular offsets, close with optional round caps. Converts a centerline path to a filled polygon.
- **BrushData**: Stores the original spine and widths for non-destructive profile editing later.
- **Eraser stroke mode**: Accumulates a freehand stroke, generates a uniform-width outline, boolean-subtracts from every overlapping visible/unlocked shape. AABB quick rejection, lazy undo, world-space coordinate conversion for grouped nodes.
- **Eraser point mode**: Deletes individual path points within the eraser radius, running on every pointer move for immediate feedback.
- **Pressure sensitivity**: Guards against null, zero, and undefined pressure values. Maps to configurable min/max range. Pre-computes per-point width at capture time.

The brush tool's pipeline — Kalman → distance filter → Schneider → outline → center — is the most sophisticated signal processing in the editor. But each stage is independent and testable: the Kalman filter knows nothing about curves, Schneider knows nothing about pressure, and the outline generator knows nothing about input devices. The pipeline's power comes from composing simple stages, not from any single complex algorithm.

The next chapter introduces the selection tool, which is arguably more complex than any creation tool — not because of signal processing, but because it must handle clicking, marquee selection, moving, resizing, and rotating, all with different behavior depending on what's under the cursor and which modifier keys are held.
