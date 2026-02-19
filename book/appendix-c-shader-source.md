# Appendix C — WebGL Shader Source Code

This appendix contains every GLSL ES 3.0 shader program used in Quar Animator's rendering pipeline. There are 11 shader programs across three source files.

## Shader Inventory

| #   | Name             | Location              | Purpose                             |
| --- | ---------------- | --------------------- | ----------------------------------- |
| 1   | Shape            | ShapeRenderer.ts      | Flat color fills and strokes        |
| 2   | Gradient         | ShapeRenderer.ts      | Linear, radial, and conic gradients |
| 3   | Texture          | ShapeRenderer.ts      | Image rendering with adjustments    |
| 4   | Weight           | ShapeRenderer.ts      | Weight paint heat map visualization |
| 5   | Skinned          | ShapeRenderer.ts      | GPU bone deformation (flat color)   |
| 6   | Skinned Gradient | ShapeRenderer.ts      | GPU bone deformation (gradient)     |
| 7   | Blur             | PostProcessShaders.ts | Separable Gaussian blur             |
| 8   | Blend            | PostProcessShaders.ts | 16 compositing blend modes          |
| 9   | Shadow           | PostProcessShaders.ts | Drop shadow / inner shadow          |
| 10  | Composite        | PostProcessShaders.ts | Passthrough texture copy            |
| 11  | Grid             | Grid.ts               | Infinite adaptive grid lines        |

---

## 1. Shape Shader (Flat Color)

The simplest shader. Transforms a 2D vertex through model and view-projection matrices, outputs a uniform color.

**Vertex:**

```glsl
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

**Fragment:**

```glsl
#version 300 es
precision highp float;

uniform vec4 u_color;
out vec4 outColor;

void main() {
  outColor = u_color;
}
```

**Uniforms:** `u_viewProjection` (mat3), `u_model` (mat3), `u_color` (vec4)
**Attributes:** `a_position` (vec2)

---

## 2. Gradient Shader

Passes local-space vertex position to the fragment shader, which computes gradient interpolation based on normalized coordinates within the shape's bounding box.

**Vertex:**

```glsl
#version 300 es
precision highp float;

in vec2 a_position;

uniform mat3 u_viewProjection;
uniform mat3 u_model;

out vec2 v_localPos;

