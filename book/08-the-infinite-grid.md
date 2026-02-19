# The Infinite Grid

## Why the Grid Matters

Open any professional design tool — Figma, Illustrator, After Effects — and you see a grid. It's subtle. Thin gray lines against a dark background, barely visible until you need them. You probably don't think about it. But take it away, and the canvas feels empty, directionless, unmoored. You lose your sense of scale, your sense of position, your sense of "is this shape the right size?"

The grid is the simplest feature in a graphic editor and one of the most important for how the tool _feels_. It provides spatial context, visual rhythm, and implied precision. It tells the user: this is a structured workspace, not a blank void.

Building a grid sounds trivial. Draw some lines. But the details matter: the lines have to scale with zoom so they're always readable, the spacing has to adapt so you don't get a solid wall of gray at low zoom or invisible lines at high zoom, and it all has to render before everything else so shapes paint on top.

This chapter builds a `Grid` class — about 330 lines of code — that handles all of this with a single shader, two buffers, and one draw call per frame.

## Grid Configuration

The grid has three visual tiers:

```typescript
export interface GridConfig {
  majorSpacing: number; // world units between major lines
  minorDivisions: number; // minor lines between majors
  minorColor: [number, number, number, number]; // subtle, barely visible
  majorColor: [number, number, number, number]; // slightly brighter
  axisColor: [number, number, number, number]; // brightest, marks origin
  lineWidth: number;
}
```

The default configuration uses dark gray values that read clearly against the `#1A1A1A` canvas background without competing with the user's content:

```typescript
const DEFAULT_CONFIG: GridConfig = {
  majorSpacing: 100,
  minorDivisions: 5,
  minorColor: [0.15, 0.15, 0.15, 1.0], // #262626
  majorColor: [0.2, 0.2, 0.2, 1.0], // #333333
  axisColor: [0.3, 0.3, 0.3, 1.0], // #4D4D4D
  lineWidth: 1,
};
```

With `majorSpacing: 100` and `minorDivisions: 5`, you get major lines every 100 world units and minor lines every 20 world units. The axis lines at `x = 0` and `y = 0` are brighter still — they mark the world origin, which is useful when you're working with coordinate-sensitive features like snapping or export.

## The Adaptive Spacing Algorithm

The fundamental problem with a fixed grid is zoom. At zoom 1, 100-unit major spacing looks fine — major lines appear every 100 screen pixels. Zoom out to 0.1 and those same lines are 10 screen pixels apart — a dense, unreadable mesh. Zoom in to 10 and they're 1000 screen pixels apart — effectively invisible.

The solution is adaptive spacing. As the user zooms, the grid spacing doubles or halves to keep lines within a readable range:

```typescript
const MIN_SCREEN_SPACING = 50;  // pixels — don't crowd closer than this
const MAX_SCREEN_SPACING = 200; // pixels — don't spread wider than this

private calculateAdaptiveSpacing(baseSpacing: number, zoom: number): number {
  let spacing = baseSpacing;

  // Scale up if lines are too close together
  while (spacing * zoom < MIN_SCREEN_SPACING) {
    spacing *= 2;
  }

  // Scale down if lines are too far apart
  while (spacing * zoom > MAX_SCREEN_SPACING) {
    spacing /= 2;
  }

  return spacing;
}
```

This is a logarithmic scale. Each doubling or halving of zoom triggers a doubling or halving of spacing, so the apparent density stays within a 4:1 range (50-200 screen pixels). The transitions are crisp — the grid snaps to new spacing levels rather than smoothly interpolating. This is intentional. A smooth transition would mean the grid is constantly shifting, which is distracting. A snap is imperceptible because it happens _during_ the zoom gesture, while the entire canvas is already in motion.

Let's trace through an example. With `majorSpacing = 100`:

| Zoom | `spacing * zoom` | Action       | Effective Spacing |
| ---- | ---------------- | ------------ | ----------------- |
| 0.1  | 10 < 50          | Double twice | 400               |
| 0.3  | 30 < 50          | Double once  | 200               |
| 0.5  | 50 ≥ 50          | No change    | 100               |
| 1.0  | 100              | No change    | 100               |
| 2.0  | 200              | No change    | 100               |
| 3.0  | 300 > 200        | Halve once   | 50                |
| 5.0  | 250 > 200        | Halve once   | 50                |
| 10.0 | 500 > 200        | Halve twice  | 25                |

