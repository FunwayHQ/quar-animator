# Visual Effects & Compositing

## The Problem with Drawing Directly

Up to this point, every shape has been drawn straight to the canvas. The vertex shader transforms geometry, the fragment shader fills pixels, and the result appears on screen. This is fast and simple. It's also fundamentally limited.

Consider a drop shadow. You need the shape's silhouette — blurred, tinted, and offset behind the original. But the shape hasn't been drawn yet. And once it _is_ drawn, its pixels are mixed into the canvas background, inseparable. You can't blur something that's already composited.

Or consider blend modes. "Multiply" means each pixel of the shape multiplies against whatever is already on the canvas beneath it. WebGL's built-in `blendFunc` gives you additive, subtractive, and alpha blending — but nothing like Photoshop's overlay, color dodge, or soft light. Those require reading the destination pixel, performing arithmetic in a fragment shader, and writing the result. You can't read and write the same buffer in a single draw call.

The solution is **framebuffer objects** (FBOs) — off-screen render targets where you draw shapes to a texture instead of to the screen. Once the shape exists as a texture, you can blur it, offset it, read the canvas into another texture, blend them in a shader, and write the final result to the screen. This is multi-pass rendering, and it's how every visual effect in the editor works.

This chapter builds three layers of infrastructure: a `FramebufferManager` that pools FBOs to avoid constant GPU allocation, a set of post-process shaders for blur, shadow, and blend mode compositing, and an `EffectRenderer` that orchestrates the multi-pass pipeline. Together they're about 900 lines of code across three files — small enough to read in an afternoon, powerful enough to support drop shadows, layer blur, and 16 blend modes.

## Framebuffer Objects: Rendering to Texture

A framebuffer object redirects rendering from the screen to a texture. Instead of pixels landing on the canvas, they land in GPU memory that you can later sample as a texture input to another shader. The concept is simple. The API is a bit ceremonial:

```typescript
private createFramebuffer(width: number, height: number): FramebufferEntry {
  const gl = this.gl;

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('Framebuffer incomplete:', status);
  }

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { fbo, texture, width, height };
}
```

The texture is RGBA8 — 8 bits per channel, which matches the canvas format. `LINEAR` filtering gives smooth results when the texture is sampled at non-integer coordinates during blur passes. `CLAMP_TO_EDGE` prevents wrapping artifacts at texture boundaries.

The framebuffer is essentially a pointer that says "draw here instead of the screen." Attaching the texture as `COLOR_ATTACHMENT0` tells WebGL that fragment shader output goes into that texture. After creation, the FBO is cleared to transparent black `(0,0,0,0)` and the default framebuffer is restored. The shape that gets drawn here later will be the only thing in the texture — isolated from the canvas background, ready for post-processing.

## FBO Pooling

Creating and destroying framebuffers every frame is wasteful. A single shape with a drop shadow needs three FBOs: one for the shape, one for the horizontal blur pass, and one for the vertical blur pass. If you have ten shapes with shadows, that's thirty FBO creations and destructions per frame — and `gl.createFramebuffer()` plus `gl.createTexture()` are not free.

The `FramebufferManager` solves this with object pooling:

```typescript
export interface FramebufferEntry {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

const MAX_POOL_SIZE = 8;

export class FramebufferManager {
  private pool: Map<string, FramebufferEntry[]> = new Map();
  private active: Set<FramebufferEntry> = new Set();
```

The pool is a map from size key (`"1440x900"`) to a bucket of available FBOs. When code needs an FBO, it calls `acquire()`. If there's one in the pool of the right size, it's reused. Otherwise a new one is created. When the FBO is no longer needed, `release()` returns it to the pool for the next caller:

```typescript
acquire(width: number, height: number): FramebufferEntry {
  const key = this.sizeKey(width, height);
  const bucket = this.pool.get(key);

  if (bucket && bucket.length > 0) {
    const entry = bucket.pop()!;
    this.active.add(entry);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, entry.fbo);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    return entry;
  }

  const entry = this.createFramebuffer(width, height);
  this.active.add(entry);
  return entry;
}
```

Clearing the FBO on acquire is critical. A pooled FBO still contains whatever was drawn into it last frame. Without the clear, you'd see ghosted remnants of previous shapes bleeding through shadows and blur passes.

