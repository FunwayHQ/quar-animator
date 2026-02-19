# Texture & Image Rendering

## Raster Inside Vector

A vector editor deals in paths, fills, and strokes. But users need to import photographs, texture backgrounds, and reference images. The moment you support raster images, you're running a second rendering pipeline alongside the vector one — a pipeline that creates WebGL textures from pixel data, maps them onto screen-space quads, and applies per-pixel adjustments entirely on the GPU.

This chapter builds that pipeline: asynchronous texture loading with caching, a textured quad renderer with UV mapping, a fragment shader that performs six image adjustments in real time, a signed distance function for rounded corners, and the resource management that prevents WebGL memory leaks as images are added and removed.

## The ImageNode

An image in the scene graph carries everything needed for rendering:

```typescript
export interface ImageNode extends BaseNode {
  type: 'image';
  src: string; // data URI or URL
  width: number;
  height: number;
  naturalWidth: number; // original pixel dimensions
  naturalHeight: number;
  cornerRadius: [number, number, number, number]; // [TL, TR, BR, BL]
  adjustments?: ImageAdjustments;
  vertexOffsets?: [Vector2, Vector2, Vector2, Vector2]; // free-form distortion
}
```

The `src` field is a data URI — `data:image/png;base64,...` — for imported images. We store images as data URIs rather than file paths because the editor runs in a browser with no filesystem access. When the user drags a PNG onto the canvas, we read it with `FileReader.readAsDataURL()` and store the result directly on the node. This makes serialization trivial (the image data is already a string) at the cost of ~33% base64 overhead, which we address with a binary file format in a later chapter.

The `adjustments` field is optional — most images use defaults (all zeros). When present, adjustments are applied entirely in the fragment shader. No CPU-side pixel manipulation, no intermediate canvases, no re-encoding. Drag a slider, update a uniform, the GPU does the rest at 60fps.

## Texture Creation and Caching

WebGL can't draw a data URI. It needs a `WebGLTexture` object — GPU memory containing the decoded pixel data. Creating one requires loading the image, uploading it to the GPU, and configuring sampling parameters. This is asynchronous (image decoding takes time) and expensive (GPU memory is limited), so we cache aggressively and load lazily.

### The Lazy Loading Pattern

```typescript
getTexture(src: string): WebGLTexture | null {
  // Cache hit — return immediately
  const cached = this.textureCache.get(src);
  if (cached) return cached;

  // Already loading — don't start a second request
  if (this.pendingImages.has(src)) return null;

  // Start async load
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 50)}`));
    img.src = src;
  });

  this.pendingImages.set(src, promise);

  promise
    .then((img) => {
      this.pendingImages.delete(src);
      const gl = this.renderer.context;
      const texture = gl.createTexture();
      if (!texture) return;

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.textureCache.set(src, texture);
    })
    .catch(() => {
      this.pendingImages.delete(src);
    });

  return null; // still loading
}
```

The render loop calls `getTexture` every frame for every image node. On the first call, it kicks off an async load and returns `null` — the image simply doesn't render that frame. On subsequent frames while loading, the `pendingImages` guard prevents duplicate requests. Once the image decodes, the promise callback uploads it to the GPU and stores the texture in the cache. The next frame's `getTexture` call finds it in the cache and returns it immediately. The image appears on screen with no explicit "image loaded" event handling — the render loop's natural polling takes care of it.

This fire-and-forget pattern is simple and robust. There's no loading state to manage, no event listeners to clean up, no race conditions between loading and deletion. The image either renders or it doesn't, and the user never sees a broken state — just a brief absence while the image loads (typically one or two frames for data URIs, since the data is already in memory).

### Texture Parameters

The four `texParameteri` calls configure how the GPU samples the texture:

- **`CLAMP_TO_EDGE`** for both wrap modes: UV coordinates outside 0..1 clamp to the edge pixel instead of repeating or mirroring. This prevents color bleeding at the image boundary — without it, sampling at the very edge of an image could pull in pixels from the opposite side due to how texture coordinates wrap.

- **`LINEAR_MIPMAP_LINEAR`** for minification (when the image is displayed smaller than its natural size): Trilinear filtering — interpolates between the two nearest mipmap levels and bilinearly samples within each. This is the highest quality minification available without anisotropic filtering and prevents the shimmering artifacts you see when large textures are displayed small.

- **`LINEAR`** for magnification (when the image is displayed larger): Bilinear filtering — smooth interpolation between neighboring pixels. The alternative, `NEAREST`, produces sharp pixel edges that look correct for pixel art but wrong for photographs.

- **`generateMipmap`**: Auto-generates the mipmap pyramid (half-resolution copies of the texture at each level). Required for `LINEAR_MIPMAP_LINEAR` to work. For a 1024×1024 texture, this creates 512×512, 256×256, ... down to 1×1 — about 33% extra GPU memory.

### Cache Key Design

The cache key is the `src` string itself. For data URIs, this means the key is the entire base64-encoded image — potentially hundreds of kilobytes of string. This sounds wasteful, but JavaScript's string interning means the key comparison is fast (the string already exists as the node's `src` property, so no copy is needed), and the alternative — hashing the data URI — would add complexity without meaningful benefit.

The key observation: data URIs are content-addressed. Two identical images produce identical data URIs. If the user imports the same PNG twice, they share one texture. If they import two different PNGs, even of the same dimensions, the URIs differ and they get separate textures.

## The Texture Shader

Images use a dedicated shader program — separate from the flat-color and gradient shaders. The vertex shader is minimal:

```glsl
#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