At zoom 0.1, the grid shows lines every 400 world units — wide enough to be readable across a panoramic view of the canvas. At zoom 10, it shows lines every 25 world units — fine enough for precise work. The user never has to think about this. The grid just always looks right.

## The Grid Shader

The grid uses its own minimal shader program — separate from the shape renderer's shaders. Each line has a position and a color, both set per-vertex:

```glsl
#version 300 es
precision highp float;

in vec2 a_position;
in vec4 a_color;

uniform mat3 u_viewProjection;

out vec4 v_color;

void main() {
  vec3 pos = u_viewProjection * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_color = a_color;
}
```

```glsl
#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
```

No model matrix. Grid lines live directly in world space — they don't belong to any node, so there's no local-to-world transform. The view-projection matrix handles everything: converting from world coordinates to the -1..+1 clip space that WebGL maps to the viewport.

The color is a per-vertex attribute rather than a uniform. This means each line can have a different color — minor, major, or axis — without separate draw calls. One `gl.drawArrays(gl.LINES, ...)` renders the entire grid.

## Generating Grid Lines

The `render` method generates fresh line geometry every frame. This sounds expensive, but the data is small (a few hundred lines at most) and the generation is a tight arithmetic loop with no allocations. Pre-allocated `Float32Array` buffers avoid garbage collection:

```typescript
export class Grid {
  private vertices: Float32Array;
  private colors: Float32Array;
  private maxLines: number = 2000;

  constructor(renderer: WebGLRenderer, config: Partial<GridConfig> = {}) {
    // Pre-allocate: 4 floats per line (2 vertices × 2 coords)
    this.vertices = new Float32Array(this.maxLines * 4);
    // Pre-allocate: 8 floats per line (2 vertices × 4 color components)
    this.colors = new Float32Array(this.maxLines * 8);

    this.initializeShaders();
    this.initializeBuffers();
  }
```

The buffers are allocated once at construction with `gl.DYNAMIC_DRAW` — telling the GPU driver these buffers will be updated frequently. Each frame, `bufferSubData` overwrites just the portion that's in use, without reallocating:

```typescript
gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, lineCount * 4));

gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors.subarray(0, lineCount * 8));
```

### The Generation Loop

The `generateGridLines` method fills the pre-allocated arrays with vertex positions and colors. The approach is straightforward: iterate over the visible range at the minor spacing interval, classify each line, and write vertex data.

```typescript
private generateGridLines(
  bounds: Rect, majorSpacing: number, minorSpacing: number
): number {
  const { minorColor, majorColor, axisColor } = this.config;

  let vertexIndex = 0;
  let colorIndex = 0;
  let lineCount = 0;

  // Expand bounds to catch edge lines
  const padding = majorSpacing;
  const left = bounds.x - padding;
  const right = bounds.x + bounds.width + padding;
  const top = bounds.y - padding;
  const bottom = bounds.y + bounds.height + padding;

  // Snap to grid
  const startX = Math.floor(left / minorSpacing) * minorSpacing;
  const endX = Math.ceil(right / minorSpacing) * minorSpacing;
  const startY = Math.floor(top / minorSpacing) * minorSpacing;
  const endY = Math.ceil(bottom / minorSpacing) * minorSpacing;
```

The bounds come from the camera's `getVisibleBounds()` — the rectangle of world space that's currently on screen. Padding by one major spacing ensures lines at the viewport edge don't pop in and out as the user pans. Snapping the start and end to the grid ensures lines are always at exact grid positions.

For each position, the line type is determined by a simple modulo test:

```typescript
// Vertical lines
for (let x = startX; x <= endX; x += minorSpacing) {
  if (lineCount >= this.maxLines) break;

  let color: [number, number, number, number];
  if (Math.abs(x) < 0.001) {
    color = axisColor;
  } else if (Math.abs(x % majorSpacing) < 0.001) {
    color = majorColor;
  } else {
    color = minorColor;
  }

  this.vertices[vertexIndex++] = x;
  this.vertices[vertexIndex++] = top;
  this.vertices[vertexIndex++] = x;
  this.vertices[vertexIndex++] = bottom;

  for (let i = 0; i < 2; i++) {
    this.colors[colorIndex++] = color[0];
    this.colors[colorIndex++] = color[1];
    this.colors[colorIndex++] = color[2];
    this.colors[colorIndex++] = color[3];
  }

  lineCount++;
}
```

