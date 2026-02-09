/**
 * PostProcessShaders - Shader programs for post-processing effects
 *
 * Provides:
 * - Gaussian blur (separable 2-pass)
 * - Blend mode compositing (16 blend modes)
 * - Shadow compositing
 * - Fullscreen quad helper
 */

import type { WebGLRenderer, ShaderProgram } from './WebGLRenderer';

// ============================================================================
// Fullscreen Quad
// ============================================================================

/**
 * Create a VAO for a fullscreen quad (two triangles covering NDC -1..1).
 * UV coordinates go from 0..1.
 */
export function createFullscreenQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  // positions (x,y) + texcoords (u,v) interleaved
  const data = new Float32Array([
    // Triangle 1
    -1, -1, 0, 0,
    1, -1, 1, 0,
    -1, 1, 0, 1,
    // Triangle 2
    -1, 1, 0, 1,
    1, -1, 1, 0,
    1, 1, 1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  // a_position at location 0
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

  // a_texCoord at location 1
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return vao;
}

// ============================================================================
// Gaussian Blur Shader (separable 2-pass)
// ============================================================================

const BLUR_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const BLUR_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec2 u_direction;  // (1/w, 0) or (0, 1/h)
uniform float u_radius;

out vec4 outColor;

void main() {
  vec4 color = vec4(0.0);
  float total = 0.0;

  // Compute sigma from radius (radius = 3*sigma approximately)
  float sigma = max(u_radius / 3.0, 0.001);
  float twoSigmaSq = 2.0 * sigma * sigma;

  int samples = int(ceil(u_radius));
  samples = min(samples, 32);  // Limit for performance

  for (int i = -samples; i <= samples; i++) {
    float fi = float(i);
    float weight = exp(-(fi * fi) / twoSigmaSq);
    vec2 offset = u_direction * fi;
    color += texture(u_texture, v_texCoord + offset) * weight;
    total += weight;
  }

  outColor = color / total;
}
`;

// ============================================================================
// Blend Mode Composite Shader
// ============================================================================

const BLEND_VERTEX = BLUR_VERTEX;

const BLEND_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_srcTexture;
uniform sampler2D u_dstTexture;
uniform int u_blendMode;
uniform float u_opacity;

out vec4 outColor;

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
vec3 blendColorDodge(vec3 base, vec3 blend) {
  return mix(min(base / max(1.0 - blend, 0.001), vec3(1.0)), vec3(0.0), step(base, vec3(0.0)));
}
vec3 blendColorBurn(vec3 base, vec3 blend) {
  return mix(1.0 - min((1.0 - base) / max(blend, 0.001), vec3(1.0)), vec3(1.0), step(vec3(1.0), base));
}
vec3 blendHardLight(vec3 base, vec3 blend) {
  return mix(
    2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    step(0.5, blend)
  );
}
vec3 blendSoftLight(vec3 base, vec3 blend) {
  vec3 d = mix(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, step(base, vec3(0.25)));
  return mix(base - (1.0 - 2.0 * blend) * base * (1.0 - base), base + (2.0 * blend - 1.0) * (d - base), step(0.5, blend));
}
vec3 blendDifference(vec3 base, vec3 blend) { return abs(base - blend); }
vec3 blendExclusion(vec3 base, vec3 blend) { return base + blend - 2.0 * base * blend; }

// HSL helpers for hue/saturation/color/luminosity blend modes
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
vec3 setLuminance(vec3 c, float l) {
  float d = l - luminance(c);
  return clipColor(c + d);
}
// Simplified setSaturation — sets saturation by scaling around gray
vec3 setSaturation(vec3 c, float s) {
  float curSat = saturation(c);
  if (curSat < 0.001) return vec3(luminance(c));
  return mix(vec3(luminance(c)), c, s / curSat);
}

vec3 blendHue(vec3 base, vec3 blend) {
  return setLuminance(setSaturation(blend, saturation(base)), luminance(base));
}
vec3 blendSaturation(vec3 base, vec3 blend) {
  return setLuminance(setSaturation(base, saturation(blend)), luminance(base));
}
vec3 blendColor(vec3 base, vec3 blend) {
  return setLuminance(blend, luminance(base));
}
vec3 blendLuminosity(vec3 base, vec3 blend) {
  return setLuminance(base, luminance(blend));
}

void main() {
  vec4 src = texture(u_srcTexture, v_texCoord);
  vec4 dst = texture(u_dstTexture, v_texCoord);

  // Pre-multiply alpha handling: unpremultiply
  vec3 srcRGB = src.a > 0.001 ? src.rgb / src.a : src.rgb;
  vec3 dstRGB = dst.a > 0.001 ? dst.rgb / dst.a : dst.rgb;

  vec3 blended;
  switch (u_blendMode) {
    case 0:  blended = srcRGB; break;  // normal
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

  // Composite with alpha: source over with blended color
  float srcA = src.a * u_opacity;
  vec3 resultRGB = blended * srcA + dstRGB * dst.a * (1.0 - srcA);
  float resultA = srcA + dst.a * (1.0 - srcA);

  outColor = vec4(resultRGB, resultA);
}
`;

// ============================================================================
// Shadow Composite Shader
// ============================================================================

const SHADOW_VERTEX = BLUR_VERTEX;

const SHADOW_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_shadowTexture;
uniform vec4 u_shadowColor;
uniform float u_opacity;
uniform vec2 u_offset;  // pixel offset in UV space

out vec4 outColor;

void main() {
  float shadowAlpha = texture(u_shadowTexture, v_texCoord - u_offset).a;
  outColor = vec4(u_shadowColor.rgb, shadowAlpha * u_opacity * u_shadowColor.a);
}
`;

// ============================================================================
// Composite Passthrough Shader
// ============================================================================

const COMPOSITE_VERTEX = BLUR_VERTEX;

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texCoord);
}
`;

// ============================================================================
// Blend Mode Index Mapping
// ============================================================================

const BLEND_MODE_INDICES: Record<string, number> = {
  'normal': 0,
  'multiply': 1,
  'screen': 2,
  'overlay': 3,
  'darken': 4,
  'lighten': 5,
  'color-dodge': 6,
  'color-burn': 7,
  'hard-light': 8,
  'soft-light': 9,
  'difference': 10,
  'exclusion': 11,
  'hue': 12,
  'saturation': 13,
  'color': 14,
  'luminosity': 15,
};

export function getBlendModeIndex(mode: string): number {
  return BLEND_MODE_INDICES[mode] ?? 0;
}

// ============================================================================
// Shader Program Management
// ============================================================================

export interface PostProcessPrograms {
  blur: ShaderProgram;
  blend: ShaderProgram;
  shadow: ShaderProgram;
  composite: ShaderProgram;
  quadVAO: WebGLVertexArrayObject;
}

export function createPostProcessPrograms(renderer: WebGLRenderer): PostProcessPrograms {
  const blur = renderer.createShaderProgram(
    'postprocess_blur',
    BLUR_VERTEX,
    BLUR_FRAGMENT,
    ['a_position', 'a_texCoord'],
    ['u_texture', 'u_direction', 'u_radius']
  );
  const blend = renderer.createShaderProgram(
    'postprocess_blend',
    BLEND_VERTEX,
    BLEND_FRAGMENT,
    ['a_position', 'a_texCoord'],
    ['u_srcTexture', 'u_dstTexture', 'u_blendMode', 'u_opacity']
  );
  const shadow = renderer.createShaderProgram(
    'postprocess_shadow',
    SHADOW_VERTEX,
    SHADOW_FRAGMENT,
    ['a_position', 'a_texCoord'],
    ['u_shadowTexture', 'u_shadowColor', 'u_opacity', 'u_offset']
  );
  const composite = renderer.createShaderProgram(
    'postprocess_composite',
    COMPOSITE_VERTEX,
    COMPOSITE_FRAGMENT,
    ['a_position', 'a_texCoord'],
    ['u_texture']
  );
  const quadVAO = createFullscreenQuad(renderer.context);

  return { blur, blend, shadow, composite, quadVAO };
}

export function disposePostProcessPrograms(gl: WebGL2RenderingContext, programs: PostProcessPrograms): void {
  gl.deleteVertexArray(programs.quadVAO);
}
