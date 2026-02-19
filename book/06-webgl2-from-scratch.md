# WebGL 2 from Scratch

## Why No Framework

Three.js, Pixi.js, Babylon.js — these are excellent libraries. If you're building a game, a data visualization, or a 3D product configurator, use one. But for a 2D graphic editor, they're the wrong abstraction.

A graphic editor draws flat shapes — rectangles, ellipses, paths, text — in a coordinate space controlled by a camera. Every shape has a fill, maybe a stroke, maybe a gradient. Some have drop shadows or blend modes. The rendering is simple in concept but deeply specific in execution. You need precise control over what gets drawn, when, and how.

A framework abstracts that control away. Three.js gives you a scene graph (we already have one), a camera system (we already have one), a material system (we need custom shaders), and a render loop (we need to interleave rendering with effect compositing and overlay positioning). You'd spend more time fighting the framework's assumptions than you'd save from its abstractions.

WebGL 2 is a thin wrapper around the GPU. It's verbose, stateful, and unforgiving. But it gives you exactly the control you need: create shaders, upload geometry, set uniforms, draw triangles. Everything that happens is something you chose to make happen.

This chapter builds the foundation: a `WebGLRenderer` class that manages the WebGL context, caches state to avoid redundant GPU calls, compiles shaders, manages buffers and vertex array objects, and handles context loss gracefully. The next chapter will build a `ShapeRenderer` on top of it that actually turns vector shapes into pixels.

## Context Creation

Everything starts with getting a `WebGL2RenderingContext` from a canvas element:

```typescript
export interface WebGLRendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  alpha?: boolean;
  premultipliedAlpha?: boolean;
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  constructor(options: WebGLRendererOptions) {
    this.canvas = options.canvas;

    const contextAttributes: WebGLContextAttributes = {
      antialias: options.antialias ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      alpha: options.alpha ?? true,
      premultipliedAlpha: options.premultipliedAlpha ?? true,
      powerPreference: 'high-performance',
    };

    const gl = this.canvas.getContext('webgl2', contextAttributes);
    if (!gl) {
      throw new Error('WebGL 2 is not supported in this browser');
    }
    this.gl = gl;

    this.initializeState();
  }
}
```

Every option here is a deliberate choice.

**`antialias: true`** enables multisampled anti-aliasing. Without it, diagonal edges of shapes look jagged. The GPU handles this transparently — it renders to a higher-resolution buffer and downsamples. The performance cost is real but small for 2D rendering.

**`preserveDrawingBuffer: false`** is the default and the right choice for a render loop. The browser is allowed to discard the canvas contents after compositing, which enables optimization. The only time you need `true` is when you call `canvas.toBlob()` or `gl.readPixels()` outside the render loop — for example, when exporting a frame to PNG. We handle that by creating a separate offscreen canvas with `preserveDrawingBuffer: true` for export.

**`alpha: true`** means the canvas has an alpha channel. This matters for compositing the WebGL canvas over HTML elements (like background colors).

**`premultipliedAlpha: true`** means color values are pre-multiplied by their alpha. This is the GPU's native blending mode and avoids dark fringes around semi-transparent edges. It does mean you need to think about alpha correctly when compositing FBOs later (Chapter 10).

**`powerPreference: 'high-performance'`** asks the system to use the discrete GPU rather than the integrated one on laptops with two GPUs. For a graphic editor that renders continuously, this is the right trade-off.

### Initial State

After getting the context, we set the default GPU state:

```typescript
private initializeState(): void {
  const { gl } = this;

  // Enable blending for transparency
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  // Set clear color (dark background)
  gl.clearColor(0.102, 0.102, 0.102, 1.0); // #1A1A1A
}
```

`gl.BLEND` with `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` is the standard blending mode for 2D rendering with transparency. The output color is `srcColor * srcAlpha + dstColor * (1 - srcAlpha)`. A shape with 50% alpha blends equally with whatever's behind it.

Depth testing might seem odd for a 2D editor. We enable it because we'll use it later for z-ordering effects and FBO compositing. `LEQUAL` means "draw if the depth is less than or equal to the existing value," which handles overlapping shapes correctly when they're at the same depth.