Each line is two vertices — a start and an end — that span the full visible height (for vertical lines) or width (for horizontal lines). The `0.001` tolerance in the floating-point comparison handles rounding errors that accumulate when stepping through grid positions.

The horizontal line loop is identical in structure, just oriented along the other axis.

The `maxLines` cap (2000) is a safety valve. With adaptive spacing, the line count stays well within this limit during normal use. But if something goes wrong — say, the visible bounds are miscalculated to be enormous — the cap prevents the generation loop from running away and freezing the render.

## Buffer Layout

The grid uses two separate WebGL buffers: one for positions, one for colors. This is a design choice worth discussing.

The alternative is an interleaved buffer — position and color packed together per vertex. Interleaved buffers can be more efficient for the GPU because the data for each vertex is contiguous in memory (better cache locality). But for the grid, the advantages of separate buffers outweigh this:

1. **Simpler fill logic.** Writing positions and colors independently in the generation loop avoids computing byte offsets. The position array is just `[x, y, x, y, ...]` and the color array is just `[r, g, b, a, r, g, b, a, ...]`.

2. **The grid is tiny.** A few hundred lines produce a few kilobytes of data. Cache locality doesn't matter at this scale.

3. **The grid is transient.** The entire buffer is regenerated every frame. There's no caching to optimize.

The VAO binds both buffers with their attribute pointers:

```typescript
private initializeBuffers(): void {
  const gl = this.renderer.context;

  this.vao = this.renderer.createVAO();
  this.renderer.bindVAO(this.vao);

  // Position buffer
  this.vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(this.program.attributes.a_position);
  gl.vertexAttribPointer(this.program.attributes.a_position, 2, gl.FLOAT, false, 0, 0);

  // Color buffer
  this.colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, this.colors.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(this.program.attributes.a_color);
  gl.vertexAttribPointer(this.program.attributes.a_color, 4, gl.FLOAT, false, 0, 0);

  this.renderer.bindVAO(null);
}
```

After this setup, rendering is a matter of updating the buffer contents and issuing one draw call. The VAO remembers the attribute configuration, so there's no per-frame setup cost.

## Render Order

The grid renders _first_, immediately after clearing the canvas:

```typescript
// In the render loop (Canvas.tsx)
renderer.clear(); // dark gray background

grid.render(viewProjectionMatrix, visibleBounds, zoom); // 1. grid (behind everything)

shapeRenderer.render(sceneGraph, viewProjectionMatrix); // 2. shapes (on top)

// ... overlays, selections, rulers, guides (on top of shapes)
```

This paint order means the grid is behind every shape, which is the correct visual hierarchy. The grid is spatial context, not content. If shapes rendered behind the grid, the gray lines would cross over fills and strokes, creating a distracting interference pattern.

No depth buffer or z-sorting is needed. WebGL's default behavior is painter's algorithm — later draw calls paint over earlier ones. By drawing the grid first, shapes naturally occlude it.

## The Complete Render Method

Putting it all together:

```typescript
render(viewProjectionMatrix: Matrix3, visibleBounds: Rect, zoom: number): void {
  if (!this.program || !this.vao) return;

  const gl = this.renderer.context;

  // Adapt spacing to zoom level
  const { majorSpacing, minorDivisions } = this.config;
  const adaptiveSpacing = this.calculateAdaptiveSpacing(majorSpacing, zoom);
  const minorSpacing = adaptiveSpacing / minorDivisions;

  // Generate line vertices and colors
  const lineCount = this.generateGridLines(visibleBounds, adaptiveSpacing, minorSpacing);
  if (lineCount === 0) return;

  // Upload to GPU
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, lineCount * 4));

  gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors.subarray(0, lineCount * 8));

  // Draw
  this.renderer.useProgram(this.program);
  this.renderer.bindVAO(this.vao);
  gl.uniformMatrix3fv(
    this.program.uniforms.u_viewProjection,
    false,
    mat3.toFloat32Array(viewProjectionMatrix)
  );
  gl.drawArrays(gl.LINES, 0, lineCount * 2);
}
```

The critical flow: adaptive spacing → line generation → buffer upload → one draw call. The `lineCount * 2` in the draw call is because each line is two vertices, and `gl.LINES` interprets every consecutive pair as a line segment.