```typescript
release(entry: FramebufferEntry): void {
  this.active.delete(entry);

  const key = this.sizeKey(entry.width, entry.height);
  let bucket = this.pool.get(key);
  if (!bucket) {
    bucket = [];
    this.pool.set(key, bucket);
  }

  if (this.getTotalPoolSize() >= MAX_POOL_SIZE) {
    this.destroyEntry(entry);
    return;
  }

  bucket.push(entry);
}
```

The pool caps at 8 entries total. This prevents unbounded memory growth if someone adds many effects. At 1440×900 resolution, each FBO texture is about 5.2MB (1440 × 900 × 4 bytes). Eight entries is ~41MB of GPU memory dedicated to effect rendering — enough for complex scenes without starving the GPU.

In practice, a typical frame with a drop shadow acquires 3 FBOs, releases 2 mid-frame (the temporary blur buffers), and releases the shape FBO at the end. By the second frame, all 3 are pooled and no allocation occurs. The pattern is acquire-use-release, acquire-use-release — a rhythm that the pool handles efficiently.

## The Fullscreen Quad

Every post-process effect works the same way: render a texture onto a fullscreen quad. The quad covers the entire viewport, and the fragment shader samples the texture to produce the output. Blur, shadow compositing, blend modes — they all draw a textured rectangle that fills the screen.

The quad geometry is trivially small — two triangles:

```typescript
export function createFullscreenQuad(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  // positions (x,y) + texcoords (u,v) interleaved
  const data = new Float32Array([
    -1,
    -1,
    0,
    0, // bottom-left
    1,
    -1,
    1,
    0, // bottom-right
    -1,
    1,
    0,
    1, // top-left
    -1,
    1,
    0,
    1, // top-left
    1,
    -1,
    1,
    0, // bottom-right
    1,
    1,
    1,
    1, // top-right
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0); // a_position
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

  gl.enableVertexAttribArray(1); // a_texCoord
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);
  return { vao, vbo };
}
```

Positions span -1 to +1 in normalized device coordinates — exactly covering the viewport with no view-projection matrix needed. UV coordinates span 0 to 1, mapping the texture onto the quad. The stride is 16 bytes (4 floats × 4 bytes per float). This VAO is created once and shared by all four post-process shaders.

The vertex shader for all post-process passes is the same — pass through position and texture coordinates:

```glsl
#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
```

No model matrix. No view-projection matrix. The vertex positions are already in clip space. The quad goes straight to the screen.

## Separable Gaussian Blur

Blur is the workhorse effect. Drop shadows need blur. Layer blur needs blur. Eventually, depth of field and motion blur will need blur. Getting it right — and fast — matters.

A naive 2D Gaussian blur samples an N×N area around each pixel. At radius 10, that's a 21×21 kernel: 441 texture samples per pixel. At 1440×900 resolution, that's 571 million texture samples per frame. Unacceptable.

The trick is that a 2D Gaussian is **separable** — it decomposes into two 1D passes. First blur horizontally, then blur the result vertically. The math is equivalent to the 2D kernel, but the cost drops from N² to 2N samples per pixel. At radius 10: 42 samples instead of 441. That's a 10× speedup.

The fragment shader implements one pass. The direction uniform controls whether it blurs horizontally or vertically:

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec2 u_direction;  // (1/w, 0) for horizontal or (0, 1/h) for vertical
uniform float u_radius;

out vec4 outColor;