uniform mat3 u_viewProjection;
uniform mat3 u_model;

out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
```

Two attributes per vertex: `a_position` (the quad corner in local space) and `a_texCoord` (the UV coordinate). The position goes through the standard model × view-projection transform. The texture coordinate passes through unchanged — it's in texture space (0 to 1), not world space, so transforms don't apply.

The fragment shader is where the interesting work happens.

## Image Adjustments in the Fragment Shader

Six adjustment parameters modify the image in real time, all computed per pixel on the GPU:

```glsl
uniform sampler2D u_texture;
uniform float u_opacity;
uniform float u_brightness;  // -1 to 1
uniform float u_contrast;    // -1 to 1
uniform float u_saturation;  // -1 to 1
uniform float u_hue;         // radians
uniform float u_exposure;    // -1 to 1
uniform float u_temperature; // -1 to 1
```

The adjustment pipeline applies each operation in sequence:

### Exposure

```glsl
c *= pow(2.0, u_exposure);
```

Exposure simulates changing a camera's exposure time. Each unit doubles or halves the light — an exposure of 1.0 doubles brightness, -1.0 halves it. The exponential curve (`pow(2.0, ...)`) is physically accurate: real camera stops work on a power-of-two scale. At the UI level, the slider goes from -100 to +100, mapped to -1.0..+1.0 in the shader.

### Brightness

```glsl
c += u_brightness;
```

Brightness is a flat offset — add the same value to every channel. Unlike exposure, this doesn't scale with the existing value. Dark and light pixels shift by the same amount, which means highlights can clip to white while shadows stay dark (or vice versa). Photographers call this "lifting the blacks" when used positively.

### Contrast

```glsl
c = (c - 0.5) * (1.0 + u_contrast) + 0.5;
```

Contrast scales around the midpoint (0.5). Values above 0.5 get pushed further from the middle; values below get pushed closer. At `u_contrast = 1.0`, the full range is doubled — everything below mid-gray becomes black, everything above becomes white. At `u_contrast = -1.0`, everything converges to gray.

### Saturation

```glsl
float gray = dot(c, vec3(0.2126, 0.7152, 0.0722));
c = mix(vec3(gray), c, 1.0 + u_saturation);
```

Saturation interpolates between the luminance (grayscale) value and the original color. The luminance weights `(0.2126, 0.7152, 0.0722)` are the ITU-R BT.709 standard — they match human perception of brightness (green contributes most, blue least). At `u_saturation = -1.0`, the image is fully desaturated. Above 0, colors become more vivid.

### Hue Rotation

```glsl
vec3 adjustHue(vec3 color, float hueShift) {
  float cosH = cos(hueShift);
  float sinH = sin(hueShift);
  mat3 hueMatrix = mat3(
    0.299 + 0.701 * cosH + 0.168 * sinH,
    0.299 - 0.299 * cosH - 0.328 * sinH,
    0.299 - 0.299 * cosH + 1.250 * sinH,
    0.587 - 0.587 * cosH + 0.330 * sinH,
    0.587 + 0.413 * cosH + 0.035 * sinH,
    0.587 - 0.587 * cosH - 1.050 * sinH,
    0.114 - 0.114 * cosH - 0.497 * sinH,
    0.114 - 0.114 * cosH + 0.292 * sinH,
    0.114 + 0.886 * cosH - 0.203 * sinH
  );
  return clamp(hueMatrix * color, 0.0, 1.0);
}
```

Hue rotation is the most mathematically dense adjustment. The 3×3 matrix rotates the RGB color vector around the luminance axis in a way that preserves perceived brightness. The magic numbers are derived from the BT.709 luminance coefficients combined with a rotation matrix in YIQ color space. The result: red shifts toward yellow, yellow toward green, green toward cyan, and so on around the color wheel, while grays stay gray.

The UI maps the slider's -180..+180 degree range to radians before sending it to the shader. A full rotation (+180° or -180°) produces the complementary color of the original.

### Temperature

```glsl
if (abs(u_temperature) > 0.001) {
  c.r += u_temperature * 0.1;
  c.b -= u_temperature * 0.1;
}
```

Temperature is the simplest adjustment: shift warm (add red, subtract blue) or cool (subtract red, add blue). The 0.1 multiplier keeps the effect subtle — a full slider sweep shifts red and blue by ±10%, which is enough to warm a cold photo or cool a warm one without making it look obviously tinted.

### Adjustment Order Matters

The pipeline order — exposure, brightness, contrast, saturation, hue, temperature — is intentional. Exposure and brightness affect luminance before contrast reshapes it. Saturation and hue operate on the already-adjusted color. Temperature is last because it's a creative tint that should apply to the final look. Reordering these produces different results, especially for extreme values.

All six adjustments cost essentially nothing when they're at their default values (0). The shader evaluates the math regardless — there are no branches to skip individual adjustments (except for hue and temperature, which have `abs() > 0.001` guards to skip the expensive matrix multiply and the conditional addition when not needed). On a modern GPU, six per-pixel math operations across a 1920×1080 image take microseconds.

## Corner Radius with Signed Distance Functions

Images can have rounded corners — the same per-corner radius as rectangles. But images don't have tessellated outlines to clip against. They're textured quads. The corner rounding has to happen in the fragment shader, per pixel.

The technique is a signed distance function (SDF). For any pixel position, the SDF returns the distance from that pixel to the nearest edge of the rounded rectangle. Pixels inside the shape have negative distance; pixels outside have positive distance. The transition zone at distance 0 is the shape boundary:

```glsl
float roundedBoxSDF(vec2 p, vec2 halfSize, vec4 radii) {
  // Select the radius for this quadrant
  float r = (p.x > 0.0)
    ? ((p.y > 0.0) ? radii.z : radii.y)   // right side: BR or TR
    : ((p.y > 0.0) ? radii.w : radii.x);   // left side:  BL or TL

  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
```

The function works in a coordinate system centered on the rectangle. The `radii` vec4 packs the four corner radii as `(TL, TR, BR, BL)`. The quadrant selection (`p.x > 0.0`, `p.y > 0.0`) picks the right radius for each pixel's position.

The math exploits symmetry. `abs(p) - halfSize + r` maps the pixel to the space of a single corner circle. `length(max(q, 0.0))` gives the distance to the corner arc. `min(max(q.x, q.y), 0.0)` handles the straight edge regions. The final `- r` shifts the boundary to the correct position. This five-line function evaluates the exact distance for any pixel in any of the four corners, with any combination of radii.

The SDF output drives anti-aliased alpha masking:

```glsl
vec2 pixelPos = v_texCoord * u_rectSize - u_rectSize * 0.5;
float dist = roundedBoxSDF(pixelPos, u_rectSize * 0.5, u_cornerRadius);
float aa = 1.0 - smoothstep(-0.5, 0.5, dist);

outColor = vec4(c, texColor.a * u_opacity * aa);
```

`smoothstep(-0.5, 0.5, dist)` creates a smooth alpha transition across a 1-pixel boundary. At distance -0.5 (inside), alpha is 1. At distance +0.5 (outside), alpha is 0. In between, it fades smoothly. This gives anti-aliased rounded corners with no jagged edges and no geometry — just math in the fragment shader.

The SDF approach has one limitation: it works in the image's local coordinate system. When the quad's corners are moved independently via vertex offsets (free-form distortion), the SDF coordinates don't map correctly to the distorted shape. For heavily distorted images, the rounded corner effect degrades gracefully — the corners stay smooth but may not perfectly match the intended radius.

## The Image Quad

An image renders as a four-vertex quad — two triangles drawn as a `TRIANGLE_STRIP`. The vertex data is interleaved: position and texture coordinate packed together for each corner.

```typescript
renderImage(node: ImageNode, worldMatrix: Matrix3): void {
  const texture = this.getTexture(node.src);
  if (!texture) return; // Still loading

  // Switch to texture program and VAO
  this.renderer.useProgram(this.textureProgram);
  this.renderer.bindVAO(this.textureVAO);

  // Compute quad corners in local space (anchor-based, same as rectangles)
  const ax = node.transform.anchor.x;
  const ay = node.transform.anchor.y;
  const x0 = -node.width * ax;
  const y0 = -node.height * ay;
  const x1 = x0 + node.width;
  const y1 = y0 + node.height;
```

The quad corners use the same anchor logic as rectangles. With the default anchor `(0.5, 0.5)`, the image is centered on its transform position — `x0` is `-width/2`, `x1` is `+width/2`. This means rotation and scaling orbit the visual center.

### UV Mapping and the Y-Axis Flip

The trickiest part of image rendering is getting the texture coordinates right. Our world uses a Y-up coordinate system (positive Y is visually upward). But `texImage2D` loads images top-to-bottom — the first row of pixels in the source image becomes row 0 in texture memory, which corresponds to `v = 0` in texture coordinates.

The mapping must account for this:

```typescript
// BL = bottom-left of quad (lowest Y) → UV (0, 1) = bottom of texture
// BR = bottom-right          → UV (1, 1)
// TL = top-left (highest Y)  → UV (0, 0) = top of texture
// TR = top-right              → UV (1, 0)
const quadData = new Float32Array([
  blX,
  blY,
  0,
  1, // bottom-left
  brX,
  brY,
  1,
  1, // bottom-right
  tlX,
  tlY,
  0,
  0, // top-left
  trX,
  trY,
  1,
  0, // top-right
]);
```

The bottom of the quad (world Y-minimum) maps to `v = 1` (texture bottom), and the top of the quad (world Y-maximum) maps to `v = 0` (texture top). This produces a correctly oriented image without any CPU-side flipping.

Getting this wrong produces an upside-down image — one of the classic WebGL texture bugs. If you ever see a flipped image in a WebGL application, check the UV mapping first.

### The Interleaved Buffer

Position and texture coordinate are packed into a single buffer with stride 16 (4 floats × 4 bytes per float). The VAO remembers this layout:

```typescript
private initializeTextureBuffers(): void {
  const gl = this.renderer.context;

  this.textureVAO = this.renderer.createVAO();
  this.renderer.bindVAO(this.textureVAO);

  // 4 vertices × 4 floats per vertex × 4 bytes per float = 64 bytes
  this.textureVertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.textureVertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 64, gl.DYNAMIC_DRAW);

  const stride = 16; // bytes per vertex
  gl.enableVertexAttribArray(this.textureProgram.attributes.a_position);
  gl.vertexAttribPointer(this.textureProgram.attributes.a_position, 2, gl.FLOAT, false, stride, 0);

  gl.enableVertexAttribArray(this.textureProgram.attributes.a_texCoord);
  gl.vertexAttribPointer(this.textureProgram.attributes.a_texCoord, 2, gl.FLOAT, false, stride, 8);

  this.renderer.bindVAO(null);
}
```

The interleaved layout is more efficient than separate buffers here (unlike the grid, where we used separate buffers). With only four vertices, the performance difference is negligible, but the pattern — position and texture coordinate per vertex — is the natural representation and makes the per-draw update a single `bufferSubData` call.

### Setting Uniforms

After uploading the quad, the draw call sets all the uniforms. The adjustment values arrive from the node as integers (-100 to 100) and are scaled to the shader's expected range:

```typescript
const adj = node.adjustments;
gl.uniform1f(u.u_brightness, (adj?.brightness ?? 0) / 100);
gl.uniform1f(u.u_contrast, (adj?.contrast ?? 0) / 100);
gl.uniform1f(u.u_saturation, (adj?.saturation ?? 0) / 100);
gl.uniform1f(u.u_hue, ((adj?.hue ?? 0) * Math.PI) / 180); // degrees → radians
gl.uniform1f(u.u_exposure, (adj?.exposure ?? 0) / 100);
gl.uniform1f(u.u_temperature, (adj?.temperature ?? 0) / 100);

gl.uniform2f(u.u_rectSize, node.width, node.height);
gl.uniform4fv(u.u_cornerRadius, new Float32Array(node.cornerRadius));

gl.uniform1f(u.u_opacity, this.currentEffectiveOpacity);
gl.uniform4fv(u.u_tintColor, new Float32Array([0, 0, 0, 0])); // no tint for normal render
```

The `u_tintColor` uniform is `[0, 0, 0, 0]` during normal rendering — the zero alpha means "no tint." The fragment shader's `mix(c, u_tintColor.rgb, u_tintColor.a)` can blend the image's own color toward a tint color by a mix factor, which is useful for visual feedback like selection highlighting.

### Program Switching

After the draw call, we switch back to the flat-color program and VAO:

```typescript
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

gl.bindTexture(gl.TEXTURE_2D, null);

// Restore shape program + VAO
if (this.program && this.vao) {
  this.renderer.useProgram(this.program);
  this.renderer.bindVAO(this.vao);
}
```

This is necessary because `renderImage` is called mid-traversal — between rendering one path node and the next. The scene graph traversal expects the flat-color program to be active. If we left the texture program bound, the next shape would try to draw with the wrong shader and produce garbage or a crash.

The texture unbind (`bindTexture(null)`) is a safety measure. It prevents the bound texture from accidentally being modified by a later `texImage2D` call. In practice this rarely matters, but it's defensive programming that costs nothing.

## Preventing Memory Leaks

GPU textures are not garbage collected. A `WebGLTexture` occupies GPU memory until explicitly deleted with `gl.deleteTexture()`. If the user imports 50 images, deletes them all, and the textures aren't cleaned up, those 50 textures — potentially hundreds of megabytes — sit in GPU memory for the rest of the session.

We handle cleanup at two levels.

### Per-Node Disposal

When a node is removed from the scene graph, the canvas component listens for the event and disposes the associated texture:

```typescript
// In Canvas.tsx
const handleNodeRemoved = (node: Node) => {
  if (node.type === 'image' && shapeRendererRef.current) {
    shapeRendererRef.current.disposeTexture(node.src);
  }
};

sceneGraph.on('nodeRemoved', handleNodeRemoved);
```

And the disposal method deletes the GPU resource and removes it from both maps:

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

This is the hot path — it runs every time the user deletes an image node. The `pendingImages` cleanup handles the edge case where the user deletes a node whose image is still loading.

### Full Cleanup on Dispose

When the entire renderer is destroyed (page navigation, project close), all textures are disposed in bulk:

```typescript
// In ShapeRenderer.dispose():
for (const texture of this.textureCache.values()) {
  gl.deleteTexture(texture);
}
this.textureCache.clear();
this.pendingImages.clear();
```

This runs once during teardown and catches any textures that weren't individually disposed — a belt-and-suspenders approach.

## `preserveDrawingBuffer`

WebGL has a context attribute called `preserveDrawingBuffer` that affects whether the canvas retains its pixels after the browser composites them to the page. By default it's `false`, which means the browser can discard the backbuffer after presentation for better performance. This is correct for the live editor — we redraw every frame, so there's nothing to preserve.

But it matters for export. When rendering a single frame for PNG export, we need to call `canvas.toBlob()` _after_ the render completes. With `preserveDrawingBuffer: false`, the backbuffer might already be cleared by the time `toBlob()` reads it — producing a transparent or black image.

The solution is two separate canvas contexts:

```typescript
// Live editor — fast, no preservation needed
const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false, // opaque canvas for faster compositing
});

