# WebGL Pitfalls & Solutions

## Every GPU Bug Teaches a Rule

WebGL is a thin wrapper around OpenGL ES 3.0. It gives you direct access to the GPU — vertex buffers, shaders, framebuffers, texture units, blend modes — and it expects you to manage every piece of state yourself. There is no garbage collector for GPU resources. There is no automatic state restore after a framebuffer operation. There is no warning when a cached VAO handle goes stale. When something goes wrong, the symptoms are visual: shapes vanish, backgrounds flash transparent, shadows disappear, exports come out black. The error, if there is one, shows up in a completely different part of the rendering pipeline from where the bug was introduced.

This chapter catalogs every WebGL pitfall we hit while building the editor's rendering pipeline and the solution that emerged from each one. These aren't hypothetical problems — each one shipped as a bug, was debugged live, and produced a rule that prevented the next occurrence. The pitfalls fall into five categories: global state leaks, state cache desync, framebuffer operation traps, texture memory management, and canvas buffer semantics. Together, they form a survival guide for anyone building a real-time 2D application on WebGL.

## Global State Is the Root of All Evil

OpenGL (and by extension WebGL) is a state machine. Functions like `gl.clearColor()`, `gl.enable(gl.SCISSOR_TEST)`, `gl.blendFunc()`, and `gl.depthFunc()` don't take effect immediately — they set global state that persists until something changes it. Every subsequent draw call, every `gl.clear()`, every framebuffer operation is affected by the current global state. There is no scoping, no stack, no automatic save/restore. If function A sets `gl.clearColor(0, 0, 0, 0)` for its own purposes and function B later calls `gl.clear()` without resetting the clear color, function B clears with transparent black — even though function B never asked for that color.

This is the fundamental trap of WebGL. Every function that touches GL state must either restore what it changed or guarantee that callers reset what they need. In a complex rendering pipeline with multiple passes — shape rendering, effect processing, FBO compositing — state leaks are inevitable unless you design around them.

## The clearColor Leak

The first visible symptom was the canvas background flashing transparent. The editor's dark gray background (`#1A1A1A`) would briefly vanish after rendering any node with effects (drop shadows, blur, blend modes), showing whatever was behind the canvas element in the DOM.

The render loop calls `renderer.clear()` at the start of every frame:

```typescript
const render = () => {
  if (renderer.isContextLost()) {
    animationFrameRef.current = requestAnimationFrame(render);
    return;
  }

  renderer.clear();
  // ... render scene ...
};
```

The `clear()` method was originally simple:

```typescript
// BROKEN VERSION
clear(): void {
  this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
}
```

It relied on `clearColor` having been set once during initialization:

```typescript
private initializeState(): void {
  const { gl } = this;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0.102, 0.102, 0.102, 1.0); // #1A1A1A
}
```

The problem: the `EffectRenderer` calls `gl.clearColor(0, 0, 0, 0)` when clearing off-screen framebuffers. It needs transparent black for FBO clears so that compositing works correctly. But `clearColor` is global state — after the EffectRenderer runs, the next frame's `gl.clear()` in the render loop inherits `(0, 0, 0, 0)` instead of `(0.102, 0.102, 0.102, 1.0)`.

The fix is to never rely on previously set `clearColor` state:

```typescript
clear(color?: [number, number, number, number]): void {
  const { gl } = this;

  // Always set clearColor to guard against state leaks from FBO operations
  // (e.g. EffectRenderer sets clearColor(0,0,0,0) for off-screen buffers)
  const c = color ?? [0.102, 0.102, 0.102, 1.0];
  gl.clearColor(c[0], c[1], c[2], c[3]);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}
```

Now `clear()` sets the clear color every time before clearing. The default is the dark gray background. Callers can pass a custom color (for export rendering, for instance), but they never inherit a stale value from a previous FBO operation. The cost of an extra `gl.clearColor()` call per frame is negligible — it's a single GL state write, not a draw call.

The rule: **never assume GL state from a previous call. Set it explicitly before every operation that depends on it.**

## The VAO Cache Desync

The second bug was more dramatic: all shapes after the first node with effects became invisible. Drop a shadow on a rectangle, and every shape drawn after it vanished. Remove the shadow, and everything reappeared.