void main() {
  vec4 color = vec4(0.0);
  float total = 0.0;

  float sigma = max(u_radius / 3.0, 0.001);
  float twoSigmaSq = 2.0 * sigma * sigma;

  int samples = int(ceil(u_radius));
  samples = min(samples, 32);

  for (int i = -samples; i <= samples; i++) {
    float fi = float(i);
    float weight = exp(-(fi * fi) / twoSigmaSq);
    vec2 offset = u_direction * fi;
    color += texture(u_texture, v_texCoord + offset) * weight;
    total += weight;
  }

  outColor = color / total;
}
```

The Gaussian weight function `exp(-x²/2σ²)` peaks at the center and falls off smoothly. Setting `sigma = radius / 3.0` means the kernel extends to 3 standard deviations — capturing 99.7% of the Gaussian bell. The sample count is capped at 32 per direction. Larger radii still work, but the tails are truncated. For a UI effect like a drop shadow, the visual difference is imperceptible.

The `u_direction` uniform is the key to separability. For horizontal blur, it's `(1/canvasWidth, 0)` — sampling one pixel left and right per step. For vertical blur, it's `(0, 1/canvasHeight)` — sampling one pixel up and down. The same shader, the same loop, just a different direction vector.

The blur method runs both passes:

```typescript
private applyGaussianBlur(
  source: FramebufferEntry, radius: number,
  canvasWidth: number, canvasHeight: number
): FramebufferEntry {
  const { blur, quadVAO } = this.programs;

  // Pass 1: horizontal blur → temp FBO
  const tempFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO.fbo);
  gl.viewport(0, 0, canvasWidth, canvasHeight);

  this.renderer.useProgram(blur);
  this.renderer.bindVAO(quadVAO);

  gl.bindTexture(gl.TEXTURE_2D, source.texture);
  gl.uniform2f(blur.uniforms.u_direction, 1.0 / canvasWidth, 0);
  gl.uniform1f(blur.uniforms.u_radius, radius);

  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Pass 2: vertical blur → result FBO
  const resultFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
  gl.bindFramebuffer(gl.FRAMEBUFFER, resultFBO.fbo);

  gl.bindTexture(gl.TEXTURE_2D, tempFBO.texture);
  gl.uniform2f(blur.uniforms.u_direction, 0, 1.0 / canvasHeight);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.enable(gl.BLEND);

  this.fbManager.release(tempFBO);
  return resultFBO;
}
```

Blending is disabled during blur. The shader writes replacement pixels, not blended ones. The temporary FBO from pass 1 is released immediately — it served its purpose as the intermediate buffer. The result FBO is returned to the caller, who is responsible for releasing it.

## Drop Shadows

A drop shadow is a blurred, colored, offset copy of the shape's silhouette. The recipe: take the shape's FBO texture (which has the shape on a transparent background), blur it to soften the edges, then draw it to the canvas at an offset with a tinted color.

The shadow fragment shader reads the blurred texture's alpha channel at an offset position and outputs the shadow color:

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_shadowTexture;
uniform vec4 u_shadowColor;
uniform float u_opacity;
uniform vec2 u_offset;

out vec4 outColor;

void main() {
  float shadowAlpha = texture(u_shadowTexture, v_texCoord - u_offset).a;
  outColor = vec4(u_shadowColor.rgb, shadowAlpha * u_opacity * u_shadowColor.a);
}
```

The subtraction `v_texCoord - u_offset` shifts where the shader reads from the texture. If the offset is `(0.01, 0)`, the shadow appears shifted to the right — the shader reads from the left of the actual shape position, pulling the shadow rightward on screen.

The offset is specified in pixels by the user but converted to UV space (0-1 range) when passed to the shader:

```typescript
gl.uniform2f(
  shadow.uniforms.u_offset,
  effect.offsetX / canvasWidth,
  -effect.offsetY / canvasHeight
);
```

The Y offset is negated because UV coordinates increase downward while the editor's world coordinates increase upward. A positive `offsetY` should move the shadow down on screen, which means negative in UV space.

The rendering sequence for a drop shadow:

```typescript
private renderDropShadow(effect: DropShadowEffect, shapeFBO: FramebufferEntry, ...): void {
  // Blur the shape's alpha to create the shadow
  const blurredFBO = this.applyGaussianBlur(shapeFBO, effect.blur, canvasWidth, canvasHeight);

  // Composite the blurred shadow with offset + color
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);  // draw to canvas

  const { shadow, quadVAO } = this.programs;
  this.renderer.useProgram(shadow);
  this.renderer.bindVAO(quadVAO);

  gl.bindTexture(gl.TEXTURE_2D, blurredFBO.texture);
  gl.uniform4f(shadow.uniforms.u_shadowColor,
    effect.color.r / 255, effect.color.g / 255, effect.color.b / 255, effect.color.a);
  gl.uniform1f(shadow.uniforms.u_opacity, effect.opacity);

  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  this.fbManager.release(blurredFBO);
}
```

The shadow is drawn to the canvas _before_ the shape is composited. This is important — shadows appear behind the shape. The rendering order is: drop shadows first, then the shape itself.

## Layer Blur

Layer blur applies to the entire shape — blurring its fills, strokes, and content uniformly. It's simpler than a drop shadow because there's no offset or color tint. Just blur the shape and composite the blurred result.

The implementation reuses the Gaussian blur and writes the blurred result back into the shape's FBO using `blitFramebuffer`:

```typescript
private renderLayerBlur(effect: LayerBlurEffect, shapeFBO: FramebufferEntry, ...): void {
  if (effect.radius <= 0) return;

  const blurredFBO = this.applyGaussianBlur(shapeFBO, effect.radius, canvasWidth, canvasHeight);

  // Copy blurred result back into shapeFBO
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blurredFBO.fbo);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, shapeFBO.fbo);
  gl.blitFramebuffer(
    0, 0, canvasWidth, canvasHeight,
    0, 0, canvasWidth, canvasHeight,
    gl.COLOR_BUFFER_BIT, gl.NEAREST
  );

  this.fbManager.release(blurredFBO);
}
```

`blitFramebuffer` is a WebGL 2 function that copies pixels between framebuffers without a shader. It's faster than drawing a fullscreen quad when all you need is a pixel-for-pixel copy. We use `NEAREST` filtering because both FBOs are the same size — no interpolation needed.

By writing back into `shapeFBO`, the caller doesn't need to know whether blur was applied. It composites `shapeFBO` to the screen either way. The blur is invisible to the orchestration logic — an elegant separation of concerns.

Note the asymmetry: `blitFramebuffer` works here because both source and destination are non-multisampled FBO textures. We can't use it to read from the canvas's default framebuffer, because that framebuffer may be multisampled (antialiased). This matters for blend mode compositing, as we'll see next.

## Blend Modes

WebGL's built-in blending — `gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` — implements alpha compositing. It covers "normal" blend mode. But Photoshop-style blend modes like multiply, screen, overlay, and the rest require per-pixel arithmetic that `blendFunc` can't express.