// Export — must preserve for toBlob() to work
const exportRenderer = new WebGLRenderer({
  canvas: offscreenCanvas,
  preserveDrawingBuffer: true,
  alpha: true, // transparent background for PNG
});
```

The export renderer also sets `alpha: true` so transparent regions in the rendered frame (areas outside artboards, for example) produce transparent pixels in the exported PNG rather than the canvas background color.

This is a `WebGLContextAttributes` setting — you can't change it after context creation. If you need pixel readback for _any_ purpose (screenshots, color picking, export), you must decide at context creation time. The live editor pays no performance penalty because it uses a separate, non-preserving context. The export path creates a short-lived offscreen context, renders one frame, calls `toBlob()`, and disposes it.

## Free-Form Distortion

Images can be distorted by dragging their corner points independently. The `vertexOffsets` field stores four offset vectors — one per quad corner:

```typescript
vertexOffsets?: [Vector2, Vector2, Vector2, Vector2]; // [BL, BR, TL, TR]
```

When present, each corner position is shifted by its offset before rendering:

```typescript
const vo = node.vertexOffsets;
const blX = x0 + (vo?.[0]?.x ?? 0),
  blY = y0 + (vo?.[0]?.y ?? 0);
const brX = x1 + (vo?.[1]?.x ?? 0),
  brY = y0 + (vo?.[1]?.y ?? 0);