void main() {
  v_localPos = a_position;
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
```

**Fragment:**

```glsl
#version 300 es
precision highp float;

in vec2 v_localPos;

uniform int u_gradientType;     // 0 = linear, 1 = radial, 2 = conic
uniform vec4 u_stops[16];
uniform float u_offsets[16];
uniform int u_stopCount;
uniform vec4 u_bounds;          // minX, minY, maxX, maxY
uniform float u_angle;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_opacity;
uniform vec2 u_gradStart;
uniform vec2 u_gradEnd;

out vec4 outColor;

void main() {
  vec2 size = u_bounds.zw - u_bounds.xy;
  vec2 npos = size.x > 0.0 && size.y > 0.0
    ? (v_localPos - u_bounds.xy) / size
    : vec2(0.5);

  float t;
  if (u_gradientType == 0) {
    // Linear: project onto gradient axis
    vec2 gradDir = u_gradEnd - u_gradStart;
    float gradLen = length(gradDir);
    vec2 normDir = gradDir / max(gradLen, 0.001);
    t = dot(npos - u_gradStart, normDir) / max(gradLen, 0.001);
  } else if (u_gradientType == 1) {
    // Radial: distance from center
    t = length(npos - u_center) / max(u_radius, 0.001);
  } else {
    // Conic: angle from center
    vec2 d = npos - u_center;
    float a = atan(d.y, d.x) + 3.14159265;
    float startRad = u_angle * 3.14159265 / 180.0;
    t = mod(a - startRad, 6.28318530) / 6.28318530;
  }
  t = clamp(t, 0.0, 1.0);

  // Interpolate between color stops
  vec4 color = u_stops[0];
  for (int i = 1; i < 16; i++) {
    if (i >= u_stopCount) break;
    if (t <= u_offsets[i]) {
      float denom = u_offsets[i] - u_offsets[i - 1];
      float st = denom > 0.0 ? (t - u_offsets[i - 1]) / denom : 0.0;
      color = mix(u_stops[i - 1], u_stops[i], clamp(st, 0.0, 1.0));
      break;
    }
    if (i == u_stopCount - 1) color = u_stops[i];
  }
  color.a *= u_opacity;
  outColor = color;
}
```

**Uniforms:** `u_gradientType` (int), `u_stops[16]` (vec4[]), `u_offsets[16]` (float[]), `u_stopCount` (int), `u_bounds` (vec4), `u_angle` (float), `u_center` (vec2), `u_radius` (float), `u_opacity` (float), `u_gradStart` (vec2), `u_gradEnd` (vec2)

---

## 3. Texture Shader (Image Rendering)

Renders raster images with real-time color adjustments (brightness, contrast, saturation, hue, exposure, temperature) and corner radius clipping via a signed distance function.

**Vertex:**

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

**Fragment:**

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_opacity;
uniform vec4 u_tintColor;       // rgb = tint, a = mix factor
uniform float u_brightness;     // -1 to 1
uniform float u_contrast;       // -1 to 1
uniform float u_saturation;     // -1 to 1
uniform float u_hue;            // radians
uniform float u_exposure;       // -1 to 1
uniform float u_temperature;    // -1 to 1
uniform vec2 u_rectSize;        // width, height
uniform vec4 u_cornerRadius;    // TL, TR, BR, BL

out vec4 outColor;

float roundedBoxSDF(vec2 p, vec2 halfSize, vec4 radii) {
  float r = (p.x > 0.0)
    ? ((p.y > 0.0) ? radii.z : radii.y)
    : ((p.y > 0.0) ? radii.w : radii.x);
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

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

void main() {
  vec4 texColor = texture(u_texture, v_texCoord);
  vec3 c = texColor.rgb;

  c *= pow(2.0, u_exposure);                              // Exposure
  c += u_brightness;                                       // Brightness
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;              // Contrast
  float gray = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(gray), c, 1.0 + u_saturation);             // Saturation
  if (abs(u_hue) > 0.001) c = adjustHue(c, u_hue);        // Hue
  if (abs(u_temperature) > 0.001) {                        // Temperature
    c.r += u_temperature * 0.1;
    c.b -= u_temperature * 0.1;
  }
  c = clamp(c, 0.0, 1.0);

  if (u_tintColor.a > 0.0) {
    c = mix(c, u_tintColor.rgb, u_tintColor.a);            // Ghost tint
  }

  // Corner radius SDF
  vec2 pixelPos = v_texCoord * u_rectSize - u_rectSize * 0.5;
  float dist = roundedBoxSDF(pixelPos, u_rectSize * 0.5, u_cornerRadius);
  float aa = 1.0 - smoothstep(-0.5, 0.5, dist);

  outColor = vec4(c, texColor.a * u_opacity * aa);
}
```

---

## 4. Weight Visualization Shader

Renders a per-vertex colored heat map during weight painting. Each vertex carries its own RGB color computed from bone influence weights.

**Vertex:**

```glsl
#version 300 es
precision highp float;

in vec2 a_position;
in vec3 a_color;

uniform mat3 u_viewProjection;
uniform mat3 u_model;

out vec3 v_color;

void main() {
  v_color = a_color;
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
```

**Fragment:**

```glsl
#version 300 es
precision highp float;

in vec3 v_color;
uniform float u_alpha;
out vec4 fragColor;

void main() {
  fragColor = vec4(v_color, u_alpha);
}
```

---

## 5. Skinned Vertex Shader (GPU Linear Blend Skinning)

Performs bone deformation on the GPU. Each vertex has up to 4 bone influences. Paired with the flat color fragment shader (#1).

```glsl
#version 300 es
precision highp float;

in vec2 a_position;
in vec4 a_boneIndices;
in vec4 a_boneWeights;

const int MAX_BONES = 32;
uniform mat3 u_boneMatrices[32];
uniform mat3 u_viewProjection;

void main() {
  vec3 pos = vec3(a_position, 1.0);
  vec3 skinned = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 4; i++) {
    float w = a_boneWeights[i];
    if (w <= 0.0) continue;
    int idx = int(a_boneIndices[i]);
    if (idx < 0 || idx >= MAX_BONES) continue;
    skinned += w * (u_boneMatrices[idx] * pos);
    totalWeight += w;
  }

  if (totalWeight <= 0.0) skinned = pos;
  else if (abs(totalWeight - 1.0) > 0.001) skinned /= totalWeight;

  gl_Position = vec4((u_viewProjection * skinned).xy, 0.0, 1.0);
}
```

**Interleaved VBO layout:** 10 floats per vertex (stride 40 bytes):
`[posX, posY, boneIdx0, boneIdx1, boneIdx2, boneIdx3, weight0, weight1, weight2, weight3]`

---

## 6. Skinned Gradient Vertex Shader

Identical to #5 but passes bind-pose coordinates as `v_localPos` for gradient interpolation. This ensures gradients follow the original shape geometry rather than the bone-deformed geometry.

```glsl
#version 300 es
precision highp float;

in vec2 a_position;
in vec4 a_boneIndices;
in vec4 a_boneWeights;

const int MAX_BONES = 32;
uniform mat3 u_boneMatrices[32];
uniform mat3 u_viewProjection;

out vec2 v_localPos;

void main() {
  v_localPos = a_position;  // Bind-pose coords for gradient fragment shader

  vec3 pos = vec3(a_position, 1.0);
  vec3 skinned = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 4; i++) {
    float w = a_boneWeights[i];
    if (w <= 0.0) continue;
    int idx = int(a_boneIndices[i]);
    if (idx < 0 || idx >= MAX_BONES) continue;
    skinned += w * (u_boneMatrices[idx] * pos);
    totalWeight += w;
  }

  if (totalWeight <= 0.0) skinned = pos;
  else if (abs(totalWeight - 1.0) > 0.001) skinned /= totalWeight;

  gl_Position = vec4((u_viewProjection * skinned).xy, 0.0, 1.0);
}
```

Paired with the gradient fragment shader (#2).

---

## 7. Blur Shader (Separable Gaussian)

Applied in two passes — horizontal then vertical — using a framebuffer ping-pong. The kernel size adapts to the blur radius.

**Vertex** (shared by all post-process shaders):

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

**Fragment:**

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec2 u_direction;   // (1/width, 0) or (0, 1/height)
uniform float u_radius;

out vec4 outColor;

void main() {
  vec4 color = vec4(0.0);
  float total = 0.0;

  float sigma = max(u_radius / 3.0, 0.001);
  float twoSigmaSq = 2.0 * sigma * sigma;

  int samples = min(int(ceil(u_radius)), 32);

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

---

## 8. Blend Mode Shader

Implements all 16 W3C compositing blend modes in a single fragment shader, selected by a uniform integer.

**Fragment** (vertex shader is the same post-process quad as #7):

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_srcTexture;
uniform sampler2D u_dstTexture;
uniform int u_blendMode;
uniform float u_opacity;

out vec4 outColor;

vec3 blendMultiply(vec3 b, vec3 s) { return b * s; }
vec3 blendScreen(vec3 b, vec3 s) { return 1.0 - (1.0 - b) * (1.0 - s); }
vec3 blendOverlay(vec3 b, vec3 s) {
  return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
}
vec3 blendDarken(vec3 b, vec3 s) { return min(b, s); }
vec3 blendLighten(vec3 b, vec3 s) { return max(b, s); }
vec3 blendColorDodge(vec3 b, vec3 s) {
  return mix(min(b / max(1.0 - s, 0.001), vec3(1.0)), vec3(0.0), step(b, vec3(0.0)));
}
vec3 blendColorBurn(vec3 b, vec3 s) {
  return mix(1.0 - min((1.0 - b) / max(s, 0.001), vec3(1.0)), vec3(1.0), step(vec3(1.0), b));
}
vec3 blendHardLight(vec3 b, vec3 s) {
  return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, s));
}
vec3 blendSoftLight(vec3 b, vec3 s) {
  vec3 d = mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25)));
  return mix(
    b - (1.0 - 2.0 * s) * b * (1.0 - b),
    b + (2.0 * s - 1.0) * (d - b),
    step(0.5, s)
  );
}
vec3 blendDifference(vec3 b, vec3 s) { return abs(b - s); }
vec3 blendExclusion(vec3 b, vec3 s) { return b + s - 2.0 * b * s; }