The clear color is our dark editor background: `#1A1A1A` in hex, `(0.102, 0.102, 0.102, 1.0)` in normalized floats. WebGL works in 0-1 float ranges, not 0-255 integers.

## State Caching

WebGL is a state machine. When you call `gl.useProgram(program)`, that program stays active until you call `gl.useProgram` with a different one. Every subsequent draw call uses whatever program was last bound.

The problem is that switching state is expensive. Each `gl.useProgram` call forces the GPU driver to validate the new program, reconfigure the pipeline, and flush pending work. If you have 200 shapes and they all use the same shader, you don't want to call `gl.useProgram` 200 times. You want to call it once and draw all 200 shapes.

We solve this with state caching in the renderer:

```typescript
// State caching to avoid redundant GL calls
private currentProgram: WebGLProgram | null = null;
private currentVAO: WebGLVertexArrayObject | null = null;

useProgram(program: ShaderProgram): void {
  if (this.currentProgram !== program.program) {
    this.gl.useProgram(program.program);
    this.currentProgram = program.program;
  }
}

bindVAO(vao: WebGLVertexArrayObject | null): void {
  if (this.currentVAO !== vao) {
    this.gl.bindVertexArray(vao);
    this.currentVAO = vao;
  }
}
```

The pattern is simple: track what's currently bound, skip the call if it's the same. A reference equality check (`!==`) is O(1) and nearly free. The avoided GL call can save microseconds per shape, which adds up to milliseconds across hundreds of shapes.

This caching has one critical rule: **never bypass it**. If any code calls `gl.useProgram()` or `gl.bindVertexArray()` directly instead of going through `renderer.useProgram()` or `renderer.bindVAO()`, the cache becomes stale. The cache says program A is active, but the GPU is actually using program B. The next `renderer.useProgram(programA)` is a no-op (the cache thinks A is already bound), so the shapes render with the wrong shader.

We learned this the hard way with drop shadows. The `EffectRenderer` (Chapter 10) called `gl.bindVertexArray(quadVAO)` directly for its fullscreen composite pass. After effects rendered, the cache still thought the shape VAO was bound. Subsequent shapes rendered with no VAO — invisible. The fix was a one-line change: `this.renderer.bindVAO(quadVAO)` instead of `gl.bindVertexArray(quadVAO)`. But the debugging took hours.

**General rule**: never call `gl.useProgram`, `gl.bindVertexArray`, or any other state-setting GL function directly. Always go through the renderer's cached wrapper.

## Shader Compilation

A shader program consists of a vertex shader and a fragment shader, compiled from GLSL source code and linked together. The vertex shader transforms geometry positions; the fragment shader determines pixel colors.

Our renderer wraps the multi-step compilation process into a single method:

```typescript
createShaderProgram(
  name: string,
  vertexSource: string,
  fragmentSource: string,
  attributeNames: string[],
  uniformNames: string[]
): ShaderProgram {
  const { gl } = this;

  // Compile shaders
  const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

  // Link program
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create shader program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    throw new Error(`Shader program link error: ${error}`);
  }

  // Clean up individual shaders (they're baked into the program now)
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  // Get attribute locations
  const attributes: Record<string, number> = {};
  for (const attr of attributeNames) {
    attributes[attr] = gl.getAttribLocation(program, attr);
  }

  // Get uniform locations
  const uniforms: Record<string, WebGLUniformLocation> = {};
  for (const uniform of uniformNames) {
    const location = gl.getUniformLocation(program, uniform);
    if (location !== null) {
      uniforms[uniform] = location;
    }
  }

  const shaderProgram: ShaderProgram = { program, attributes, uniforms };
  this.programs.set(name, shaderProgram);

  return shaderProgram;
}
```

The `ShaderProgram` type bundles the raw `WebGLProgram` with its attribute and uniform locations:

```typescript
export interface ShaderProgram {
  program: WebGLProgram;
  attributes: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation>;
}
```

Why cache attribute and uniform locations? Because `gl.getAttribLocation` and `gl.getUniformLocation` are string lookups against the compiled shader. They're not expensive, but they allocate strings and do comparisons. Looking them up once at creation time and storing them in a plain object means every subsequent frame just does `program.uniforms.u_color` — a property access, not a GL call.