## Cleanup

Like all WebGL resources, the grid's buffers, VAO, and shader program must be explicitly deleted when the grid is no longer needed:

```typescript
dispose(): void {
  const gl = this.renderer.context;

  if (this.vertexBuffer) {
    gl.deleteBuffer(this.vertexBuffer);
    this.vertexBuffer = null;
  }
  if (this.colorBuffer) {
    gl.deleteBuffer(this.colorBuffer);
    this.colorBuffer = null;
  }
  if (this.vao) {
    gl.deleteVertexArray(this.vao);
    this.vao = null;
  }

  this.renderer.deleteProgram('grid');
  this.program = null;
}
```

Setting references to `null` after deletion prevents double-free bugs if `dispose()` is called more than once — which happens in React's StrictMode during development, where the cleanup function runs twice.

## What We Didn't Build

There are fancier approaches to grid rendering. Some editors use a full-screen shader that computes grid lines analytically in the fragment shader — no vertex generation needed. The fragment shader checks whether each pixel's world-space position is near a grid line and colors it accordingly. This produces perfect antialiased lines at any zoom level with no geometry at all.

We didn't do this for two reasons:

1. **Simplicity.** The vertex-based approach is straightforward to understand, debug, and modify. You can inspect the vertex arrays to see exactly what lines will be drawn. With an analytical shader, debugging requires understanding the math in the fragment shader and the interaction between world-space coordinates and pixel-space antialiasing.

2. **Performance is already fine.** Generating a few hundred lines per frame takes microseconds. The GPU draws them in a single call. There's no performance problem to solve. A fragment shader approach would save GPU memory (no vertex buffer) but add fragment shader complexity and per-pixel branching, which isn't free either.

If you want to experiment with the analytical approach later, the grid is a single self-contained class. You can swap the implementation without touching anything else.

## Lessons

**Adaptive spacing is a logarithmic scale, and the snap is a feature, not a limitation.** Doubling or halving the grid spacing at zoom thresholds keeps apparent density within a narrow range. Smooth transitions would cause the grid to visibly shift during every zoom gesture, which is distracting. A discrete snap is imperceptible because it happens while the entire canvas is already in motion.

**Per-vertex attributes eliminate draw calls for visual tiers.** Minor lines, major lines, and axis lines could each be a separate draw call with a different color uniform. Packing the color as a per-vertex attribute lets one `gl.drawArrays(gl.LINES, ...)` render all three tiers. For a simple system like the grid, this is the difference between three state changes and one.

**Pre-allocate transient buffers and refill them, never reallocate.** The grid regenerates vertex data every frame, but the `Float32Array` buffers are allocated once at construction with a generous `maxLines` cap. `bufferSubData` overwrites only the used portion. This avoids garbage collection pressure from frame-to-frame allocations — a pattern that matters more as the render loop grows.

**Separate buffers beat interleaved buffers when the data is small and transient.** Interleaved position+color buffers have better cache locality on the GPU, but the grid's few hundred lines produce only a few kilobytes. At this scale, the simpler fill logic of independent position and color arrays outweighs any cache benefit, and the data is regenerated every frame anyway.

**The simplest correct implementation is the right one when performance is already sufficient.** An analytical fragment shader grid — computing line proximity per pixel with no geometry — is more elegant. But the vertex-based approach takes an afternoon to understand, is trivial to debug by inspecting the vertex arrays, and runs in microseconds. Saving microseconds with a fancier approach would add complexity without solving a real problem.

## What We Built

This chapter covered the infinite grid — a small but essential piece of editor infrastructure:

- **Adaptive spacing**: Doubles or halves grid spacing with zoom to keep lines within 50-200 screen pixels apart
- **Three line tiers**: Minor (subtle), major (brighter), axis (brightest at origin)
- **Per-vertex color**: One draw call renders all line types via a per-vertex color attribute
- **Pre-allocated buffers**: `Float32Array` arrays allocated once, refilled every frame, uploaded with `bufferSubData`
- **Render-first order**: Grid draws behind all shapes, using painter's algorithm (no depth buffer)
- **Clean resource management**: Explicit `dispose()` with null guards for StrictMode safety

The next chapter adds texture and image rendering — displaying raster content inside a vector editor.