const tlX = x0 + (vo?.[2]?.x ?? 0),
  tlY = y1 + (vo?.[2]?.y ?? 0);
const trX = x1 + (vo?.[3]?.x ?? 0),
  trY = y1 + (vo?.[3]?.y ?? 0);
```

The texture UV mapping stays the same — `(0,0)` to `(1,1)` — so the image stretches to fill the distorted quad. The GPU interpolates the texture coordinates across the two triangles, producing a perspective-like warp. This isn't true perspective projection (it's affine interpolation per triangle), but it's good enough for subtle distortion and free-form positioning.

The vertex offsets enable effects like an image being warped, stretched, or distorted into non-rectangular shapes.

## Lessons

**Fire-and-forget async loading with render-loop polling is simpler and more robust than event-driven loading.** The render loop calls `getTexture()` every frame. If the texture is cached, it renders. If it is loading, it skips. If it has not started, it kicks off the load. There is no loading state to manage, no event listener to clean up, no race condition between loading and deletion. The image either appears or it doesn't, and the transition is automatic.

**GPU image adjustments cost essentially nothing at default values.** Six per-pixel math operations — exposure, brightness, contrast, saturation, hue rotation, temperature — run in microseconds on a modern GPU even at full resolution. The few that are expensive (hue rotation's matrix multiply, temperature's conditional) have early-out guards, but the others evaluate unconditionally. Branching to skip them would cost more than the arithmetic itself.

**Signed distance functions turn geometry problems into per-pixel math.** Rounded corners on images cannot use tessellated outlines because images are textured quads, not vector paths. The `roundedBoxSDF` function computes the exact distance from any pixel to the rounded rectangle boundary in five lines of GLSL, and `smoothstep` converts that distance to anti-aliased alpha. No geometry, no clipping, no stencil buffer.

**`preserveDrawingBuffer` is a context-creation-time decision you cannot change later.** The live editor needs `false` for performance; export needs `true` for `toBlob()` to read valid pixels. The solution is two separate WebGL contexts — one fast, one correct for readback. Trying to share one context forces a permanent performance penalty on the live editor for a feature used once per export.

**Data URIs as cache keys are content-addressed for free.** Two identical images produce identical data URIs and share one GPU texture. Two different images always differ. The keys are large strings, but JavaScript's string interning makes comparison fast, and the alternative — computing a hash — adds complexity without meaningful benefit.

**Always unbind textures and restore program state when rendering mid-traversal.** `renderImage` is called between path renders during scene graph traversal. If it leaves the texture program bound, the next shape draws with the wrong shader. If it leaves a texture bound, a later `texImage2D` could accidentally modify it. Defensive cleanup costs nothing and prevents an entire class of state-leak bugs.

## What We Built

This chapter covered the raster image pipeline — a self-contained subsystem within the vector renderer:

- **Lazy texture loading**: Fire-and-forget async loading with `pendingImages` deduplication and automatic render-loop polling
- **Texture caching**: `Map<string, WebGLTexture>` keyed by data URI, with per-node disposal on `nodeRemoved` events
- **The texture shader**: Interleaved position + UV vertex layout, standard model × view-projection transform, texture sampling on unit 0
- **Six GPU adjustments**: Exposure (exponential), brightness (offset), contrast (midpoint scale), saturation (luminance mix), hue rotation (YIQ matrix), temperature (red/blue shift) — all per-pixel, all real-time
- **Rounded corners via SDF**: `roundedBoxSDF` returns signed distance per pixel, `smoothstep` converts to anti-aliased alpha
- **`preserveDrawingBuffer`**: `false` for the live editor (fast), `true` for export (pixel readback)
- **Memory management**: Individual disposal on node removal, bulk cleanup on renderer dispose, `pendingImages` cleanup for in-flight loads

The next chapter adds the visual effects pipeline — drop shadows, blur, and blend modes using framebuffer objects and multi-pass rendering.