The `deleteShader` calls after linking are important. Once a shader is linked into a program, the individual shader objects are no longer needed. Deleting them frees GPU memory. Without this, you'd leak shader objects for every program you create.

### GLSL ES 3.0

We use GLSL ES 3.0, the shader language for WebGL 2, indicated by `#version 300 es` at the top of each shader. The differences from GLSL ES 1.0 (WebGL 1) are significant:

- `in`/`out` replace `attribute`/`varying`
- Fragment shaders use `out vec4 outColor` instead of writing to `gl_FragColor`
- Integer types, bitwise operations, texture arrays, and other features become available

Here's our simplest shader pair — flat-color shape rendering:

```glsl
// Vertex shader
#version 300 es
precision highp float;

in vec2 a_position;

uniform mat3 u_viewProjection;
uniform mat3 u_model;

void main() {
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
```

```glsl
// Fragment shader
#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 outColor;

void main() {
  outColor = u_color;
}
```

The vertex shader does one thing: transform a 2D position through two matrices. `u_model` converts from local space to world space (the shape's position, rotation, and scale). `u_viewProjection` converts from world space to clip space (the camera's view). We extend the 2D position to 3D with `vec3(a_position, 1.0)` — the `1.0` makes it a point (not a direction vector), so translations in the matrix take effect.

The fragment shader does one thing: output the uniform color for every pixel. Simple, but this shader handles every solid-colored fill and stroke in the editor.

The ShapeRenderer creates this program at initialization, along with programs for gradients and textures:

```typescript
private initializeShaders(): void {
  this.program = this.renderer.createShaderProgram(
    'shape',
    SHAPE_VERTEX_SHADER,
    SHAPE_FRAGMENT_SHADER,
    ['a_position'],
    ['u_viewProjection', 'u_model', 'u_color']
  );

  this.gradientProgram = this.renderer.createShaderProgram(
    'shape-gradient',
    GRADIENT_VERTEX_SHADER,
    GRADIENT_FRAGMENT_SHADER,
    ['a_position'],
    [
      'u_viewProjection', 'u_model', 'u_gradientType',
      'u_stopCount', 'u_bounds', 'u_angle', 'u_center',
      'u_radius', 'u_opacity', 'u_gradStart', 'u_gradEnd',
      // 16 stop colors + 16 stop offsets
      ...Array.from({ length: 16 }, (_, i) => `u_stops[${i}]`),
      ...Array.from({ length: 16 }, (_, i) => `u_offsets[${i}]`),
    ]
  );

  // ... texture program
}
```

By the end of initialization, the ShapeRenderer has compiled and linked 3 shader programs (flat, gradient, texture). At this stage, the editor uses 7 shader programs across all renderers (adding blur, blend, shadow, and composite from the EffectRenderer). Later chapters add 3 more for GPU skinning, bringing the final count to 10.

## The Vertex Array Object Pattern

A Vertex Array Object (VAO) captures the entire vertex attribute configuration: which buffers are bound, what format the data is in, which attributes are enabled. Without VAOs, you'd need to call `gl.bindBuffer`, `gl.vertexAttribPointer`, and `gl.enableVertexAttribArray` before every draw call. With VAOs, you configure once and bind the VAO before drawing.

```typescript
createVAO(): WebGLVertexArrayObject {
  const vao = this.gl.createVertexArray();
  if (!vao) {
    throw new Error('Failed to create VAO');
  }
  return vao;
}
```

The usage pattern in the ShapeRenderer:

```typescript
private initializeBuffers(): void {
  const gl = this.renderer.context;

  // Create VAO
  this.vao = this.renderer.createVAO();
  this.renderer.bindVAO(this.vao);

  // Create vertex buffer
  this.vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,
    this.vertices.byteLength, gl.DYNAMIC_DRAW);

  // Configure vertex attribute
  gl.enableVertexAttribArray(0); // a_position
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Create index buffer
  this.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
    this.indices.byteLength, gl.DYNAMIC_DRAW);

  // Unbind VAO
  this.renderer.bindVAO(null);
}
```