The solution: a shader that takes two textures — source (the shape) and destination (what's already on the canvas) — and performs the blend in the fragment shader. The blend mode is selected by an integer uniform that indexes into a switch statement.

### The 16 Modes

The blend fragment shader implements every mode as a function over two RGB values:

```glsl
vec3 blendMultiply(vec3 base, vec3 blend) { return base * blend; }
vec3 blendScreen(vec3 base, vec3 blend) { return 1.0 - (1.0 - base) * (1.0 - blend); }
vec3 blendOverlay(vec3 base, vec3 blend) {
  return mix(
    2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    step(0.5, base)
  );
}
vec3 blendDarken(vec3 base, vec3 blend) { return min(base, blend); }
vec3 blendLighten(vec3 base, vec3 blend) { return max(base, blend); }
```

Multiply darkens: each channel is multiplied, so a bright pixel × a dim pixel = a dim pixel. Screen lightens: the inverse of multiplying the inverses, like stacking two photographic slides on a light table. Overlay combines them: multiply where the base is dark, screen where it's light — emphasizing contrast.

The more complex modes — color dodge, color burn, soft light — involve conditional formulas with division guards:

```glsl
vec3 blendColorDodge(vec3 base, vec3 blend) {
  return mix(
    min(base / max(1.0 - blend, 0.001), vec3(1.0)),
    vec3(0.0),
    step(base, vec3(0.0))
  );
}
```

The `max(1.0 - blend, 0.001)` prevents division by zero when the blend color is pure white. The `step(base, vec3(0.0))` returns 0.0 (black) when the base is zero — the mathematically correct result of dodging nothing.

The last four modes — hue, saturation, color, luminosity — operate in HSL space. They need helper functions:

```glsl
float luminance(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float saturation(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }

vec3 setLuminance(vec3 c, float l) {
  float d = l - luminance(c);
  return clipColor(c + d);
}

vec3 blendColor(vec3 base, vec3 blend) {
  return setLuminance(blend, luminance(base));
}
```

"Color" blend mode preserves the base layer's brightness while applying the source layer's hue and saturation. "Luminosity" does the opposite — preserves hue and saturation, replaces brightness. These are essential for photo editing and color grading.

### Alpha Handling

The tricky part of blend modes isn't the color math — it's getting the alpha right. FBO textures store premultiplied alpha (where RGB values are already multiplied by alpha). The shader must unpremultiply before blending and re-apply alpha compositing after:

```glsl
void main() {
  vec4 src = texture(u_srcTexture, v_texCoord);
  vec4 dst = texture(u_dstTexture, v_texCoord);

  // Unpremultiply
  vec3 srcRGB = src.a > 0.001 ? src.rgb / src.a : src.rgb;
  vec3 dstRGB = dst.a > 0.001 ? dst.rgb / dst.a : dst.rgb;

  vec3 blended;
  switch (u_blendMode) {
    case 0:  blended = srcRGB; break;        // normal
    case 1:  blended = blendMultiply(dstRGB, srcRGB); break;
    // ... 14 more cases ...
    default: blended = srcRGB; break;
  }

  // Composite with alpha
  float srcA = src.a * u_opacity;
  vec3 resultRGB = blended * srcA + dstRGB * dst.a * (1.0 - srcA);
  float resultA = srcA + dst.a * (1.0 - srcA);

  outColor = vec4(resultRGB, resultA);
}
```

The `0.001` guard prevents division by zero on fully transparent pixels. Without it, transparent pixels produce NaN values that corrupt everything they touch. The blend mode switch selects the color math. Then the result is composited using the standard "source over" formula with the shape's opacity applied.

### Capturing the Canvas

Blend modes need to read what's already on the canvas. This poses a problem: you can't sample the default framebuffer as a texture in WebGL. You have to capture it first.

The obvious approach is `blitFramebuffer` — copy pixels from the canvas framebuffer to an FBO texture. But the canvas is typically multisampled (we create it with `antialias: true`), and `blitFramebuffer` from a multisampled source to a non-multisampled destination fails on Chrome with the ANGLE backend. This isn't a spec violation — the spec allows it — but Chrome's WebGL implementation rejects it with `GL_INVALID_OPERATION`.

The workaround is `readPixels`:

```typescript
compositeWithBlendMode(srcFBO, blendMode, opacity, canvasWidth, canvasHeight): void {
  const dstFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
  const bufferSize = canvasWidth * canvasHeight * 4;

  if (!this.resolvePixelBuffer || this.resolvePixelBuffer.length < bufferSize) {
    this.resolvePixelBuffer = new Uint8Array(bufferSize);
  }

  // Read canvas pixels to CPU
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, canvasWidth, canvasHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.resolvePixelBuffer);

  // Upload to FBO texture
  gl.bindTexture(gl.TEXTURE_2D, dstFBO.texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, canvasWidth, canvasHeight,
    gl.RGBA, gl.UNSIGNED_BYTE, this.resolvePixelBuffer);
```

This is a CPU-GPU roundtrip: pixels go from GPU → CPU (`readPixels`) → GPU (`texSubImage2D`). It's slower than a direct GPU-to-GPU copy. At 1440×900, the pixel buffer is about 5.2MB. On modern hardware, this costs 1-5ms per blend mode composite — noticeable if you have many blended shapes, but acceptable for typical use. The pixel buffer is allocated once and reused across frames to avoid garbage collection pressure.

After capture, the blend mode shader receives both textures:

```typescript
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, srcFBO.texture); // the shape
gl.uniform1i(blend.uniforms.u_srcTexture, 0);

gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, dstFBO.texture); // the canvas content
gl.uniform1i(blend.uniforms.u_dstTexture, 1);

gl.uniform1i(blend.uniforms.u_blendMode, getBlendModeIndex(blendMode));
gl.uniform1f(blend.uniforms.u_opacity, opacity);

gl.disable(gl.BLEND); // shader handles compositing
gl.drawArrays(gl.TRIANGLES, 0, 6);
gl.enable(gl.BLEND);
```

Blending is disabled during the draw call because the shader already performs the "source over" compositing. If `gl.BLEND` were enabled, the hardware would blend the shader output again — double-compositing, producing washed-out results.

## The Orchestration Pipeline

The `EffectRenderer` ties everything together. Its main method, `renderNodeWithEffects`, takes a render callback, draws the shape to an FBO, processes effects in order, and composites the result to the canvas.

The full pipeline for a single node:

```
Shape geometry → FBO (off-screen)
    ↓
Drop shadows (blur + offset + color → canvas, behind shape)
    ↓
Layer blur (blur → write back into shape FBO)
    ↓
Composite shape to canvas (with blend mode, or normal passthrough)
    ↓
Inner shadows (on top, masked by shape alpha)
    ↓
Release FBO
```

Here's the orchestration:

```typescript
renderNodeWithEffects(
  effects: Effect[] | undefined,
  blendMode: BlendMode,
  renderNodeFn: () => void,
  canvasWidth: number,
  canvasHeight: number
): void {
  const visibleEffects = (effects ?? []).filter((e) => e.visible);

  // Render shape to off-screen FBO
  const shapeFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shapeFBO.fbo);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  renderNodeFn();
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);  // back to canvas

  // Drop shadows (behind the shape)
  for (const effect of visibleEffects) {
    if (effect.type === 'drop-shadow') {
      this.renderDropShadow(effect, shapeFBO, canvasWidth, canvasHeight);
    }
  }

  // Layer blur (modifies shapeFBO in place)
  for (const effect of visibleEffects) {
    if (effect.type === 'layer-blur') {
      this.renderLayerBlur(effect, shapeFBO, canvasWidth, canvasHeight);
    }
  }

  // Composite shape to canvas
  if (blendMode !== 'normal') {
    this.compositeWithBlendMode(shapeFBO, blendMode, 1.0, canvasWidth, canvasHeight);
  } else {
    this.compositeToScreen(shapeFBO, canvasWidth, canvasHeight);
  }

  this.fbManager.release(shapeFBO);
}
```

The render callback `renderNodeFn` is a closure from the shape renderer. It sets up the shape's shader, binds the VAO, configures the view-projection matrix, and draws the geometry — the same code path as direct rendering, but targeting the FBO instead of the canvas.

### The Decision Gate

Not every node needs multi-pass rendering. A shape with no effects and normal blend mode should be drawn directly — no FBO, no compositing overhead. The `needsMultiPass` method is the fast check:

```typescript
needsMultiPass(effects: Effect[] | undefined, blendMode: BlendMode | undefined): boolean {
  if (blendMode && blendMode !== 'normal') return true;
  if (!effects || effects.length === 0) return false;
  return effects.some((e) => e.visible);
}
```

The shape renderer calls this for every node in the scene graph:

```typescript
if (this.effectRenderer.needsMultiPass(node.effects, node.blendMode)) {
  this.effectRenderer.renderNodeWithEffects(
    node.effects,
    node.blendMode,
    () => {
      this.renderer.useProgram(this.program!);
      this.renderer.bindVAO(this.vao);
      gl.uniformMatrix3fv(this.program!.uniforms.u_viewProjection, false, vpArray);
      renderShape();
    },
    canvasWidth,
    canvasHeight
  );
  // Restore shader state for next node
  this.renderer.useProgram(this.program!);
  this.renderer.bindVAO(this.vao);
} else {
  renderShape();
}
```

After effect rendering completes, the shape renderer must restore its shader program and VAO state. The effect renderer uses its own programs and quad VAO, which overwrites the renderer's cached state. Without the restoration, the next shape would try to draw with the composite shader instead of the fill shader — either producing garbage or drawing nothing.

### Compositing with Normal Blend Mode

When the blend mode is normal, there's no need for the expensive canvas-capture path. A simpler composite draws the FBO texture to the screen:

```typescript
private compositeToScreen(fbo: FramebufferEntry, ...): void {
  const { composite, quadVAO } = this.programs;
  this.renderer.useProgram(composite);
  this.renderer.bindVAO(quadVAO);

  gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
  gl.uniform1i(composite.uniforms.u_texture, 0);

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
```

The composite shader is a passthrough — `outColor = texture(u_texture, v_texCoord)`. The magic is in the blend function: `gl.ONE, gl.ONE_MINUS_SRC_ALPHA` instead of the usual `gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA`.

Why? Because the FBO content is premultiplied. When we rendered the shape into the FBO, we used `blendFuncSeparate` with `gl.ONE` for the alpha channel. This means the RGB values in the FBO are already multiplied by alpha. Using `SRC_ALPHA` again would multiply by alpha a second time — producing pixels that are too dark and too transparent. `gl.ONE` for the source says "use the RGB values as-is, they already have alpha baked in."

After the composite, the standard blend function is restored for subsequent shapes.

## The State Management Minefield

FBO-based rendering interacts with almost every piece of WebGL global state: the bound framebuffer, the viewport, the clear color, the blend function, the scissor test, the depth test, and the currently bound program and VAO. Getting any of these wrong produces bugs that are subtle, intermittent, and maddening.

### The Clear Color Leak

The FramebufferManager clears FBOs with transparent black: `gl.clearColor(0, 0, 0, 0)`. This is correct for FBOs — they need a transparent background. But `clearColor` is global state. After the FBO clear, the next call to `gl.clear()` — which is `WebGLRenderer.clear()` at the top of the next frame — would clear the canvas to transparent black instead of the dark gray `#1A1A1A` background.

The fix is in `WebGLRenderer.clear()`:

```typescript
clear(color?: [number, number, number, number]): void {
  const c = color ?? [0.102, 0.102, 0.102, 1.0];
  gl.clearColor(c[0], c[1], c[2], c[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}
```

It always sets `clearColor` before clearing, never relying on whatever value was left by previous operations. This pattern — "set before use, never assume" — is essential for any code that shares WebGL state with FBO operations.

### The Scissor Test Interaction

Artboards use `gl.scissorTest` to clip their children to the artboard bounds. When a child has a drop shadow, the effect renderer needs to clear FBOs — but `gl.clear()` is clipped by the scissor test. A full-canvas FBO clear with scissor enabled only clears the artboard-sized rectangle, leaving stale content outside that rectangle.

The effect renderer saves and restores scissor state around every operation that touches FBOs:

```typescript
const scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);

// ... FBO clears and blur passes ...

if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);
```

Scissor is re-enabled for compositing — the shadow and shape should be clipped to the artboard bounds when drawn to the canvas. But it must be disabled for FBO clears and blur passes, which operate on the full FBO texture regardless of artboard bounds.

### The VAO Cache Desync

This was the most insidious bug in the entire rendering pipeline. The symptom: shapes after the first effect-rendered shape would disappear. They'd render on one frame, vanish the next, flicker back. The cause took days to find.

`WebGLRenderer` caches the currently bound VAO to avoid redundant `gl.bindVertexArray()` calls:

```typescript
bindVAO(vao: WebGLVertexArrayObject | null): void {
  if (this.currentVAO !== vao) {
    this.gl.bindVertexArray(vao);
    this.currentVAO = vao;
  }
}
```

The early version of the effect renderer called `gl.bindVertexArray(quadVAO)` directly — bypassing the cache. After the effect pass, the cache still thought the shape VAO was bound. When the next shape called `this.renderer.bindVAO(shapeVAO)`, the cache said "already bound" and skipped the call. But the actual GL state had the quad VAO bound. The shape drew with no vertex data — invisible.

The fix is a hard rule: **never call `gl.bindVertexArray()` or `gl.useProgram()` directly.** Always go through `renderer.bindVAO()` and `renderer.useProgram()`. These methods are the single source of truth for WebGL state. Any bypass creates a desync between the cache and reality.

### The Depth Test

Fullscreen quads for compositing should not interact with the depth buffer. If depth testing is enabled, a fullscreen quad at z=0 would pass the depth test only where the depth buffer allows it — which may be nowhere, if shapes have already written their depth values. And the quad would write z=0 to the depth buffer, blocking subsequent shapes.

```typescript
gl.disable(gl.DEPTH_TEST);
// ... all compositing passes ...
gl.enable(gl.DEPTH_TEST);
```

Depth test is disabled for the entire compositing sequence — drop shadows, blur, blend mode, inner shadows — and re-enabled at the end for subsequent shape rendering.

### The blendFuncSeparate

When rendering the shape into the FBO, we use `blendFuncSeparate` instead of `blendFunc`:

```typescript
gl.blendFuncSeparate(
  gl.SRC_ALPHA,
  gl.ONE_MINUS_SRC_ALPHA, // RGB
  gl.ONE,
  gl.ONE_MINUS_SRC_ALPHA // Alpha
);
```

The RGB channels blend normally. But the alpha channel uses `gl.ONE` for the source factor instead of `SRC_ALPHA`. Why? With `SRC_ALPHA` for both RGB and alpha, the output alpha would be `α × α` — alpha squared. When you later composite this texture to the screen, the shape would be more transparent than it should be. `gl.ONE` for the alpha source means the alpha value is written directly, preserving the correct transparency.

This is one of those details that's invisible when it works and produces subtle darkening artifacts when it doesn't.

## Integration with the Render Loop

The effect pipeline integrates into the existing render loop at a single point — the shape renderer's node traversal:

```
renderer.clear()                          // dark gray background
grid.render(vpMatrix, bounds, zoom)       // grid behind everything
onionSkinRenderer.render(...)             // ghost frames
shapeRenderer.render(sceneGraph, vpMatrix) // shapes with effects
```

Inside `shapeRenderer.render()`, each node hits the `needsMultiPass` check. Nodes with effects or non-normal blend modes go through the FBO pipeline. Everything else renders directly. The render loop doesn't know about FBOs, blur passes, or blend modes. It just tells the shape renderer to draw, and the shape renderer handles the rest.

This encapsulation is deliberate. Effects are a property of individual nodes, not a global rendering mode. A scene with 50 shapes where only 2 have drop shadows incurs FBO overhead for exactly those 2 shapes. The other 48 draw directly to the canvas with zero effect overhead.

## What We Didn't Build

**Inner shadows** use the same FBO pipeline in reverse: invert the shape's alpha — turning the filled area transparent and the surrounding area opaque — then blur this inverted mask, offset it, and mask the result to the original shape bounds. The implementation shares the existing blur and compositing shaders, adding an alpha inversion step before the blur pass. The result composites on top of the shape rather than behind it.

**Per-pixel motion blur** would require rendering a shape at multiple time offsets and accumulating the results. This is an accumulation buffer technique — render N frames, blend with weight 1/N — that the FBO system could support but hasn't been implemented.

**Downsampled blur** would improve performance for large radii by blurring a half-resolution or quarter-resolution texture and upsampling. The quality trade-off is usually acceptable for shadows, and the 4× or 16× reduction in fragment shader work is significant. The current implementation blurs at full resolution, which is simple and correct but leaves performance on the table.

## Lessons

**Never bypass a state-caching wrapper with direct GL calls.** The `WebGLRenderer` caches the bound VAO and program to skip redundant state changes. Calling `gl.bindVertexArray()` directly leaves the cache out of sync with reality — subsequent `bindVAO()` calls think the old VAO is still bound and skip the rebind. The symptom is shapes that flicker or vanish after effect rendering. The rule is absolute: all state changes go through the renderer's methods.

**Set before use, never assume prior state.** WebGL global state — `clearColor`, `blendFunc`, scissor test, depth test — is shared across all rendering code. FBO operations set `clearColor` to transparent black; if `renderer.clear()` does not reset it, the next frame clears the canvas to the wrong color. Every function that touches global state must set what it needs and restore what it changed.

**Separable blur turns an O(N squared) problem into O(2N).** A 2D Gaussian kernel of radius 10 requires 441 texture samples per pixel. Decomposing it into a horizontal pass and a vertical pass — two 1D convolutions — requires 42 samples for the same result. The math is identical because the 2D Gaussian is the product of two 1D Gaussians. This factorization is the single most impactful optimization in the effects pipeline.

**Object pooling pays for itself on the second frame.** Creating and destroying framebuffers every frame is expensive — each requires a texture allocation, a framebuffer creation, and a completeness check. An acquire/release pool reuses FBOs across frames. A typical shadow uses three FBOs; by the second frame, all three are pooled and no allocation occurs. The pool cap prevents unbounded growth.

**The `needsMultiPass` gate keeps the fast path fast.** Most nodes have no effects and normal blend mode. Testing this upfront with a simple boolean check means those nodes skip FBO allocation, compositing, and state save/restore entirely. The overhead is one conditional per node. Only the nodes that actually need multi-pass rendering pay for it.

**Premultiplied alpha demands `blendFuncSeparate` for FBO rendering and `gl.ONE` for compositing.** When rendering into an FBO, using `SRC_ALPHA` for the alpha channel produces alpha-squared output. `blendFuncSeparate` with `gl.ONE` for alpha writes the correct value. When compositing back to the screen, `gl.ONE` for the source factor avoids double-multiplying the already-premultiplied RGB. Getting either of these wrong produces subtle darkening that is difficult to diagnose because the shapes still appear — just slightly wrong.

## What We Built

This chapter covered the complete visual effects pipeline — about 900 lines across three files:

- **FramebufferManager**: Acquire/release pooling for off-screen render targets, capped at 8 entries, clears on acquire
- **PostProcessShaders**: Four shader programs (blur, blend, shadow, composite) sharing one fullscreen quad VAO
- **Separable Gaussian blur**: Two-pass horizontal+vertical, capped at 32 samples per direction, O(2N) instead of O(N²)
- **Drop shadows**: Blur the shape silhouette, tint with color, offset in UV space, composite behind
- **Layer blur**: Blur the shape FBO, blit the result back in place
- **16 blend modes**: Per-pixel compositing in a fragment shader with premultiplied alpha handling
- **Canvas capture**: `readPixels` + `texSubImage2D` workaround for Chrome's multisampled framebuffer limitation
- **EffectRenderer**: Pipeline orchestration — shape→FBO, shadows behind, blur in place, composite, inner shadows on top
- **State management**: Clear color restoration, scissor save/restore, depth test disable during compositing, VAO cache discipline

The next chapter turns from rendering to interaction — the tool system that translates mouse clicks and keyboard shortcuts into shape creation, selection, and editing.