The `WebGLRenderer` maintains a state cache to avoid redundant GL calls. Each `useProgram` and `bindVAO` call checks whether the target is already bound:

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

This cache eliminates redundant `gl.useProgram()` and `gl.bindVertexArray()` calls when rendering many shapes with the same shader. For a scene with fifty rectangles using the flat-color shader, the program is bound once, and the 49 subsequent `useProgram` calls are no-ops. The performance gain is measurable.

The problem was in the `EffectRenderer`. It was calling `gl.bindVertexArray(quadVAO)` directly — bypassing the renderer's `bindVAO()` method:

```typescript
// BROKEN VERSION (in EffectRenderer)
gl.bindVertexArray(this.quadVAO);
gl.drawArrays(gl.TRIANGLES, 0, 6);
```

This bound the fullscreen quad VAO at the GL level, but the renderer's cache still thought the previous shape VAO was bound. After the EffectRenderer finished compositing, the render loop continued with the next shape. It called `renderer.bindVAO(shapeVAO)` — but the cache compared `shapeVAO` against `currentVAO` (still pointing to the old shape VAO, not the quad VAO) and concluded no bind was needed. The `gl.bindVertexArray` call was skipped. The draw call proceeded with the quad VAO — six vertices forming a fullscreen rectangle — instead of the shape's vertex data. Six vertices can't represent a star or a circle, so the shape rendered as garbage or not at all.

The fix was systematic: every VAO bind and program activation in the EffectRenderer goes through the renderer's state-cached methods:

```typescript
// FIXED VERSION
const { composite, quadVAO } = this.programs;
this.renderer.useProgram(composite);
this.renderer.bindVAO(quadVAO);

gl.drawArrays(gl.TRIANGLES, 0, 6);

this.renderer.bindVAO(null);
```

Now the cache tracks the quad VAO. When the next shape calls `renderer.bindVAO(shapeVAO)`, the cache correctly detects the change and issues the GL call.

This bug was hard to find because the symptoms appeared in the wrong place. The invisible shapes had nothing wrong with their geometry, their shaders, or their uniforms. The bug was in the EffectRenderer — a completely different component — and it manifested only when rendering shapes _after_ a node with effects. The rule: **never bypass the renderer's state-cached methods with direct GL calls. If you touch `gl.bindVertexArray` or `gl.useProgram` directly, the cache goes stale and subsequent operations silently fail.**

## The VAO Initialization Exception

There is one legitimate use of direct `gl.bindVertexArray()` calls: VAO initialization. When creating a VAO for the first time, the setup code binds it directly to configure vertex attributes:

```typescript
export function createFullscreenQuad(gl: WebGL2RenderingContext): {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
} {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD_VERTICES, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, vbo };
}
```

This is safe because initialization happens once during setup, before the render loop starts. The cache starts as `null`, and the first `bindVAO()` call during rendering will always issue a GL bind. The direct bind during init doesn't corrupt the cache because no rendering is in progress.

The distinction is clear: **use direct GL calls during one-time setup; use the renderer's cached methods during the render loop.**

## Framebuffer Operations: Three Traps in One Pass

Framebuffer objects (FBOs) enable off-screen rendering. Instead of drawing directly to the canvas, you draw to a texture attached to an FBO. This is essential for post-processing effects: render a shape to an FBO, blur it for a shadow, then composite it back onto the canvas. The editor uses FBOs for drop shadows, inner shadows, layer blur, and blend mode compositing.

FBO operations interact with three global GL states in ways that produce subtle bugs: scissor test, depth test, and blend function.

### The Scissor Trap

Artboards use `gl.scissor()` to clip children to their bounds. When `SCISSOR_TEST` is enabled, `gl.clear()` only clears pixels within the scissor rectangle. This is correct for clearing artboard content — you don't want to erase shapes outside the artboard. But when the EffectRenderer acquires an FBO and clears it, the scissor rectangle from the artboard is still active. The FBO clear only affects the scissor region, leaving stale content in the rest of the texture. The stale pixels from a previous FBO use bleed into the shadow or blur output.

The fix: save the scissor state, disable it for FBO operations, then restore it for compositing:

```typescript
renderNodeWithEffects(
  effects: Effect[] | undefined,
  blendMode: BlendMode,
  renderNodeFn: () => void,
  canvasWidth: number,
  canvasHeight: number
): void {
  const gl = this.gl;

  // Save and disable scissor test so FBO clears affect the entire texture
  const scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
  if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);

  // Render the node shape to an off-screen FBO
  const shapeFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shapeFBO.fbo);
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // ... render to FBO ...

  // Restore default framebuffer for compositing
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvasWidth, canvasHeight);

  // Re-enable scissor for compositing (clips to artboard bounds)
  if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);
```

The scissor state must be toggled multiple times during a single effect pass. Shadow blur operates on its own FBO — scissor must be disabled for that clear too. Then it must be re-enabled before compositing, because the composite output should clip to the artboard bounds:

```typescript
// Inside renderDropShadow
const scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);

const blurredFBO = this.applyGaussianBlur(shapeFBO, effect.blur, canvasWidth, canvasHeight);

if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);
```

The same toggle pattern repeats in `renderLayerBlur`. Each FBO sub-operation disables scissor for its clears and restores it for compositing.

### The Depth Test Trap

The editor enables depth testing for potential 2.5D ordering. Shape rendering respects the depth buffer. But fullscreen compositing quads — the rectangles used to composite FBO textures back onto the canvas — should not interact with the depth buffer. If a compositing quad writes to the depth buffer, it can block subsequent shapes from rendering. If it reads the depth buffer, it might be rejected by depth comparison even though it should always cover the full screen.

The fix: disable depth testing during compositing, restore it afterward:

```typescript
// Disable depth test during compositing — fullscreen quads should not
// interact with the depth buffer
gl.disable(gl.DEPTH_TEST);

// ... composite drop shadows, layer blur, shape itself, inner shadows ...

// Restore depth test
gl.enable(gl.DEPTH_TEST);
```

### The Premultiplied Alpha Trap

The most subtle FBO trap involves alpha blending. When rendering shapes to an FBO, the standard blend function `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` works correctly for RGB channels but produces wrong results for the alpha channel. Consider a pixel with alpha 0.5. The blend function computes output alpha as `0.5 * 0.5 + dst_alpha * (1 - 0.5)` — the source alpha gets squared. Semi-transparent content in the FBO appears more transparent than intended.

The fix uses `blendFuncSeparate` to apply different blend functions for RGB and alpha channels:

```typescript
// Use blendFuncSeparate so alpha in the FBO is correct (A, not A^2)
// RGB: standard src-over; Alpha: additive src-over
gl.blendFuncSeparate(
  gl.SRC_ALPHA,
  gl.ONE_MINUS_SRC_ALPHA, // RGB
  gl.ONE,
  gl.ONE_MINUS_SRC_ALPHA // Alpha
);
renderNodeFn();
// Restore standard blend func
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
```

For the alpha channel, `gl.ONE` means the source alpha is used as-is, without the multiplicative `SRC_ALPHA` factor. This produces correct alpha values in the FBO texture.

When compositing the FBO back onto the canvas, the blend function must account for the fact that the FBO content is now premultiplied — RGB values already include the alpha multiplication from the shape rendering pass. Using `SRC_ALPHA` again would double-multiply, making everything too dark. The composite pass uses `ONE` for the source factor:

```typescript
private compositeToScreen(fbo: FramebufferEntry, ...): void {
  const { composite, quadVAO } = this.programs;
  this.renderer.useProgram(composite);
  this.renderer.bindVAO(quadVAO);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
  gl.uniform1i(composite.uniforms.u_texture ?? null, 0);

  // FBO content is premultiplied — use ONE for src factor to avoid alpha^2
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Restore standard blend func for subsequent rendering
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  this.renderer.bindVAO(null);
}
```

For non-normal blend modes (multiply, screen, overlay, etc.), blending is disabled entirely. The blend mode shader reads both the source (shape) and destination (canvas content) textures and computes the blend in GLSL:

```typescript
// Disable blending for the blend mode shader
// (it handles compositing itself)
gl.disable(gl.BLEND);
gl.drawArrays(gl.TRIANGLES, 0, 6);
gl.enable(gl.BLEND);
```

This avoids the premultiplied alpha complexity for blend modes — the shader has full control over how source and destination pixels combine.

## The Multisampled Framebuffer Surprise