Everything between `bindVAO(this.vao)` and `bindVAO(null)` is recorded in the VAO. Later, to draw with this configuration, we just bind the VAO:

```typescript
this.renderer.bindVAO(this.vao);
// Upload new vertex data
gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
// Draw
gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
```

We use `DYNAMIC_DRAW` as the usage hint because shape geometry changes frequently — every time a shape is resized, moved, or deformed. The driver can use this hint to place the buffer in memory optimized for frequent updates. `STATIC_DRAW` would be better for geometry that never changes, like the grid.

### Multiple VAOs for Different Vertex Layouts

The ShapeRenderer has several VAOs because different rendering modes need different vertex layouts:

- **Shape VAO**: 2 floats per vertex (x, y) — for flat-color and gradient shapes
- **Texture VAO**: 4 floats per vertex (x, y, u, v) — for images with UV coordinates

Each VAO captures its own `vertexAttribPointer` layout. When it's time to draw an image, we bind the texture VAO and the GPU knows to read 4 floats per vertex with the right attribute mapping. When it's time to draw a regular shape, we bind the shape VAO and the GPU reads 2 floats per vertex.

## Buffer Management

The renderer provides named buffer creation and update:

```typescript
createBuffer(
  name: string,
  data: Float32Array | Uint16Array,
  itemSize: number,
  usage: number = this.gl.STATIC_DRAW
): BufferInfo {
  const { gl } = this;

  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Failed to create buffer');
  }

  const type = data instanceof Uint16Array
    ? gl.ELEMENT_ARRAY_BUFFER
    : gl.ARRAY_BUFFER;

  gl.bindBuffer(type, buffer);
  gl.bufferData(type, data, usage);

  const bufferInfo: BufferInfo = {
    buffer, type, usage, itemSize,
    numItems: data.length / itemSize,
  };

  this.buffers.set(name, bufferInfo);
  return bufferInfo;
}
```

The `BufferInfo` type tracks metadata alongside the raw buffer:

```typescript
export interface BufferInfo {
  buffer: WebGLBuffer;
  type: number; // ARRAY_BUFFER or ELEMENT_ARRAY_BUFFER
  usage: number; // STATIC_DRAW or DYNAMIC_DRAW
  itemSize: number; // floats per vertex (2 for positions, 4 for RGBA)
  numItems: number; // number of vertices
}
```

This is mainly used by the Grid renderer, which creates named buffers for its line geometry. The ShapeRenderer manages its own buffers directly (using `gl.createBuffer` and `gl.bufferSubData`) because it needs finer control over when and how data is uploaded — the tessellation cache determines whether to re-upload or reuse existing buffer contents.

## Setting Uniforms

Uniforms are per-draw-call values passed from JavaScript to shaders: the color of a shape, the model matrix, the view-projection matrix. The renderer provides a type-dispatching helper:

```typescript
setUniform(
  program: ShaderProgram,
  name: string,
  value: number | number[] | Float32Array
): void {
  const { gl } = this;
  const location = program.uniforms[name];
  if (!location) return;

  if (typeof value === 'number') {
    gl.uniform1f(location, value);
  } else if (value.length === 2) {
    gl.uniform2fv(location, value);
  } else if (value.length === 3) {
    gl.uniform3fv(location, value);
  } else if (value.length === 4) {
    gl.uniform4fv(location, value);
  } else if (value.length === 9) {
    gl.uniformMatrix3fv(location, false, value);
  } else if (value.length === 16) {
    gl.uniformMatrix4fv(location, false, value);
  }
}
```

The dispatch is based on array length: 2 floats → `vec2`, 3 → `vec3`, 4 → `vec4`, 9 → `mat3`, 16 → `mat4`. This covers every uniform type we use. The silent return on missing location (`if (!location) return`) is intentional — if a shader doesn't use a uniform (the compiler optimized it away), we don't want to crash.

In practice, the ShapeRenderer calls the `gl.uniform*` functions directly for hot paths (setting the model matrix and color for each shape), bypassing the type-dispatch overhead. The `setUniform` helper is for less performance-critical code like the Grid.

## The Viewport

The viewport maps clip space (-1 to +1) to actual pixels on the canvas. It needs to account for the device pixel ratio:

```typescript
setViewport(
  width: number,
  height: number,
  pixelRatio: number = window.devicePixelRatio
): void {
  this._width = width;
  this._height = height;
  this._pixelRatio = pixelRatio;

  const actualWidth = Math.floor(width * pixelRatio);
  const actualHeight = Math.floor(height * pixelRatio);

  this.canvas.width = actualWidth;
  this.canvas.height = actualHeight;
  this.canvas.style.width = `${width}px`;
  this.canvas.style.height = `${height}px`;

  this.gl.viewport(0, 0, actualWidth, actualHeight);
}
```

On a 2x Retina display, a 800×600 CSS-pixel canvas becomes a 1600×1200 actual-pixel canvas. The CSS `width`/`height` tell the browser how much space the canvas occupies in the layout. The `canvas.width`/`canvas.height` attributes tell WebGL how many pixels the framebuffer has. `gl.viewport` tells the GPU which rectangle of the framebuffer to draw to.

`Math.floor` prevents fractional pixel sizes, which can cause subtle rendering artifacts. We use `Math.round` in the ResizeObserver (Chapter 4) for the same reason.

## Context Loss

The GPU context can be lost at any time. The operating system might reclaim GPU memory when the user switches to a game. The browser might kill contexts to save power. A driver crash resets everything.

When context is lost, every GPU resource — programs, buffers, textures, VAOs — is destroyed. All GL calls silently fail. The canvas goes black. You cannot prevent this; you can only handle it gracefully.

```typescript
private contextLost: boolean = false;
private boundHandleContextLost: (e: Event) => void;
private boundHandleContextRestored: (e: Event) => void;

constructor(options: WebGLRendererOptions) {
  // ... context creation ...

  // Store bound refs for proper cleanup
  this.boundHandleContextLost = this.handleContextLost.bind(this);
  this.boundHandleContextRestored = this.handleContextRestored.bind(this);
  this.canvas.addEventListener('webglcontextlost', this.boundHandleContextLost);
  this.canvas.addEventListener('webglcontextrestored', this.boundHandleContextRestored);
}

private handleContextLost(event: Event): void {
  event.preventDefault();
  this.contextLost = true;
  this.onContextLost?.();
}

private handleContextRestored(): void {
  this.contextLost = false;
  this.initializeState();
  this.onContextRestored?.();
}
```

`event.preventDefault()` on the `webglcontextlost` event is critical. Without it, the browser won't attempt to restore the context — the canvas stays dead permanently. With it, the browser will fire `webglcontextrestored` when the GPU is available again, giving us a chance to recreate all our resources.

The `boundHandleContextLost` pattern (storing the bound function reference) is necessary for proper `removeEventListener` on disposal. If you write `canvas.addEventListener('webglcontextlost', this.handleContextLost.bind(this))`, the `bind` creates a new function each time. Later, `canvas.removeEventListener('webglcontextlost', this.handleContextLost.bind(this))` creates yet another new function — a different reference — so the listener is never actually removed. By storing the bound reference, we can remove the exact same function we added.

The rendering loop checks the context state:

```typescript
const render = () => {
  if (renderer.isContextLost()) {
    animationFrameRef.current = requestAnimationFrame(render);
    return;
  }

  renderer.clear();
  // ... render scene ...

  animationFrameRef.current = requestAnimationFrame(render);
};
```

If the context is lost, we skip rendering but keep the loop alive. When the context is restored, the `onContextRestored` callback recreates shaders, buffers, and textures, and the next loop iteration renders normally. The user sees a brief black flash, then the editor reappears.

## The Rendering Loop

The rendering loop ties everything together. It runs inside a `useEffect` in the Canvas component:

```typescript
useEffect(
  () => {
    const container = containerRef.current;
    if (!container) return;

    // Create renderer
    const renderer = new WebGLRenderer({ canvas: canvasRef.current! });
    rendererRef.current = renderer;

    // Create camera
    const camera = new Camera({
      /* ... */
    });
    cameraRef.current = camera;

    // Create sub-renderers
    const grid = new Grid(renderer, { majorSpacing: 100, minorDivisions: 5 });
    const shapeRenderer = new ShapeRenderer(renderer);

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (width > 0 && height > 0) {
          renderer.setViewport(width, height);
          camera.setViewport(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    // Render loop
    const render = () => {
      if (renderer.isContextLost()) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      renderer.clear();

      const vpMatrix = camera.getViewProjectionMatrix();
      const visibleBounds = camera.getVisibleBounds();

      // 1. Grid (behind everything)
      grid.render(vpMatrix, visibleBounds, camera.zoom);

      // 2. Scene graph shapes
      shapeRenderer.render(sceneGraph, vpMatrix);

      // 3. Overlays (selection handles, guide lines, etc.)
      // ... rendered in React SVG layers ...

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      grid.dispose();
      shapeRenderer.dispose();
      renderer.dispose();
    };
  },
  [
    /* stable dependencies */
  ]
);
```

The render order matters:

1. **Clear** the canvas with the dark background color
2. **Grid** renders first, behind everything (infinite adaptive grid lines)
3. **Shape rendering** traverses the scene graph and draws every visible node
4. **Overlays** (selection handles, guide lines) render on top as React SVG elements positioned over the WebGL canvas

All of this happens inside `requestAnimationFrame`, which synchronizes with the display's refresh rate. On a 60Hz monitor, the callback fires ~60 times per second. On 120Hz, ~120 times per second. The browser throttles to the display rate automatically, and pauses when the tab is hidden.

The cleanup function in the `useEffect` return is essential. `cancelAnimationFrame` stops the loop. `resizeObserver.disconnect()` stops resize events. `dispose()` on each renderer deletes all GPU resources. Without this, you'd leak GPU memory every time the component re-mounts (which happens during React StrictMode development).

## Resource Cleanup

Every GPU resource must be explicitly deleted. JavaScript's garbage collector handles memory, but GPU resources live on the graphics card — the GC doesn't know about them.

```typescript
dispose(): void {
  const { gl } = this;

  // Clean up programs
  for (const [, program] of this.programs) {
    gl.deleteProgram(program.program);
  }
  this.programs.clear();

  // Clean up buffers
  for (const [, bufferInfo] of this.buffers) {
    gl.deleteBuffer(bufferInfo.buffer);
  }
  this.buffers.clear();

  // Remove event listeners
  this.canvas.removeEventListener(
    'webglcontextlost', this.boundHandleContextLost);
  this.canvas.removeEventListener(
    'webglcontextrestored', this.boundHandleContextRestored);
}
```

The `dispose` pattern cascades: the Canvas component calls `shapeRenderer.dispose()`, which calls `this.renderer.deleteProgram('shape')` for each of its programs and `gl.deleteTexture()` for each cached texture. The Grid calls `this.renderer.deleteProgram('grid')`. Finally, `renderer.dispose()` catches anything left in the named maps.

After disposal, we null out all references to GPU resources and clear all Maps. This isn't strictly necessary (the GC will collect them), but it makes use-after-dispose bugs crash immediately with a null reference instead of silently using a deleted resource handle.

## Testing Without a GPU

JSDOM (our test environment) doesn't have WebGL. We can't compile real shaders or draw real triangles in tests. But we can test everything the WebGLRenderer does _around_ those operations: state caching, error handling, resource lifecycle, viewport math.

The mock creates a fake `WebGL2RenderingContext` with spy functions:

```typescript
export function createMockWebGL2Context(): WebGL2RenderingContext {
  const mockProgram = {} as WebGLProgram;
  const mockShader = {} as WebGLShader;
  const mockBuffer = {} as WebGLBuffer;
  const mockVAO = {} as WebGLVertexArrayObject;
  const mockUniformLocation = {} as WebGLUniformLocation;

  return {
    // Constants (real values from the WebGL spec)
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    // ... all needed constants ...

    // Every method is a vi.fn() spy
    createShader: vi.fn().mockReturnValue(mockShader),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn().mockReturnValue(true),
    createProgram: vi.fn().mockReturnValue(mockProgram),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn().mockReturnValue(true),
    useProgram: vi.fn(),
    createBuffer: vi.fn().mockReturnValue(mockBuffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    createVertexArray: vi.fn().mockReturnValue(mockVAO),
    bindVertexArray: vi.fn(),
    // ... all other methods ...
  } as unknown as WebGL2RenderingContext;
}
```