// HSL helpers
float luminance(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float saturation(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 clipColor(vec3 c) {
  float l = luminance(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / (l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l);
  return c;
}
vec3 setLuminance(vec3 c, float l) { return clipColor(c + l - luminance(c)); }
vec3 setSaturation(vec3 c, float s) {
  float cs = saturation(c);
  if (cs < 0.001) return vec3(luminance(c));
  return mix(vec3(luminance(c)), c, s / cs);
}

vec3 blendHue(vec3 b, vec3 s) {
  return setLuminance(setSaturation(s, saturation(b)), luminance(b));
}
vec3 blendSaturation(vec3 b, vec3 s) {
  return setLuminance(setSaturation(b, saturation(s)), luminance(b));
}
vec3 blendColor(vec3 b, vec3 s) { return setLuminance(s, luminance(b)); }
vec3 blendLuminosity(vec3 b, vec3 s) { return setLuminance(b, luminance(s)); }

void main() {
  vec4 src = texture(u_srcTexture, v_texCoord);
  vec4 dst = texture(u_dstTexture, v_texCoord);

  vec3 srcRGB = src.a > 0.001 ? src.rgb / src.a : src.rgb;
  vec3 dstRGB = dst.a > 0.001 ? dst.rgb / dst.a : dst.rgb;

  vec3 blended;
  switch (u_blendMode) {
    case 0:  blended = srcRGB; break;                        // normal
    case 1:  blended = blendMultiply(dstRGB, srcRGB); break;
    case 2:  blended = blendScreen(dstRGB, srcRGB); break;
    case 3:  blended = blendOverlay(dstRGB, srcRGB); break;
    case 4:  blended = blendDarken(dstRGB, srcRGB); break;
    case 5:  blended = blendLighten(dstRGB, srcRGB); break;
    case 6:  blended = blendColorDodge(dstRGB, srcRGB); break;
    case 7:  blended = blendColorBurn(dstRGB, srcRGB); break;
    case 8:  blended = blendHardLight(dstRGB, srcRGB); break;
    case 9:  blended = blendSoftLight(dstRGB, srcRGB); break;
    case 10: blended = blendDifference(dstRGB, srcRGB); break;
    case 11: blended = blendExclusion(dstRGB, srcRGB); break;
    case 12: blended = blendHue(dstRGB, srcRGB); break;
    case 13: blended = blendSaturation(dstRGB, srcRGB); break;
    case 14: blended = blendColor(dstRGB, srcRGB); break;
    case 15: blended = blendLuminosity(dstRGB, srcRGB); break;
    default: blended = srcRGB; break;
  }

  float srcA = src.a * u_opacity;
  vec3 resultRGB = blended * srcA + dstRGB * dst.a * (1.0 - srcA);
  float resultA = srcA + dst.a * (1.0 - srcA);

  outColor = vec4(resultRGB, resultA);
}
```

**Blend mode index mapping:**

| Index | Mode        | Index | Mode       |
| ----- | ----------- | ----- | ---------- |
| 0     | normal      | 8     | hard-light |
| 1     | multiply    | 9     | soft-light |
| 2     | screen      | 10    | difference |
| 3     | overlay     | 11    | exclusion  |
| 4     | darken      | 12    | hue        |
| 5     | lighten     | 13    | saturation |
| 6     | color-dodge | 14    | color      |
| 7     | color-burn  | 15    | luminosity |

---

## 9. Shadow Shader

Reads the alpha channel from a pre-rendered silhouette texture, applies the shadow color, opacity, and offset.

**Fragment** (vertex shader is the post-process quad):

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

---

## 10. Composite Shader (Passthrough)

Copies a texture to the output with no transformation. Used for final FBO-to-screen compositing.

**Fragment** (vertex shader is the post-process quad):

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texCoord);
}
```

---

## 11. Grid Shader

Renders the infinite adaptive grid. Grid lines are generated as `gl.LINES` primitives with per-vertex color (distinguishing major lines, minor lines, and axis lines).

**Vertex:**

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

**Fragment:**

```glsl
#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
```

## Architecture Notes

**Coordinate system.** All vertex shaders operate in 2D with homogeneous coordinates (vec3 with w=1.0). The `u_viewProjection` and `u_model` uniforms are 3×3 affine matrices — not 4×4. This is sufficient for 2D transforms (translate, rotate, scale, skew) and avoids the overhead of a full 3D pipeline.

**State caching.** The `WebGLRenderer` wraps `gl.useProgram()` and `gl.bindVertexArray()` with internal state checks to avoid redundant GL calls. All rendering code must use these wrapped methods — calling GL directly causes the cache to desync, leading to invisible shapes (the VAO cache desync bug described in Chapter 36).

**Post-process pipeline.** All post-effect shaders (blur, blend, shadow, composite) share the same vertex shader and render to a fullscreen quad (two triangles covering clip space -1 to +1). The blur shader runs twice per blur pass (horizontal then vertical) with FBO ping-pong.

**GPU skinning limits.** The skinned shaders support up to 32 bones per mesh (`MAX_BONES = 32`). Meshes exceeding this limit fall back to CPU deformation via `deformVertices()`. The 4-bone-per-vertex limit covers the vast majority of animation use cases.