Non-normal blend modes require reading the current canvas content into an FBO for the GLSL shader to compute the blend. The natural approach is `gl.blitFramebuffer()` — a fast GPU-to-GPU copy. But the default framebuffer is multisampled (because the WebGL context was created with `antialias: true`), and blitting from a multisampled framebuffer to a non-multisampled texture FBO fails on Chrome/ANGLE with `GL_INVALID_OPERATION`.

The workaround is a CPU roundtrip via `readPixels` and `texSubImage2D`:

```typescript
// Capture the current canvas content into a destination FBO texture.
// We use readPixels + texSubImage2D instead of blitFramebuffer because
// the default framebuffer may be multisampled (antialias:true) and
// blitFramebuffer from a multisampled FB to a non-multisampled texture
// FBO fails on Chrome/ANGLE with GL_INVALID_OPERATION.
const dstFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
const bufferSize = canvasWidth * canvasHeight * 4;
if (!this.resolvePixelBuffer || this.resolvePixelBuffer.length < bufferSize) {
  this.resolvePixelBuffer = new Uint8Array(bufferSize);
}
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.readPixels(0, 0, canvasWidth, canvasHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.resolvePixelBuffer);
gl.bindTexture(gl.TEXTURE_2D, dstFBO.texture);
gl.texSubImage2D(
  gl.TEXTURE_2D,
  0,
  0,
  0,
  canvasWidth,
  canvasHeight,
  gl.RGBA,
  gl.UNSIGNED_BYTE,
  this.resolvePixelBuffer
);
```

The `resolvePixelBuffer` is a reusable `Uint8Array` that avoids per-frame allocation. `readPixels` reads from the resolved (non-multisampled) version of the default framebuffer, which WebGL provides automatically. `texSubImage2D` uploads the pixels into the FBO texture. This roundtrip is slower than `blitFramebuffer` (it touches the CPU), but it works on every driver and every platform.

## The FBO Pool

Creating and destroying framebuffers every frame would be expensive. The `FramebufferManager` maintains a pool of pre-allocated FBOs, keyed by their dimensions:

```typescript
acquire(width: number, height: number): FramebufferEntry {
  const key = this.sizeKey(width, height);
  const bucket = this.pool.get(key);

  if (bucket && bucket.length > 0) {
    const entry = bucket.pop()!;
    this.active.add(entry);
    // Clear the FBO before reuse
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, entry.fbo);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    return entry;
  }

  // Create new
  const entry = this.createFramebuffer(width, height);
  this.active.add(entry);
  return entry;
}
```

The `sizeKey` produces `"WxH"` strings like `"1920x1080"`. When an FBO is released, it goes back into its size bucket. The next `acquire` for the same dimensions reuses it without allocation. A max pool size of 8 entries prevents memory bloat — if you resize the canvas, old-size FBOs are eventually discarded.

Creating a new framebuffer involves three GPU objects: a texture, a framebuffer, and an attachment binding:

```typescript
private createFramebuffer(width: number, height: number): FramebufferEntry {
  const gl = this.gl;

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA8,
    width, height, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D, texture, 0
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('Framebuffer incomplete:', status);
  }

  // Clear before returning
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { fbo, texture, width, height };
}
```

The texture parameters matter: `CLAMP_TO_EDGE` prevents edge sampling artifacts when the blur shader reads texels near the border. `LINEAR` filtering produces smooth results for the Gaussian blur's texture reads. `RGBA8` is the standard format for color framebuffer attachments.

Both `acquire` and `createFramebuffer` clear the FBO before returning it. This is important because pooled FBOs contain stale data from their previous use. Without the clear, a shadow FBO might show ghosted remnants of the previous frame's shape.

Note that these FBO clears call `gl.clearColor(0, 0, 0, 0)` — this is exactly the state leak that the main `clear()` method guards against. The FBO pool is one of the sources of the clearColor leak.

## Texture Memory: Dispose on Node Removal

WebGL textures are GPU resources. They persist until explicitly deleted with `gl.deleteTexture()`. If you remove an `ImageNode` from the scene graph but forget to delete its texture, the GPU memory stays allocated. In a long editing session where the user imports and deletes dozens of images, the leaked textures accumulate.

The `ShapeRenderer` maintains a texture cache keyed by the image's data URI source:

```typescript
private textureCache: Map<string, WebGLTexture> = new Map();
private pendingImages: Map<string, Promise<HTMLImageElement>> = new Map();
```