And a mock canvas that returns this context:

```typescript
export function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const mockGL = createMockWebGL2Context();

  canvas.getContext = vi.fn().mockImplementation((type: string) => {
    if (type === 'webgl2') return mockGL;
    return null;
  });

  return canvas;
}
```

With this, we can test:

- **State caching**: call `useProgram` twice with the same program, assert `gl.useProgram` was called once
- **Error handling**: make `getShaderParameter` return `false`, assert the compile error is thrown with the shader log
- **Context loss**: dispatch the `webglcontextlost` event, assert `isContextLost()` returns true
- **Resource cleanup**: create programs and buffers, call `dispose()`, assert all were deleted
- **Viewport math**: call `setViewport(800, 600, 2)`, assert canvas dimensions are 1600×1200

We can't test that shapes look correct — that requires visual regression testing with a real GPU. But we can test that the renderer makes the right GL calls in the right order, which catches the majority of bugs.

## Lessons

**State caching is not optional.** Wrapping `gl.useProgram` and `gl.bindVertexArray` saves you from the single most common WebGL performance mistake (redundant state changes) and the single most insidious WebGL bug category (stale state cache from direct GL calls).

**Delete shaders after linking.** Shader objects are intermediate artifacts. Once linked into a program, they waste GPU memory. Delete them immediately.

**Store bound function references.** `.bind()` creates a new function every time. If you need to both add and remove an event listener, store the bound reference in a field.

**`preserveDrawingBuffer: false` by default.** Only enable it for canvases that need post-frame pixel reads. For the main render canvas, the default lets the browser optimize.

**`event.preventDefault()` on context loss.** Without it, the browser won't restore the context and your canvas stays permanently black.

**Create resources in `useEffect`, not during render.** React StrictMode calls render functions twice. Creating a WebGL context during render means creating two contexts — the first leaks because nothing disposes it. `useEffect` runs once and provides a cleanup function.

**The render loop is `requestAnimationFrame`, not `setInterval`.** RAF syncs with the display, pauses when the tab is hidden, and provides high-resolution timestamps. `setInterval` does none of these things.

## What We Built

This chapter covered the WebGL 2 foundation — about 600 lines in `WebGLRenderer.ts` that sit between the application and the GPU:

- **Context creation**: `getContext('webgl2')` with configurable options (antialias, alpha, premultiplied alpha, preserveDrawingBuffer), plus graceful fallback when WebGL 2 isn't available.
- **State caching**: `useProgram`, `bindVAO`, `bindBuffer`, and `bindTexture` all skip redundant GL calls by comparing against cached state. Eliminates the most common WebGL performance mistake.
- **Shader compilation**: Compile + link with error extraction from `getShaderInfoLog` / `getProgramInfoLog`. Shader objects deleted immediately after linking.
- **Vertex Array Objects**: The VAO pattern encapsulates vertex attribute configuration — bind once during setup, rebind with a single call during rendering.
- **Buffer management**: `createBuffer` / `uploadBufferData` / `uploadBufferSubData` for both `ARRAY_BUFFER` and `ELEMENT_ARRAY_BUFFER`.
- **Uniform setters**: Type-dispatched uniform uploads (float, vec2, vec3, vec4, mat3, int, sampler).
- **Viewport and pixel ratio**: Handles `devicePixelRatio` for sharp rendering on HiDPI displays, with ResizeObserver integration.
- **Context loss recovery**: Event listeners for `webglcontextlost` / `webglcontextrestored`, `isContextLost()` guard, `preventDefault()` to enable restoration.
- **Resource cleanup**: Explicit `dispose()` that deletes all programs, buffers, VAOs, and textures, with null guards for React StrictMode double-cleanup.
- **Mock-based testing**: Fake `WebGL2RenderingContext` with spy functions, verifying state caching, error paths, and resource lifecycle without a real GPU.

The next chapter builds on this foundation with a `ShapeRenderer` that converts vector shapes — rectangles, ellipses, polygons, paths — into GPU-ready triangle geometry and draws them with fills, strokes, and gradients.