The `getTexture` method handles lazy async loading. The first call for a given `src` starts an `Image` element load and returns `null` — the caller skips rendering for that frame. When the image decodes, the texture is created and cached. Subsequent calls return the cached texture immediately:

```typescript
getTexture(src: string): WebGLTexture | null {
  const cached = this.textureCache.get(src);
  if (cached) return cached;

  // Already loading? Return null, caller skips render this frame
  if (this.pendingImages.has(src)) return null;

  // Start async load
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  this.pendingImages.set(src, promise);
  promise.then((img) => {
    const gl = this.renderer.context;
    const texture = gl.createTexture();
    if (!texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.textureCache.set(src, texture);
  });

  return null;
}
```

The `disposeTexture` method deletes a single texture by its source key:

```typescript
disposeTexture(src: string): void {
  const texture = this.textureCache.get(src);
  if (texture) {
    this.renderer.context.deleteTexture(texture);
    this.textureCache.delete(src);
  }
  this.pendingImages.delete(src);
}
```

The wiring happens in `Canvas.tsx`, where the scene graph's `nodeRemoved` event triggers texture cleanup:

```typescript
const handleNodeRemoved = (node: Node) => {
  incrementVersion();
  if (node.type === 'image' && shapeRendererRef.current) {
    shapeRendererRef.current.disposeTexture(node.src);
  }
};

const unsubscribeRemoved = sceneGraph.on('nodeRemoved', handleNodeRemoved);
```

When an `ImageNode` is deleted (via the Delete key, undo, or any other removal path), the `nodeRemoved` event fires, the handler checks the node type, and the texture is deleted from GPU memory. This is reactive disposal — the renderer doesn't need to scan the scene graph for removed nodes; it responds to events.

The bulk `dispose` method cleans up everything when the renderer is torn down (component unmount):

```typescript
dispose(): void {
  const gl = this.renderer.context;
  // ... delete all buffers, VAOs, programs ...

  for (const texture of this.textureCache.values()) {
    gl.deleteTexture(texture);
  }
  this.textureCache.clear();
  this.pendingImages.clear();
}
```

After deletion, all GPU resource handles are set to `null`:

```typescript
if (this.textureVertexBuffer) {
  gl.deleteBuffer(this.textureVertexBuffer);
  this.textureVertexBuffer = null;
}
if (this.textureVAO) {
  gl.deleteVertexArray(this.textureVAO);
  this.textureVAO = null;
}
```

Nullifying handles after deletion prevents a use-after-free scenario where code accidentally draws with a deleted resource. The `null` check in the render path catches the error instead of producing undefined GPU behavior.

A related cleanup is texture unbinding after each image draw:

```typescript
// Inside renderImage, after gl.drawArrays
gl.bindTexture(gl.TEXTURE_2D, null);
```

This prevents texture unit contamination. If the next draw call uses a different shader that doesn't set `gl.TEXTURE0`, it would otherwise read from the previously bound image texture — producing visual artifacts where a shape renders with an image fill instead of a solid color.

## preserveDrawingBuffer and Export

The WebGL context attribute `preserveDrawingBuffer` controls whether the GPU's drawing buffer is preserved after compositing to the screen. The default is `false` — after the browser composites the WebGL canvas into the page, the buffer contents are discarded. This is a performance optimization: the GPU can reuse the buffer memory immediately.

The consequence: `gl.readPixels()` and `canvas.toBlob()` return black (all zeros) when called after the frame has been composited. If you render a scene and then try to export it as PNG, you get a black rectangle.

The production canvas does not set `preserveDrawingBuffer` — it defaults to `false` for maximum performance:

```typescript
const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  // preserveDrawingBuffer defaults to false
});
```

The `WebGLRenderer` constructor applies the default explicitly:

```typescript
const contextAttributes: WebGLContextAttributes = {
  antialias: options.antialias ?? true,
  preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  alpha: options.alpha ?? true,
  premultipliedAlpha: options.premultipliedAlpha ?? true,
  powerPreference: 'high-performance',
};
```

For export, both the single-node PNG exporter and the animation frame renderer create a separate offscreen canvas with `preserveDrawingBuffer: true`:

```typescript
// exportService.ts — single-node PNG/SVG export
const renderer = new WebGLRenderer({
  canvas,
  preserveDrawingBuffer: true,
  alpha: true,
});
```

```typescript
// frameRenderer.ts — animation frame export
const renderer = new WebGLRenderer({
  canvas,
  preserveDrawingBuffer: true,
  alpha: true,
});
```

After rendering a frame, `canvas.toBlob()` captures the preserved pixels:

```typescript
function renderFrameAsBlob(ctx: FrameRenderContext, frame: number): Promise<Blob | null> {
  renderFrame(ctx, frame);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
```

The offscreen renderer is fully disposed after export to free its GPU resources:

```typescript
function dispose(): void {
  shapeRenderer.dispose();
  renderer.dispose();
}
```

The `alpha: true` option is also important for export. The production canvas uses `alpha: false` — the canvas is opaque, and the dark gray background is always visible. But export canvases need `alpha: true` so that transparent regions in the exported PNG remain transparent rather than being filled with black.

The pattern is: **use `preserveDrawingBuffer: false` for the production canvas (performance) and `preserveDrawingBuffer: true` for disposable offscreen canvases (correctness).** Never set `preserveDrawingBuffer: true` on the production canvas — the performance cost (the GPU can't reclaim the buffer) applies to every frame, not just export frames.

## Context Loss and Recovery

WebGL contexts can be lost at any time — when the GPU crashes, when the system sleeps, when too many contexts are active, or when the driver decides to reclaim resources. When the context is lost, every GL resource handle becomes invalid. Every texture, buffer, VAO, shader program, and framebuffer must be recreated.

The `WebGLRenderer` handles context loss by listening to the `webglcontextlost` and `webglcontextrestored` events:

```typescript
private handleContextLost = (event: Event): void => {
  event.preventDefault(); // Allow restoration
  this._isContextLost = true;
};

private handleContextRestored = (): void => {
  this._isContextLost = false;
  this.initializeState();
};
```

Calling `event.preventDefault()` on the `contextlost` event tells the browser to attempt restoring the context instead of permanently destroying it. Without this call, the context is gone forever and the canvas goes black until the page is refreshed.

The render loop checks `isContextLost()` at the top:

```typescript
const render = () => {
  if (renderer.isContextLost()) {
    animationFrameRef.current = requestAnimationFrame(render);
    return;
  }
  renderer.clear();
  // ... render scene ...
};
```

When the context is lost, the render loop simply skips the frame and schedules the next one. It doesn't try to render — all GL calls would fail anyway. When the context is restored, `initializeState()` reinitializes the GL state machine, and the next frame's render proceeds normally. Shader programs, buffers, and textures are recreated lazily on first use.

The event listeners must be removed on cleanup to prevent memory leaks:

```typescript
dispose(): void {
  this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
  this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
}
```

## The Complete Effect Rendering Flow

Putting all the pitfalls and fixes together, the EffectRenderer's `renderNodeWithEffects` method is a carefully orchestrated sequence of state saves, disables, renders, restores, and composites:

1. **Save scissor state**, disable it for FBO operations.
2. **Acquire an FBO** from the pool, bind it, clear it with transparent black.
3. **Set `blendFuncSeparate`** for correct alpha in the FBO.
4. **Render the node** to the FBO via the caller's `renderNodeFn()`.
5. **Restore standard `blendFunc`**.
6. **Unbind the FBO** (restore default framebuffer).
7. **Re-enable scissor** for compositing (clips to artboard bounds).
8. **Disable depth test** so compositing quads don't interact with depth buffer.
9. **Render drop shadows** (each shadow does its own scissor save/disable/restore for blur FBOs).
10. **Render layer blur** if present (same scissor toggle pattern).
11. **Composite the shape** back onto the canvas with premultiplied `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`.
12. **Render inner shadows** on top, masked by shape alpha.
13. **Restore depth test**.
14. **Release the FBO** back to the pool.

Every step in this sequence was added because a bug manifested without it. The scissor save/restore was added after artboard clipping broke shadows. The depth disable was added after compositing quads blocked shapes. The `blendFuncSeparate` was added after semi-transparent effects appeared too faded. The `blendFunc(ONE, ...)` for compositing was added after premultiplied content appeared too dark. The `bindVAO` through the renderer was added after shapes vanished post-effects.

This is the reality of WebGL: every state interaction must be explicit. The GPU doesn't save your state, doesn't warn about mismatches, and doesn't fail gracefully. It renders what you told it to render — with whatever state was last set.

## Lessons

**WebGL state is global and sticky.** Every `gl.clearColor()`, `gl.enable()`, `gl.blendFunc()`, and `gl.bindVertexArray()` call persists until explicitly changed. Functions that modify GL state for their own purposes must either restore it afterward or ensure that all callers set what they need before using it. The `clear()` method's approach — always set clearColor before clearing — is the defensive pattern that works: never assume, always set.

**State caches must see every state change.** If you cache `currentVAO` to avoid redundant binds, then every bind must go through the cache. A single direct `gl.bindVertexArray()` call makes the cache stale, and the next cached bind becomes a silent no-op. The rule is simple: wrap every GL state-changing call in a caching method, and never call the raw GL function during rendering.

**FBO operations need a state bracket.** When switching from the main framebuffer to an FBO and back, you must save and restore at least three states: scissor test (FBO clears must not be scissored), depth test (compositing quads must not interact with depth), and blend function (FBO rendering needs `blendFuncSeparate`, compositing needs premultiplied `ONE`). Missing any one of these produces a subtle visual bug that appears far from the code that caused it.

**GPU resources must be explicitly freed.** JavaScript's garbage collector handles CPU memory. GPU memory — textures, buffers, VAOs, framebuffers, shader programs — requires explicit `gl.delete*()` calls. Event-driven disposal (reacting to scene graph `nodeRemoved` events) is more reliable than periodic scanning. Nullifying handles after deletion catches use-after-free bugs at the application level instead of producing undefined GPU behavior.

**Use `preserveDrawingBuffer: false` for performance, `true` for capture.** The production canvas should never pay the cost of preserving the drawing buffer — every frame would be slower. Instead, create a separate offscreen canvas with `preserveDrawingBuffer: true` when you need to capture pixels via `toBlob()` or `readPixels()`. Dispose the offscreen canvas after export to free its GPU resources.

**When the symptom is far from the cause, suspect state.** WebGL bugs rarely manifest at the point of failure. A stale clearColor from an FBO clear causes the background to flash transparent on the next frame. A bypassed VAO cache causes shapes after the first effected node to vanish. A forgotten scissor restore causes shadow textures to contain stale data. In each case, the symptom appeared in a different component, a different frame, or a different rendering pass from the code that introduced the bug. When you see a visual glitch that doesn't correlate with the code you're looking at, check what GL state the previous operation left behind.

## What We Built

This chapter cataloged the WebGL pitfalls encountered while building a real-time 2D rendering pipeline and the defensive patterns that emerged from each one:

- **The clearColor leak fix** ensures `WebGLRenderer.clear()` always sets `gl.clearColor()` before clearing, guarding against stale state left by FBO operations that clear to transparent black.
- **The VAO cache desync fix** routes all `gl.bindVertexArray()` and `gl.useProgram()` calls through the renderer's state-cached methods, preventing the cache from going stale when the EffectRenderer binds its fullscreen quad VAO.
- **The FBO state bracket** saves and restores scissor test, disables depth test during compositing, and uses `blendFuncSeparate` for correct alpha when rendering into FBOs — three separate fixes for three independent state interactions.
- **The premultiplied alpha composite** uses `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` when drawing FBO content back to the canvas, preventing the double alpha multiplication that makes semi-transparent effects appear too faded.
- **Texture disposal on node removal** subscribes to the scene graph's `nodeRemoved` event and calls `gl.deleteTexture()` to free GPU memory, with handle nullification to prevent use-after-free.
- **Separate export canvases** use `preserveDrawingBuffer: true` and `alpha: true` for pixel capture via `toBlob()`, while the production canvas uses the defaults for maximum performance.
- **The FBO pool** reuses framebuffers by dimension key, clears them before each use, and caps pool size at 8 entries to prevent GPU memory bloat.

The next chapter tackles a different kind of real-time challenge — making React work for a 60fps interactive editor. From hooks ordering constraints and StrictMode resource creation to passive wheel events and stale state in memoized computations, React's declarative model requires specific adaptations when your application's inner loop runs on `requestAnimationFrame`.
