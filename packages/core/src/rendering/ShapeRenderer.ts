/**
 * Shape Renderer for Quar Animator
 * Renders rectangles, ellipses, and paths using WebGL 2
 */

import type {
  Matrix3,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  PathNode,
  TextNode,
  ImageNode,
  GroupNode,
  BoneNode,
  ArtboardNode,
  SymbolInstanceNode,
  SymbolDefinition,
  Node,
  Fill,
  Stroke,
  Color,
  Gradient,
  BooleanOp,
  SkinData,
} from '@quar/types';
import { resolveSymbolInstance, getResolvedRootNodes } from '../symbols/symbolResolver';
import { WebGLRenderer, type ShaderProgram } from './WebGLRenderer';
import { EffectRenderer } from './EffectRenderer';
import {
  computeBounds,
  normalizeGradientStops,
  linearGradientFromAngle,
} from '../gradient/gradientUtils';
import { SceneGraph } from '../SceneGraph';
import { mat3 } from '../math';
import { nodeToPolygon, performBoolean } from '../boolean/booleanOps';
import type { MultiPolygon } from 'polygon-clipping';
import {
  tessellatePathToVertices,
  createRectanglePath,
  createEllipsePath,
  createPolygonPath,
  createStarPath,
  generateStrokeOutlineVertices,
  applyCornerRadius,
} from '../path/pathUtils';
import earcut from 'earcut';
import { getFontManager } from '../font/FontManager';
import { textToSubpaths } from '../font/glyphConverter';
import { getTextBounds } from '../font/textMetrics';
import {
  deformVertices,
  MAX_BONES_GPU,
  buildBoneIdToIndex,
  packSkinnedVertices,
  computeBoneMatrixUniforms,
} from '@quar/rigging';
import type { AffineTransform2D } from '@quar/rigging';

// ============================================================================
// Shaders
// ============================================================================

const SHAPE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;

uniform mat3 u_viewProjection;
uniform mat3 u_model;

void main() {
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
`;

const SHAPE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 outColor;

void main() {
  outColor = u_color;
}
`;

// Gradient shaders
const GRADIENT_VERTEX_SHADER = `#version 300 es
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
`;

const MAX_GRADIENT_STOPS = 16;

const GRADIENT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_localPos;

uniform int u_gradientType;    // 0=linear, 1=radial, 2=conic
uniform vec4 u_stops[${MAX_GRADIENT_STOPS}];
uniform float u_offsets[${MAX_GRADIENT_STOPS}];
uniform int u_stopCount;
uniform vec4 u_bounds;         // minX, minY, maxX, maxY
uniform float u_angle;         // linear: angle, conic: startAngle
uniform vec2 u_center;         // radial/conic center (normalized 0-1)
uniform float u_radius;        // radial radius (normalized)
uniform float u_opacity;       // fill/stroke opacity multiplier
uniform vec2 u_gradStart;      // linear gradient start (normalized 0-1)
uniform vec2 u_gradEnd;        // linear gradient end (normalized 0-1)

out vec4 outColor;

void main() {
  vec2 size = u_bounds.zw - u_bounds.xy;
  vec2 npos = size.x > 0.0 && size.y > 0.0
    ? (v_localPos - u_bounds.xy) / size
    : vec2(0.5);

  float t;
  if (u_gradientType == 0) {
    vec2 gradDir = u_gradEnd - u_gradStart;
    float gradLen = length(gradDir);
    vec2 normDir = gradDir / max(gradLen, 0.001);
    t = dot(npos - u_gradStart, normDir) / max(gradLen, 0.001);
  } else if (u_gradientType == 1) {
    t = length(npos - u_center) / max(u_radius, 0.001);
  } else {
    vec2 d = npos - u_center;
    float a = atan(d.y, d.x) + 3.14159265;
    float startRad = u_angle * 3.14159265 / 180.0;
    t = mod(a - startRad, 6.28318530) / 6.28318530;
  }
  t = clamp(t, 0.0, 1.0);

  vec4 color = u_stops[0];
  for (int i = 1; i < ${MAX_GRADIENT_STOPS}; i++) {
    if (i >= u_stopCount) break;
    if (t <= u_offsets[i]) {
      float denom = u_offsets[i] - u_offsets[i-1];
      float st = denom > 0.0 ? (t - u_offsets[i-1]) / denom : 0.0;
      color = mix(u_stops[i-1], u_stops[i], clamp(st, 0.0, 1.0));
      break;
    }
    if (i == u_stopCount - 1) color = u_stops[i];
  }
  color.a *= u_opacity;
  outColor = color;
}
`;

// Texture shaders for image rendering
const TEXTURE_VERTEX_SHADER = `#version 300 es
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
`;

const TEXTURE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_opacity;
uniform vec4 u_tintColor;   // rgb = tint, a = mix factor (0 = no tint)
uniform float u_brightness; // -1 to 1
uniform float u_contrast;   // -1 to 1
uniform float u_saturation; // -1 to 1
uniform float u_hue;        // radians
uniform float u_exposure;   // -1 to 1
uniform float u_temperature; // -1 to 1
uniform vec2 u_rectSize;       // (width, height) for SDF masking
uniform vec4 u_cornerRadius;   // (TL, TR, BR, BL)

out vec4 outColor;

float roundedBoxSDF(vec2 p, vec2 halfSize, vec4 radii) {
  float r = (p.x > 0.0)
    ? ((p.y > 0.0) ? radii.z : radii.y)   // BR : TR
    : ((p.y > 0.0) ? radii.w : radii.x);   // BL : TL
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

  // Exposure
  c *= pow(2.0, u_exposure);

  // Brightness
  c += u_brightness;

  // Contrast
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;

  // Saturation
  float gray = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(gray), c, 1.0 + u_saturation);

  // Hue shift
  if (abs(u_hue) > 0.001) {
    c = adjustHue(c, u_hue);
  }

  // Temperature (warm/cool shift)
  if (abs(u_temperature) > 0.001) {
    c.r += u_temperature * 0.1;
    c.b -= u_temperature * 0.1;
  }

  c = clamp(c, 0.0, 1.0);

  // Tint mix (for ghost/onion skin rendering)
  if (u_tintColor.a > 0.0) {
    c = mix(c, u_tintColor.rgb, u_tintColor.a);
  }

  // Corner radius SDF masking
  vec2 pixelPos = v_texCoord * u_rectSize - u_rectSize * 0.5;
  float dist = roundedBoxSDF(pixelPos, u_rectSize * 0.5, u_cornerRadius);
  float aa = 1.0 - smoothstep(-0.5, 0.5, dist);

  outColor = vec4(c, texColor.a * u_opacity * aa);
}
`;

// Weight visualization shaders — vertex color heat map for weight painting
const WEIGHT_VERTEX_SHADER = `#version 300 es
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
`;

const WEIGHT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 fragColor;
uniform float u_alpha;

void main() {
  fragColor = vec4(v_color, u_alpha);
}
`;

// GPU-skinned flat-color vertex shader: LBS in vertex shader
const SKINNED_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec4 a_boneIndices;
in vec4 a_boneWeights;

const int MAX_BONES = ${MAX_BONES_GPU};
uniform mat3 u_boneMatrices[MAX_BONES];
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
`;

// GPU-skinned gradient vertex shader: LBS + pass bind-pose coords for gradient interpolation
const SKINNED_GRADIENT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec4 a_boneIndices;
in vec4 a_boneWeights;

const int MAX_BONES = ${MAX_BONES_GPU};
uniform mat3 u_boneMatrices[MAX_BONES];
uniform mat3 u_viewProjection;

out vec2 v_localPos;

void main() {
  v_localPos = a_position;
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
`;

// ============================================================================
// Configuration
// ============================================================================

// Ellipse segments constant reserved for future use
// const _DEFAULT_ELLIPSE_SEGMENTS = 64;
const MAX_VERTICES = 10000;
const DEFAULT_TESSELLATION_TOLERANCE = 1.0;
const ELLIPSE_TESSELLATION_TOLERANCE = 0.5;

// ============================================================================
// ShapeRenderer Class
// ============================================================================

// ============================================================================
// Tessellation Cache Types
// ============================================================================

interface TessellationCacheEntry {
  /** Geometry key — changes when shape geometry changes */
  geoKey: string;
  /** Cached tessellated vertices (from tessellatePathToVertices) */
  vertices: Float32Array;
  /** Cached earcut fill indices */
  fillIndices: number[];
  /** Cached stroke outline vertices per stroke key (width+align) */
  strokeCache: Map<string, { outline: Float32Array; indices: number[] }>;
  /** Original per-contour vertex arrays (for text stroke rendering) */
  contours?: Float32Array[];
  /** Number of tessellated vertices per contour (for compound path skinned stroke rendering) */
  contourVertexCounts?: number[];
  /** Packed [pos, boneIdx, boneWt] interleaved data for GPU skinning */
  skinnedVertexData?: Float32Array;
  /** Bone ID → uniform array index mapping for GPU skinning */
  boneIdToIndex?: Map<string, number>;
  /** Last morph offsets reference used to pack skinnedVertexData (for invalidation) */
  lastMorphOffsets?: Float32Array;
  /** Last skinData reference used to pack skinnedVertexData (for weight paint invalidation) */
  lastSkinData?: unknown;
}

/** Build a cache key string from node geometry properties */
function buildGeometryKey(node: Node): string {
  switch (node.type) {
    case 'rectangle':
      return `R:${String(node.width)}:${String(node.height)}:${String(node.transform.anchor.x)}:${String(node.transform.anchor.y)}:${String(node.cornerRadius ?? 0)}`;
    case 'ellipse':
      return `E:${node.radiusX}:${node.radiusY}`;
    case 'polygon':
      return `P:${node.radius}:${node.sides}:${node.innerRadius ?? ''}:${node.cornerRadius ?? 0}`;
    case 'path': {
      // Use a hash of all point positions/handles for paths
      const parts: string[] = ['X', String(node.closed), String(node.fillRule ?? 'nonzero')];
      const pushPoints = (pts: import('@quar/types').PathPoint[]) => {
        for (const pt of pts) {
          parts.push(`${pt.position.x}:${pt.position.y}:${pt.type}`);
          if (pt.handleIn) parts.push(`i${pt.handleIn.x}:${pt.handleIn.y}`);
          if (pt.handleOut) parts.push(`o${pt.handleOut.x}:${pt.handleOut.y}`);
          if (pt.cornerRadius) parts.push(`cr${pt.cornerRadius}`);
        }
      };
      pushPoints(node.points);
      if (node.subpaths) {
        for (const sp of node.subpaths) {
          parts.push('|');
          pushPoints(sp);
        }
      }
      return parts.join(',');
    }
    case 'text':
      return `T:${node.content}:${node.fontFamily}:${node.fontSize}:${node.fontWeight}:${node.fontStyle}:${node.textAlign}:${node.lineHeight}:${node.letterSpacing}`;
    case 'image': {
      const vo = node.vertexOffsets;
      const voStr = vo
        ? `:${vo[0].x},${vo[0].y}:${vo[1].x},${vo[1].y}:${vo[2].x},${vo[2].y}:${vo[3].x},${vo[3].y}`
        : '';
      return `I:${node.width}:${node.height}:${node.transform.anchor.x}:${node.transform.anchor.y}${voStr}`;
    }
    case 'bone':
      return `B:${node.length}:${node.boneStyle}`;
    case 'artboard':
      return `A:${node.width}:${node.height}:${node.transform.anchor.x}:${node.transform.anchor.y}`;
    case 'symbol-instance':
      return ''; // No own geometry — resolved nodes are rendered individually
    default:
      return '';
  }
}

// ============================================================================
// Multi-Contour Containment Grouping
// ============================================================================

interface ContourGroup {
  outer: number; // index into contourArrays
  holes: number[]; // indices into contourArrays
}

/** Compute AABB for a tessellated vertex array (flat x,y pairs). */
function contourAABB(verts: Float32Array): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < verts.length; i += 2) {
    const x = verts[i]!;
    const y = verts[i + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Point-in-polygon test (ray casting) for tessellated vertices. */
function pointInContour(px: number, py: number, verts: Float32Array): boolean {
  let inside = false;
  const n = verts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i * 2]!;
    const yi = verts[i * 2 + 1]!;
    const xj = verts[j * 2]!;
    const yj = verts[j * 2 + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Compute signed area of a contour (positive = CCW, negative = CW). */
function contourSignedArea(verts: Float32Array): number {
  let area = 0;
  const n = verts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += verts[j * 2]! * verts[i * 2 + 1]! - verts[i * 2]! * verts[j * 2 + 1]!;
  }
  return area / 2;
}

/**
 * Group contours by containment: each outer contour with its holes.
 * Disjoint contours become separate groups (each is its own outer).
 * Uses AABB pre-check + point-in-polygon for containment, then signed area
 * to disambiguate outer vs hole.
 */
function groupContoursByContainment(contourArrays: Float32Array[]): ContourGroup[] {
  const n = contourArrays.length;
  if (n <= 1) {
    return n === 1 ? [{ outer: 0, holes: [] }] : [];
  }

  // Precompute AABBs and areas
  const aabbs = contourArrays.map(contourAABB);
  const areas = contourArrays.map(contourSignedArea);

  // For each contour, find which contours contain it (AABB + point-in-polygon)
  const containedBy: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ai = aabbs[i]!;
      const aj = aabbs[j]!;
      // Quick AABB check: is i's AABB inside j's AABB?
      if (ai.minX >= aj.minX && ai.maxX <= aj.maxX && ai.minY >= aj.minY && ai.maxY <= aj.maxY) {
        // Use first vertex of contour i as test point
        const px = contourArrays[i]![0]!;
        const py = contourArrays[i]![1]!;
        if (pointInContour(px, py, contourArrays[j]!)) {
          containedBy[i]!.push(j);
        }
      }
    }
  }

  // A contour is a hole if it is contained by exactly one outer at its nesting level.
  // Simple heuristic: a contour with odd nesting depth is a hole.
  const depth = containedBy.map((parents) => parents.length);
  const isHole = depth.map((d) => d % 2 === 1);

  // Build groups: each non-hole contour is an outer
  const groups: ContourGroup[] = [];
  const outerIndices = contourArrays.map((_, i) => i).filter((i) => !isHole[i]!);
  const holeIndices = contourArrays.map((_, i) => i).filter((i) => isHole[i]!);

  for (const outerIdx of outerIndices) {
    groups.push({ outer: outerIdx, holes: [] });
  }

  // Assign each hole to its immediate parent (the outer that directly contains it)
  for (const holeIdx of holeIndices) {
    // Find the tightest (smallest area) outer contour that contains this hole
    let bestOuter = -1;
    let bestArea = Infinity;
    for (const parentIdx of containedBy[holeIdx]!) {
      if (!isHole[parentIdx]!) {
        const absArea = Math.abs(areas[parentIdx]!);
        if (absArea < bestArea) {
          bestArea = absArea;
          bestOuter = parentIdx;
        }
      }
    }
    if (bestOuter >= 0) {
      const group = groups.find((g) => g.outer === bestOuter);
      if (group) group.holes.push(holeIdx);
    } else {
      // Orphan hole (no containing outer) — treat as its own outer
      groups.push({ outer: holeIdx, holes: [] });
    }
  }

  return groups;
}

export class ShapeRenderer {
  private renderer: WebGLRenderer;
  private program: ShaderProgram | null = null;
  private gradientProgram: ShaderProgram | null = null;
  private textureProgram: ShaderProgram | null = null;
  private weightProgram: ShaderProgram | null = null;
  private weightVAO: WebGLVertexArrayObject | null = null;
  private weightVertexBuffer: WebGLBuffer | null = null;
  private weightColorBuffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;

  // GPU skinning
  private skinnedProgram: ShaderProgram | null = null;
  private skinnedGradientProgram: ShaderProgram | null = null;
  private skinnedVAO: WebGLVertexArrayObject | null = null;
  private skinnedVertexBuffer: WebGLBuffer | null = null;

  // Texture rendering
  private textureVAO: WebGLVertexArrayObject | null = null;
  private textureVertexBuffer: WebGLBuffer | null = null;
  private textureCache: Map<string, WebGLTexture> = new Map();
  private pendingImages: Map<string, Promise<HTMLImageElement>> = new Map();
  private currentVPArray: Float32Array | null = null;
  private currentMorphOffsets: Map<string, Float32Array> | undefined = undefined;

  // Pre-allocated arrays to avoid GC
  private vertices: Float32Array;
  private indices: Uint16Array;

  // Cached matrices for gradient program switching
  private currentModelMatrix: Float32Array | null = null;
  /** Effective opacity for the node currently being rendered (includes parent group opacity) */
  private currentEffectiveOpacity: number = 1;

  // Tessellation cache — avoids re-tessellating and re-earcut-ing unchanged geometry
  private geometryCache: Map<string, TessellationCacheEntry> = new Map();

  // Per-ring vertex arrays for boolean groups — needed for per-ring stroke rendering
  private booleanRingCache: Map<string, Float32Array[]> = new Map();

  // Effect renderer for drop shadows, blur, blend modes
  private effectRenderer: EffectRenderer;

  // Symbol definitions registry (set by Canvas component)
  private symbolDefinitions: Map<string, SymbolDefinition> = new Map();

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.vertices = new Float32Array(MAX_VERTICES * 2);
    this.indices = new Uint16Array(MAX_VERTICES * 3); // Triangulated indices

    this.initializeShaders();
    this.initializeBuffers();
    this.initializeSkinnedBuffers();
    this.initializeWeightBuffers();
    this.initializeTextureBuffers();
    this.effectRenderer = new EffectRenderer(renderer);
  }

  /** Set the symbol definitions registry so instances can be resolved during rendering. */
  setSymbolDefinitions(defs: Map<string, SymbolDefinition>): void {
    this.symbolDefinitions = defs;
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

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
        'u_viewProjection',
        'u_model',
        'u_gradientType',
        'u_stopCount',
        'u_bounds',
        'u_angle',
        'u_center',
        'u_radius',
        'u_opacity',
        'u_gradStart',
        'u_gradEnd',
        ...Array.from({ length: MAX_GRADIENT_STOPS }, (_, i) => `u_stops[${i}]`),
        ...Array.from({ length: MAX_GRADIENT_STOPS }, (_, i) => `u_offsets[${i}]`),
      ]
    );

    this.weightProgram = this.renderer.createShaderProgram(
      'shape-weight',
      WEIGHT_VERTEX_SHADER,
      WEIGHT_FRAGMENT_SHADER,
      ['a_position', 'a_color'],
      ['u_viewProjection', 'u_model', 'u_alpha']
    );

    this.textureProgram = this.renderer.createShaderProgram(
      'shape-texture',
      TEXTURE_VERTEX_SHADER,
      TEXTURE_FRAGMENT_SHADER,
      ['a_position', 'a_texCoord'],
      [
        'u_viewProjection',
        'u_model',
        'u_texture',
        'u_opacity',
        'u_tintColor',
        'u_brightness',
        'u_contrast',
        'u_saturation',
        'u_hue',
        'u_exposure',
        'u_temperature',
        'u_rectSize',
        'u_cornerRadius',
      ]
    );

    // GPU skinning shaders
    const boneMatrixUniforms = Array.from(
      { length: MAX_BONES_GPU },
      (_, i) => `u_boneMatrices[${i}]`
    );

    this.skinnedProgram = this.renderer.createShaderProgram(
      'shape-skinned',
      SKINNED_VERTEX_SHADER,
      SHAPE_FRAGMENT_SHADER,
      ['a_position', 'a_boneIndices', 'a_boneWeights'],
      ['u_viewProjection', 'u_color', ...boneMatrixUniforms]
    );

    this.skinnedGradientProgram = this.renderer.createShaderProgram(
      'shape-skinned-gradient',
      SKINNED_GRADIENT_VERTEX_SHADER,
      GRADIENT_FRAGMENT_SHADER,
      ['a_position', 'a_boneIndices', 'a_boneWeights'],
      [
        'u_viewProjection',
        'u_gradientType',
        'u_stopCount',
        'u_bounds',
        'u_angle',
        'u_center',
        'u_radius',
        'u_opacity',
        'u_gradStart',
        'u_gradEnd',
        ...Array.from({ length: MAX_GRADIENT_STOPS }, (_, i) => `u_stops[${i}]`),
        ...Array.from({ length: MAX_GRADIENT_STOPS }, (_, i) => `u_offsets[${i}]`),
        ...boneMatrixUniforms,
      ]
    );
  }

  private initializeBuffers(): void {
    const gl = this.renderer.context;

    // Create VAO
    this.vao = this.renderer.createVAO();
    this.renderer.bindVAO(this.vao);

    // Create vertex buffer
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);

    // Create index buffer
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices.byteLength, gl.DYNAMIC_DRAW);

    if (this.program) {
      gl.enableVertexAttribArray(this.program.attributes.a_position!);
      gl.vertexAttribPointer(this.program.attributes.a_position!, 2, gl.FLOAT, false, 0, 0);
    }

    this.renderer.bindVAO(null);
  }

  private initializeSkinnedBuffers(): void {
    const gl = this.renderer.context;
    if (!this.skinnedProgram) return;

    this.skinnedVAO = this.renderer.createVAO();
    this.renderer.bindVAO(this.skinnedVAO);

    // Interleaved buffer: [position(2f), boneIndices(4f), boneWeights(4f)] = 10 floats/vertex
    // stride = 10 * 4 = 40 bytes
    this.skinnedVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skinnedVertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      MAX_VERTICES * 10 * Float32Array.BYTES_PER_ELEMENT,
      gl.DYNAMIC_DRAW
    );

    const stride = 10 * Float32Array.BYTES_PER_ELEMENT; // 40 bytes

    // a_position at offset 0 (2 floats)
    gl.enableVertexAttribArray(this.skinnedProgram.attributes.a_position!);
    gl.vertexAttribPointer(
      this.skinnedProgram.attributes.a_position!,
      2,
      gl.FLOAT,
      false,
      stride,
      0
    );

    // a_boneIndices at offset 8 (4 floats)
    gl.enableVertexAttribArray(this.skinnedProgram.attributes.a_boneIndices!);
    gl.vertexAttribPointer(
      this.skinnedProgram.attributes.a_boneIndices!,
      4,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );

    // a_boneWeights at offset 24 (4 floats)
    gl.enableVertexAttribArray(this.skinnedProgram.attributes.a_boneWeights!);
    gl.vertexAttribPointer(
      this.skinnedProgram.attributes.a_boneWeights!,
      4,
      gl.FLOAT,
      false,
      stride,
      6 * Float32Array.BYTES_PER_ELEMENT
    );

    // Share index buffer from main VAO
    if (this.indexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    }

    this.renderer.bindVAO(null);
  }

  private initializeWeightBuffers(): void {
    const gl = this.renderer.context;
    if (!this.weightProgram) return;

    this.weightVAO = this.renderer.createVAO();
    this.renderer.bindVAO(this.weightVAO);

    this.weightVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.weightVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTICES * 2 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.weightProgram.attributes.a_position!);
    gl.vertexAttribPointer(this.weightProgram.attributes.a_position!, 2, gl.FLOAT, false, 0, 0);

    this.weightColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.weightColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTICES * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.weightProgram.attributes.a_color!);
    gl.vertexAttribPointer(this.weightProgram.attributes.a_color!, 3, gl.FLOAT, false, 0, 0);

    this.renderer.bindVAO(null);
  }

  private initializeTextureBuffers(): void {
    const gl = this.renderer.context;
    if (!this.textureProgram) return;

    // Create VAO for texture quad
    this.textureVAO = this.renderer.createVAO();
    this.renderer.bindVAO(this.textureVAO);

    // Interleaved buffer: position (vec2) + texcoord (vec2) = 4 floats per vertex, 4 vertices
    this.textureVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 4 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT; // 4 floats per vertex
    // a_position at location 0
    gl.enableVertexAttribArray(this.textureProgram.attributes.a_position!);
    gl.vertexAttribPointer(
      this.textureProgram.attributes.a_position!,
      2,
      gl.FLOAT,
      false,
      stride,
      0
    );
    // a_texCoord at location 1
    gl.enableVertexAttribArray(this.textureProgram.attributes.a_texCoord!);
    gl.vertexAttribPointer(
      this.textureProgram.attributes.a_texCoord!,
      2,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );

    this.renderer.bindVAO(null);
  }

  // --------------------------------------------------------------------------
  // Texture Cache
  // --------------------------------------------------------------------------

  /**
   * Get or load a WebGL texture from a src (data URI or URL).
   * Returns null if the image is still loading.
   */
  getTexture(src: string): WebGLTexture | null {
    const cached = this.textureCache.get(src);
    if (cached) return cached;

    // Already loading?
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

    return null;
  }

  /**
   * Dispose a specific texture from cache
   */
  disposeTexture(src: string): void {
    const texture = this.textureCache.get(src);
    if (texture) {
      this.renderer.context.deleteTexture(texture);
      this.textureCache.delete(src);
    }
    this.pendingImages.delete(src);
  }

  // --------------------------------------------------------------------------
  // Tessellation Cache
  // --------------------------------------------------------------------------

  /**
   * Get or compute tessellated vertices and earcut fill indices for a node.
   * Returns cached result if geometry hasn't changed.
   */
  private getCachedTessellation(
    nodeId: string,
    node: Node,
    pathPoints: import('@quar/types').PathPoint[],
    closed: boolean,
    tolerance: number
  ): { vertices: Float32Array; fillIndices: number[] } {
    const geoKey = buildGeometryKey(node);
    const cached = this.geometryCache.get(nodeId);

    if (cached && cached.geoKey === geoKey) {
      return { vertices: cached.vertices, fillIndices: cached.fillIndices };
    }

    // Compute fresh tessellation
    const vertices = tessellatePathToVertices(pathPoints, closed, tolerance);
    const numVerts = vertices.length / 2;
    const fillIndices = numVerts >= 3 ? earcut(vertices.subarray(0, numVerts * 2)) : [];

    // Store in cache
    const entry: TessellationCacheEntry = {
      geoKey,
      vertices,
      fillIndices: Array.from(fillIndices),
      strokeCache:
        cached?.geoKey === geoKey
          ? cached.strokeCache
          : new Map<string, { outline: Float32Array; indices: number[] }>(),
    };
    this.geometryCache.set(nodeId, entry);

    return { vertices, fillIndices: entry.fillIndices };
  }

  /**
   * Get or compute stroke outline + earcut indices for a given stroke configuration.
   */
  private getCachedStrokeOutline(
    nodeId: string,
    vertices: Float32Array,
    strokeWidth: number,
    closed: boolean,
    align: string,
    widthProfile?: number[]
  ): { outline: Float32Array; indices: number[] } | null {
    const numVertices = vertices.length / 2;
    if (numVertices < 2) return null;

    const profileKey = widthProfile ? `:wp${widthProfile.join(',')}` : '';
    const strokeKey = `${strokeWidth}:${align}${profileKey}`;
    const cached = this.geometryCache.get(nodeId);

    if (cached) {
      const strokeCached = cached.strokeCache.get(strokeKey);
      if (strokeCached) return strokeCached;
    }

    const outline = generateStrokeOutlineVertices(
      vertices,
      numVertices,
      strokeWidth,
      closed,
      align as 'center' | 'inside' | 'outside',
      widthProfile
    );
    const outlineCount = outline.length / 2;
    if (outlineCount < 3) return null;

    const indices = Array.from(earcut(outline));
    const result = { outline, indices };

    if (cached) {
      cached.strokeCache.set(strokeKey, result);
    }

    return result;
  }

  /**
   * Remove a node's cache entry (call when node is removed from scene)
   */
  invalidateCache(nodeId: string): void {
    this.geometryCache.delete(nodeId);
  }

  /**
   * Clear the entire tessellation cache
   */
  clearCache(): void {
    this.geometryCache.clear();
    this.booleanRingCache.clear();
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  /**
   * Render all shapes in the scene graph
   */
  render(
    sceneGraph: SceneGraph,
    viewProjectionMatrix: Matrix3,
    _selectedIds: Set<string> = new Set(),
    skipNodeId?: string | null,
    morphOffsets?: Map<string, Float32Array>
  ): void {
    if (!this.program || !this.vao) return;

    const gl = this.renderer.context;

    // Set up shader program
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Set view-projection matrix
    const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
    gl.uniformMatrix3fv(this.program.uniforms.u_viewProjection ?? null, false, vpArray);

    // Also set on gradient program if available
    if (this.gradientProgram) {
      this.renderer.useProgram(this.gradientProgram);
      gl.uniformMatrix3fv(this.gradientProgram.uniforms.u_viewProjection ?? null, false, vpArray);
      this.renderer.useProgram(this.program);
    }

    // Also set on skinned programs if available
    if (this.skinnedProgram) {
      this.renderer.useProgram(this.skinnedProgram);
      gl.uniformMatrix3fv(this.skinnedProgram.uniforms.u_viewProjection ?? null, false, vpArray);
      this.renderer.useProgram(this.program);
    }
    if (this.skinnedGradientProgram) {
      this.renderer.useProgram(this.skinnedGradientProgram);
      gl.uniformMatrix3fv(
        this.skinnedGradientProgram.uniforms.u_viewProjection ?? null,
        false,
        vpArray
      );
      this.renderer.useProgram(this.program);
    }

    // Cache VP array for texture program
    this.currentVPArray = vpArray;

    // Store morph offsets for skinned node rendering
    this.currentMorphOffsets = morphOffsets;

    // Get canvas dimensions for effect rendering
    const canvasWidth = gl.drawingBufferWidth;
    const canvasHeight = gl.drawingBufferHeight;

    // Scissor stack for artboard clipping
    const scissorStack: { x: number; y: number; w: number; h: number }[] = [];

    const pushScissor = (sx: number, sy: number, sw: number, sh: number) => {
      if (scissorStack.length > 0) {
        // Intersect with current top
        const top = scissorStack[scissorStack.length - 1];
        const ix1 = Math.max(sx, top.x);
        const iy1 = Math.max(sy, top.y);
        const ix2 = Math.min(sx + sw, top.x + top.w);
        const iy2 = Math.min(sy + sh, top.y + top.h);
        sx = ix1;
        sy = iy1;
        sw = Math.max(0, ix2 - ix1);
        sh = Math.max(0, iy2 - iy1);
      }
      scissorStack.push({ x: sx, y: sy, w: sw, h: sh });
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(sx, sy, sw, sh);
    };

    const popScissor = () => {
      scissorStack.pop();
      if (scissorStack.length === 0) {
        gl.disable(gl.SCISSOR_TEST);
      } else {
        const top = scissorStack[scissorStack.length - 1];
        gl.scissor(top.x, top.y, top.w, top.h);
      }
    };

    // Traverse and render visible shapes
    sceneGraph.traverseVisible(
      (node) => {
        // Skip node being edited (e.g. text node with active overlay)
        if (skipNodeId && node.id === skipNodeId) return;

        // Skip IK target and vitruvian nodes (no geometry to render)
        if (node.type === 'ik-target' || node.type === 'vitruvian') return;

        const worldTransform = sceneGraph.getWorldTransform(node.id);
        this.currentEffectiveOpacity = sceneGraph.getEffectiveOpacity(node.id);

        // Symbol instance: resolve and render master's children
        if (node.type === 'symbol-instance') {
          const inst = node as SymbolInstanceNode;
          const definition = this.symbolDefinitions.get(inst.symbolId);
          if (!definition) return false; // skip if definition missing

          const resolvedNodes = resolveSymbolInstance(inst, definition);
          const rootNodes = getResolvedRootNodes(resolvedNodes, definition);
          const nodeMap = new Map<string, Node>();
          for (const rn of resolvedNodes) nodeMap.set(rn.id, rn);

          const renderSymbolChildren = () => {
            for (const child of rootNodes) {
              this.renderResolvedNode(child, worldTransform, nodeMap);
            }
          };

          if (this.effectRenderer.needsMultiPass(node.effects, node.blendMode)) {
            this.effectRenderer.renderNodeWithEffects(
              node.effects,
              node.blendMode,
              () => {
                this.renderer.useProgram(this.program!);
                this.renderer.bindVAO(this.vao);
                gl.uniformMatrix3fv(
                  this.program!.uniforms.u_viewProjection ?? null,
                  false,
                  vpArray
                );
                if (this.gradientProgram) {
                  this.renderer.useProgram(this.gradientProgram);
                  gl.uniformMatrix3fv(
                    this.gradientProgram.uniforms.u_viewProjection ?? null,
                    false,
                    vpArray
                  );
                  this.renderer.useProgram(this.program!);
                }
                this.currentVPArray = vpArray;
                renderSymbolChildren();
              },
              canvasWidth,
              canvasHeight
            );
            this.renderer.useProgram(this.program!);
            this.renderer.bindVAO(this.vao);
            gl.uniformMatrix3fv(this.program!.uniforms.u_viewProjection ?? null, false, vpArray);
            if (this.gradientProgram) {
              this.renderer.useProgram(this.gradientProgram);
              gl.uniformMatrix3fv(
                this.gradientProgram.uniforms.u_viewProjection ?? null,
                false,
                vpArray
              );
              this.renderer.useProgram(this.program!);
            }
            this.currentVPArray = vpArray;
          } else {
            renderSymbolChildren();
          }
          return false; // skip empty children array
        }

        // Artboard: render background and set up scissor clipping
        if (node.type === 'artboard') {
          this.renderArtboardBackground(node, worldTransform);
          if (node.clipContent) {
            // Compute screen-space scissor rect from artboard bounds
            const hw = node.width / 2;
            const hh = node.height / 2;
            // Artboard corners in local space (anchor 0.5,0.5)
            const corners = [
              mat3.transformPoint(worldTransform, { x: -hw, y: -hh }),
              mat3.transformPoint(worldTransform, { x: hw, y: -hh }),
              mat3.transformPoint(worldTransform, { x: hw, y: hh }),
              mat3.transformPoint(worldTransform, { x: -hw, y: hh }),
            ];
            // Transform world coords through VP to NDC
            const screenCorners = corners.map((c) => {
              const ndc = mat3.transformPoint(viewProjectionMatrix, c);
              // NDC to screen pixels
              return {
                x: (ndc.x * 0.5 + 0.5) * canvasWidth,
                y: (ndc.y * 0.5 + 0.5) * canvasHeight, // GL scissor Y is bottom-up (matches NDC)
              };
            });
            const minX = Math.min(...screenCorners.map((c) => c.x));
            const minY = Math.min(...screenCorners.map((c) => c.y));
            const maxX = Math.max(...screenCorners.map((c) => c.x));
            const maxY = Math.max(...screenCorners.map((c) => c.y));
            pushScissor(
              Math.floor(minX),
              Math.floor(minY),
              Math.ceil(maxX - minX),
              Math.ceil(maxY - minY)
            );
          }
          return; // continue into children
        }

        // Boolean group: render computed result, skip children
        if (node.type === 'group' && node.booleanOp) {
          const groupNode = node;
          const renderBoolGroup = () => {
            this.renderBooleanGroup(groupNode, worldTransform, sceneGraph);
          };

          if (this.effectRenderer.needsMultiPass(node.effects, node.blendMode)) {
            this.effectRenderer.renderNodeWithEffects(
              node.effects,
              node.blendMode,
              () => {
                this.renderer.useProgram(this.program!);
                this.renderer.bindVAO(this.vao);
                gl.uniformMatrix3fv(
                  this.program!.uniforms.u_viewProjection ?? null,
                  false,
                  vpArray
                );
                if (this.gradientProgram) {
                  this.renderer.useProgram(this.gradientProgram);
                  gl.uniformMatrix3fv(
                    this.gradientProgram.uniforms.u_viewProjection ?? null,
                    false,
                    vpArray
                  );
                  this.renderer.useProgram(this.program!);
                }
                this.currentVPArray = vpArray;
                renderBoolGroup();
              },
              canvasWidth,
              canvasHeight
            );
            this.renderer.useProgram(this.program!);
            this.renderer.bindVAO(this.vao);
            gl.uniformMatrix3fv(this.program!.uniforms.u_viewProjection ?? null, false, vpArray);
            if (this.gradientProgram) {
              this.renderer.useProgram(this.gradientProgram);
              gl.uniformMatrix3fv(
                this.gradientProgram.uniforms.u_viewProjection ?? null,
                false,
                vpArray
              );
              this.renderer.useProgram(this.program!);
            }
            this.currentVPArray = vpArray;
          } else {
            renderBoolGroup();
          }
          return false; // skip children — they are rendered as part of the boolean result
        }

        const renderShape = () => {
          // Check for skinned mesh — deform vertices via CPU skinning
          if (
            node.type !== 'bone' &&
            node.type !== 'group' &&
            node.type !== 'text' &&
            'skinData' in node &&
            (node as any).skinData
          ) {
            if (node.type === 'image') {
              this.renderSkinnedImage(node, sceneGraph);
            } else {
              this.renderSkinnedNode(node, sceneGraph);
            }
            return;
          }

          switch (node.type) {
            case 'rectangle':
              this.renderRectangle(node, worldTransform);
              break;
            case 'ellipse':
              this.renderEllipse(node, worldTransform);
              break;
            case 'polygon':
              this.renderPolygon(node, worldTransform);
              break;
            case 'path':
              this.renderPath(node, worldTransform);
              break;
            case 'text':
              this.renderText(node, worldTransform);
              break;
            case 'image':
              this.renderImage(node, worldTransform);
              break;
            case 'bone':
              this.renderBone(node, worldTransform);
              break;
          }
        };

        // Check if node needs multi-pass rendering (effects or blend mode)
        if (this.effectRenderer.needsMultiPass(node.effects, node.blendMode)) {
          this.effectRenderer.renderNodeWithEffects(
            node.effects,
            node.blendMode,
            () => {
              // Re-setup shader state since effect renderer may have changed it
              this.renderer.useProgram(this.program!);
              this.renderer.bindVAO(this.vao);
              gl.uniformMatrix3fv(this.program!.uniforms.u_viewProjection ?? null, false, vpArray);
              if (this.gradientProgram) {
                this.renderer.useProgram(this.gradientProgram);
                gl.uniformMatrix3fv(
                  this.gradientProgram.uniforms.u_viewProjection ?? null,
                  false,
                  vpArray
                );
                this.renderer.useProgram(this.program!);
              }
              this.currentVPArray = vpArray;
              renderShape();
            },
            canvasWidth,
            canvasHeight
          );
          // Restore shader state for next node
          this.renderer.useProgram(this.program!);
          this.renderer.bindVAO(this.vao);
          gl.uniformMatrix3fv(this.program!.uniforms.u_viewProjection ?? null, false, vpArray);
          if (this.gradientProgram) {
            this.renderer.useProgram(this.gradientProgram);
            gl.uniformMatrix3fv(
              this.gradientProgram.uniforms.u_viewProjection ?? null,
              false,
              vpArray
            );
            this.renderer.useProgram(this.program!);
          }
          this.currentVPArray = vpArray;
        } else {
          // Fast path: no effects, normal blend mode — render directly
          renderShape();
        }
        return; // explicit void return (callback returns boolean | void)
      },
      (node) => {
        // onExitNode: pop scissor when leaving a clipping artboard
        if (node.type === 'artboard' && node.clipContent) {
          popScissor();
        }
      }
    );

    this.renderer.bindVAO(null);
  }

  /**
   * Render a single node (used for preview during drawing)
   */
  renderNode(node: Node, viewProjectionMatrix: Matrix3): void {
    if (!this.program || !this.vao || !node.visible) return;
    // Standalone node rendering — use the node's own opacity (no parent chain)
    this.currentEffectiveOpacity = node.opacity;

    const gl = this.renderer.context;

    // Set up shader program
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Set view-projection matrix
    const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
    gl.uniformMatrix3fv(this.program.uniforms.u_viewProjection ?? null, false, vpArray);

    if (this.gradientProgram) {
      this.renderer.useProgram(this.gradientProgram);
      gl.uniformMatrix3fv(this.gradientProgram.uniforms.u_viewProjection ?? null, false, vpArray);
      this.renderer.useProgram(this.program);
    }

    // Cache VP array for texture program
    this.currentVPArray = vpArray;

    // Create world matrix from node transform
    const worldMatrix = mat3.compose(
      node.transform.position,
      node.transform.rotation,
      node.transform.scale,
      node.transform.anchor
    );

    switch (node.type) {
      case 'rectangle':
        this.renderRectangle(node, worldMatrix);
        break;
      case 'ellipse':
        this.renderEllipse(node, worldMatrix);
        break;
      case 'polygon':
        this.renderPolygon(node, worldMatrix);
        break;
      case 'path':
        this.renderPath(node, worldMatrix);
        break;
      case 'text':
        this.renderText(node, worldMatrix);
        break;
      case 'image':
        this.renderImage(node, worldMatrix);
        break;
      case 'bone':
        this.renderBone(node, worldMatrix);
        break;
      case 'artboard':
        this.renderArtboardBackground(node, worldMatrix);
        break;
    }

    this.renderer.bindVAO(null);
  }

  /**
   * Render a resolved node from a symbol definition, with a parent transform.
   * Dispatches to existing render methods based on node type.
   */
  private renderResolvedNode(
    node: Node,
    parentTransform: Matrix3,
    nodeMap: Map<string, Node>
  ): void {
    if (!node.visible) return;
    if (node.type === 'ik-target' || node.type === 'vitruvian') return;

    // Compute the node's world transform relative to parent
    const localMatrix = mat3.compose(
      node.transform.position,
      node.transform.rotation,
      node.transform.scale,
      node.transform.anchor
    );
    const worldTransform = mat3.multiply(parentTransform, localMatrix);

    const savedOpacity = this.currentEffectiveOpacity;
    this.currentEffectiveOpacity *= node.opacity;

    switch (node.type) {
      case 'rectangle':
        this.renderRectangle(node, worldTransform);
        break;
      case 'ellipse':
        this.renderEllipse(node, worldTransform);
        break;
      case 'polygon':
        this.renderPolygon(node, worldTransform);
        break;
      case 'path':
        this.renderPath(node, worldTransform);
        break;
      case 'text':
        this.renderText(node, worldTransform);
        break;
      case 'image':
        this.renderImage(node, worldTransform);
        break;
      case 'bone':
        this.renderBone(node, worldTransform);
        break;
      case 'artboard':
        this.renderArtboardBackground(node, worldTransform);
        break;
    }

    // Render children if this is a group
    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        const child = nodeMap.get(childId);
        if (child) {
          this.renderResolvedNode(child, worldTransform, nodeMap);
        }
      }
    }

    this.currentEffectiveOpacity = savedOpacity;
  }

  /**
   * Render fills and strokes from arrays, using cached tessellation data
   */
  private renderFillsAndStrokes(
    nodeId: string,
    tessellated: Float32Array,
    fillIndices: number[],
    fills: Fill[],
    strokes: Stroke[],
    closed: boolean,
    nodeOpacity: number = 1
  ): void {
    for (const fill of fills) {
      if (fill.visible && fill.type !== 'none') {
        this.renderFill(tessellated, fillIndices, fill, nodeOpacity);
      }
    }
    for (const stroke of strokes) {
      if (stroke.visible && stroke.width > 0) {
        this.renderStroke(nodeId, tessellated, stroke, closed, nodeOpacity);
      }
    }
  }

  /**
   * Render fills and strokes as ghosts with tint/alpha.
   * Ghost rendering uses inline earcut since ghost nodes are transient (different frames).
   */
  private renderFillsAndStrokesGhost(
    tessellated: Float32Array,
    fills: Fill[],
    strokes: Stroke[],
    closed: boolean,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    // Compute earcut once for all ghost fills
    const numVerts = tessellated.length / 2;
    const ghostFillIndices = numVerts >= 3 ? earcut(tessellated.subarray(0, numVerts * 2)) : [];

    for (const fill of fills) {
      if (fill.visible && fill.type !== 'none') {
        const color = this.applyTintAndAlpha(
          this.getFillColor(fill),
          colorOverride.tint,
          colorOverride.alpha
        );
        this.renderFillWithColor(tessellated, ghostFillIndices, color);
      }
    }
    for (const stroke of strokes) {
      if (stroke.visible && stroke.width > 0) {
        const color = this.applyTintAndAlpha(
          this.getStrokeColor(stroke),
          colorOverride.tint,
          colorOverride.alpha
        );
        this.renderStrokeWithColor(tessellated, stroke, closed, color);
      }
    }
  }

  /**
   * Render a single rectangle
   */
  renderRectangle(node: RectangleNode, worldMatrix: Matrix3): void {
    if (!this.program) return;

    const gl = this.renderer.context;

    // Generate rectangle path and get cached tessellation
    const pathPoints = createRectanglePath(
      -node.width * node.transform.anchor.x,
      -node.height * node.transform.anchor.y,
      node.width,
      node.height,
      node.cornerRadius
    );
    const { vertices: tessellated, fillIndices } = this.getCachedTessellation(
      node.id,
      node,
      pathPoints,
      true,
      DEFAULT_TESSELLATION_TOLERANCE
    );

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelArray);

    this.renderFillsAndStrokes(
      node.id,
      tessellated,
      fillIndices,
      node.fills,
      node.strokes,
      true,
      this.currentEffectiveOpacity
    );
  }

  /**
   * Render an artboard background rectangle
   */
  renderArtboardBackground(node: ArtboardNode, worldMatrix: Matrix3): void {
    if (!this.program) return;

    const fills = node.fills;
    if (!fills || fills.length === 0) return;

    const gl = this.renderer.context;

    const anchor = node.transform.anchor;
    const pathPoints = createRectanglePath(
      -node.width * anchor.x,
      -node.height * anchor.y,
      node.width,
      node.height,
      [0, 0, 0, 0]
    );
    const { vertices: tessellated, fillIndices } = this.getCachedTessellation(
      node.id + ':bg',
      node,
      pathPoints,
      true,
      DEFAULT_TESSELLATION_TOLERANCE
    );

    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    this.renderer.useProgram(this.program);
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelArray);

    this.renderFillsAndStrokes(
      node.id + ':bg',
      tessellated,
      fillIndices,
      fills,
      [],
      true,
      this.currentEffectiveOpacity
    );
  }

  /**
   * Render a single ellipse
   */
  renderEllipse(node: EllipseNode, worldMatrix: Matrix3): void {
    if (!this.program) return;

    const gl = this.renderer.context;

    // Generate ellipse path and get cached tessellation
    const pathPoints = createEllipsePath(0, 0, node.radiusX, node.radiusY);
    const { vertices: tessellated, fillIndices } = this.getCachedTessellation(
      node.id,
      node,
      pathPoints,
      true,
      ELLIPSE_TESSELLATION_TOLERANCE
    );

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelArray);

    this.renderFillsAndStrokes(
      node.id,
      tessellated,
      fillIndices,
      node.fills,
      node.strokes,
      true,
      this.currentEffectiveOpacity
    );
  }

  /**
   * Render a single polygon or star
   */
  renderPolygon(node: PolygonNode, worldMatrix: Matrix3): void {
    if (!this.program) return;

    const gl = this.renderer.context;

    // Generate polygon or star path and get cached tessellation
    const pathPoints =
      node.innerRadius !== undefined
        ? createStarPath(
            0,
            0,
            node.radius,
            node.innerRadius,
            node.sides,
            undefined,
            node.cornerRadius
          )
        : createPolygonPath(0, 0, node.radius, node.sides, undefined, node.cornerRadius);
    const { vertices: tessellated, fillIndices } = this.getCachedTessellation(
      node.id,
      node,
      pathPoints,
      true,
      DEFAULT_TESSELLATION_TOLERANCE
    );

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelArray);

    this.renderFillsAndStrokes(
      node.id,
      tessellated,
      fillIndices,
      node.fills,
      node.strokes,
      true,
      this.currentEffectiveOpacity
    );
  }

  /**
   * Render an image node as a textured quad
   */
  renderImage(node: ImageNode, worldMatrix: Matrix3): void {
    if (!this.textureProgram || !this.textureVAO || !this.textureVertexBuffer) return;

    const texture = this.getTexture(node.src);
    if (!texture) return; // Still loading

    const gl = this.renderer.context;

    // Switch to texture program + VAO
    this.renderer.useProgram(this.textureProgram);
    this.renderer.bindVAO(this.textureVAO);

    // Set VP matrix
    if (this.currentVPArray) {
      gl.uniformMatrix3fv(
        this.textureProgram.uniforms.u_viewProjection ?? null,
        false,
        this.currentVPArray
      );
    }

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    gl.uniformMatrix3fv(this.textureProgram.uniforms.u_model ?? null, false, modelArray);

    // Build quad vertices: position + texcoord (interleaved)
    // Anchor-based local coords (same as rectangle)
    const ax = node.transform.anchor.x;
    const ay = node.transform.anchor.y;
    const x0 = -node.width * ax;
    const y0 = -node.height * ay;
    const x1 = x0 + node.width;
    const y1 = y0 + node.height;

    // Apply vertex offsets for free-form distortion [BL, BR, TL, TR]
    const vo = node.vertexOffsets;
    const blX = x0 + (vo?.[0]?.x ?? 0),
      blY = y0 + (vo?.[0]?.y ?? 0);
    const brX = x1 + (vo?.[1]?.x ?? 0),
      brY = y0 + (vo?.[1]?.y ?? 0);
    const tlX = x0 + (vo?.[2]?.x ?? 0),
      tlY = y1 + (vo?.[2]?.y ?? 0);
    const trX = x1 + (vo?.[3]?.x ?? 0),
      trY = y1 + (vo?.[3]?.y ?? 0);

    // Cache image quad positions in geometry cache (for skinning/getTessellatedVertices)
    const geoKey = buildGeometryKey(node);
    const existingCache = this.geometryCache.get(node.id);
    if (!existingCache || existingCache.geoKey !== geoKey) {
      const quadPositions = new Float32Array([blX, blY, brX, brY, tlX, tlY, trX, trY]);
      const fillIndices = [0, 1, 2, 2, 1, 3]; // Two triangles
      this.geometryCache.set(node.id, {
        geoKey,
        vertices: quadPositions,
        fillIndices,
        strokeCache: new Map(),
      });
    }

    // UV: Y inverted because texImage2D loads top-to-bottom but world is Y-up
    const quadData = new Float32Array([
      blX,
      blY,
      0,
      1, // bottom-left  → UV (0,1)
      brX,
      brY,
      1,
      1, // bottom-right → UV (1,1)
      tlX,
      tlY,
      0,
      0, // top-left     → UV (0,0)
      trX,
      trY,
      1,
      0, // top-right    → UV (1,0)
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureVertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, quadData);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.textureProgram.uniforms.u_texture ?? null, 0);

    // Set opacity
    gl.uniform1f(this.textureProgram.uniforms.u_opacity ?? null, this.currentEffectiveOpacity);

    // No tint for normal rendering
    gl.uniform4fv(this.textureProgram.uniforms.u_tintColor ?? null, new Float32Array([0, 0, 0, 0]));

    // Image adjustments
    const adj = node.adjustments;
    gl.uniform1f(this.textureProgram.uniforms.u_brightness ?? null, (adj?.brightness ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_contrast ?? null, (adj?.contrast ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_saturation ?? null, (adj?.saturation ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_hue ?? null, ((adj?.hue ?? 0) * Math.PI) / 180);
    gl.uniform1f(this.textureProgram.uniforms.u_exposure ?? null, (adj?.exposure ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_temperature ?? null, (adj?.temperature ?? 0) / 100);

    // Corner radius SDF uniforms
    gl.uniform2f(this.textureProgram.uniforms.u_rectSize ?? null, node.width, node.height);
    const cr = node.cornerRadius ?? [0, 0, 0, 0];
    gl.uniform4fv(
      this.textureProgram.uniforms.u_cornerRadius ?? null,
      new Float32Array([cr[0], cr[1], cr[2], cr[3]])
    );

    // Draw as triangle strip (4 vertices)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Unbind texture
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Restore shape program + VAO
    if (this.program && this.vao) {
      this.renderer.useProgram(this.program);
      this.renderer.bindVAO(this.vao);
    }
  }

  /**
   * Render a path node (supports multi-contour paths with subpaths/holes)
   */
  renderPath(node: PathNode, worldMatrix: Matrix3): void {
    if (!this.program || node.points.length < 2) return;

    const gl = this.renderer.context;

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelArray);

    // Multi-contour path (compound path with holes)
    if (node.subpaths && node.subpaths.length > 0 && node.closed) {
      const { vertices, fillIndices } = this.getCachedMultiContourTessellation(node.id, node);
      const fills = node.fills;

      // Render fills with combined vertices+holes
      this.renderFillsAndStrokes(
        node.id,
        vertices,
        fillIndices,
        fills,
        [],
        node.closed,
        this.currentEffectiveOpacity
      );

      // Render strokes for each contour independently
      const allContours = [node.points, ...node.subpaths];
      for (const contour of allContours) {
        const processed = applyCornerRadius(contour, true);
        const contourVerts = tessellatePathToVertices(
          processed,
          true,
          DEFAULT_TESSELLATION_TOLERANCE
        );
        // Strokes don't use earcut — render outline per contour
        for (const stroke of node.strokes) {
          if (stroke.visible && stroke.width > 0) {
            this.renderStroke(
              node.id + '_s',
              contourVerts,
              stroke,
              true,
              this.currentEffectiveOpacity
            );
          }
        }
      }
      return;
    }

    // Simple single-contour path
    const processed = applyCornerRadius(node.points, node.closed);
    const { vertices: tessellated, fillIndices } = this.getCachedTessellation(
      node.id,
      node,
      processed,
      node.closed,
      DEFAULT_TESSELLATION_TOLERANCE
    );

    const fills = node.closed ? node.fills : [];
    this.renderFillsAndStrokes(
      node.id,
      tessellated,
      fillIndices,
      fills,
      node.strokes,
      node.closed,
      this.currentEffectiveOpacity
    );
  }

  /**
   * Render a text node by converting glyphs to tessellated paths.
   * Uses the same multi-contour rendering pipeline as compound paths.
   */
  private renderText(node: TextNode, worldMatrix: Matrix3): void {
    if (!this.program || !node.content) return;

    const fm = getFontManager();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const font = fm.getFontOrFallback(node.fontFamily, node.fontWeight);
    if (!font) return; // Font not loaded yet

    const gl = this.renderer.context;

    // Apply anchor offset for non-zero anchors (centers text geometry)
    let adjustedMatrix = worldMatrix;
    const ax = node.transform.anchor.x;
    const ay = node.transform.anchor.y;
    if (ax !== 0 || ay !== 0) {
      const rawBounds = getTextBounds(
        node.content,
        node.fontFamily,
        node.fontSize,
        node.lineHeight,
        node.letterSpacing,
        node.textAlign
      );
      const offsetX = -(rawBounds.x + rawBounds.width * ax);
      const offsetY = -(rawBounds.y + rawBounds.height * ay);
      adjustedMatrix = mat3.translate(worldMatrix, offsetX, offsetY);
    }

    // Set model matrix
    const modelArray = mat3.toFloat32Array(adjustedMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelArray);

    // Get cached tessellation for this text
    const geoKey = buildGeometryKey(node);
    const cached = this.geometryCache.get(node.id);

    if (cached && cached.geoKey === geoKey) {
      // Render fills with combined vertices
      this.renderFillsAndStrokes(
        node.id,
        cached.vertices,
        cached.fillIndices,
        node.fills,
        [], // strokes rendered per-contour below
        true,
        this.currentEffectiveOpacity
      );
      // Render strokes per original contour (not from combined earcut triangles)
      if (cached.contours) {
        for (let ci = 0; ci < cached.contours.length; ci++) {
          const contourVerts = cached.contours[ci]!;
          for (const stroke of node.strokes) {
            if (stroke.visible && stroke.width > 0) {
              this.renderStroke(
                node.id + `_tc${ci}`,
                contourVerts,
                stroke,
                true,
                this.currentEffectiveOpacity
              );
            }
          }
        }
      }
      return;
    }

    // Convert text to subpaths
    const result = textToSubpaths(node.content, font, node.fontSize, {
      textAlign: node.textAlign,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
    });

    if (result.subpaths.length === 0) return;

    // Tessellate all glyph contours
    const contourArrays: Float32Array[] = [];
    for (const sp of result.subpaths) {
      if (sp.length < 2) continue;
      const verts = tessellatePathToVertices(sp, true, DEFAULT_TESSELLATION_TOLERANCE);
      if (verts.length >= 6) {
        // At least 3 points
        contourArrays.push(verts);
      }
    }

    if (contourArrays.length === 0) return;

    // Compute global vertex starts
    const globalVertStarts: number[] = [];
    let totalFloats = 0;
    for (const arr of contourArrays) {
      globalVertStarts.push(totalFloats / 2);
      totalFloats += arr.length;
    }

    const combined = new Float32Array(totalFloats);
    let writeOff = 0;
    for (const arr of contourArrays) {
      combined.set(arr, writeOff);
      writeOff += arr.length;
    }

    // Group by containment (handle glyphs with holes like 'o', 'a', etc.)
    const groups = groupContoursByContainment(contourArrays);
    const fillIndices: number[] = [];

    for (const group of groups) {
      const contourIndices = [group.outer, ...group.holes];
      let groupFloats = 0;
      for (const ci of contourIndices) groupFloats += contourArrays[ci]!.length;
      const groupVerts = new Float32Array(groupFloats);
      const groupHoles: number[] = [];
      const localStarts: number[] = [];
      let lOff = 0;
      for (let gi = 0; gi < contourIndices.length; gi++) {
        const ci = contourIndices[gi]!;
        localStarts.push(lOff / 2);
        if (gi > 0) groupHoles.push(lOff / 2);
        groupVerts.set(contourArrays[ci]!, lOff);
        lOff += contourArrays[ci]!.length;
      }
      if (groupVerts.length / 2 < 3) continue;
      const indices = earcut(groupVerts, groupHoles.length > 0 ? groupHoles : undefined);
      for (const localIdx of indices) {
        let slot = 0;
        for (let gi = contourIndices.length - 1; gi >= 0; gi--) {
          if (localIdx >= localStarts[gi]!) {
            slot = gi;
            break;
          }
        }
        fillIndices.push(globalVertStarts[contourIndices[slot]!]! + localIdx - localStarts[slot]!);
      }
    }

    // Cache tessellation with original contours for stroke rendering
    this.geometryCache.set(node.id, {
      geoKey,
      vertices: combined,
      fillIndices,
      strokeCache: new Map(),
      contours: contourArrays,
    });

    // Render fills with combined vertices
    this.renderFillsAndStrokes(
      node.id,
      combined,
      fillIndices,
      node.fills,
      [], // strokes rendered per-contour below
      true,
      this.currentEffectiveOpacity
    );

    // Render strokes per original contour outline
    for (let ci = 0; ci < contourArrays.length; ci++) {
      const contourVerts = contourArrays[ci]!;
      for (const stroke of node.strokes) {
        if (stroke.visible && stroke.width > 0) {
          this.renderStroke(
            node.id + `_tc${ci}`,
            contourVerts,
            stroke,
            true,
            this.currentEffectiveOpacity
          );
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Boolean Group Rendering
  // --------------------------------------------------------------------------

  /**
   * Render a boolean group by computing its boolean result dynamically.
   */
  private renderBooleanGroup(
    groupNode: GroupNode,
    _worldMatrix: Matrix3,
    sceneGraph: SceneGraph
  ): void {
    if (!this.program || !this.vao) return;

    const children = sceneGraph.getChildren(groupNode.id).filter((c) => c.visible);
    const op = groupNode.booleanOp;
    if (!op || children.length < 2) return;

    // Compute the boolean result using children's world transforms
    const childTransforms = children.map((c) => sceneGraph.getWorldTransform(c.id));

    // Try to get cached tessellation
    const cacheKey = this.buildBooleanGroupCacheKey(groupNode, children, childTransforms, op);
    const cached = this.geometryCache.get(cacheKey);

    let vertices: Float32Array;
    let fillIndices: number[];

    if (cached && cached.geoKey === cacheKey) {
      vertices = cached.vertices;
      fillIndices = cached.fillIndices;
    } else {
      // Compute boolean result
      try {
        let accum: MultiPolygon | null = null;
        for (let i = 0; i < children.length; i++) {
          const child = children[i]!;
          const childTransform = childTransforms[i]!;
          let poly: MultiPolygon | null;

          // Handle nested boolean groups
          if (child.type === 'group' && child.booleanOp) {
            poly = this.computeNestedBooleanPolygon(child, childTransform, sceneGraph);
          } else {
            poly = nodeToPolygon(child, childTransform);
          }
          if (!poly) continue;

          if (!accum) {
            accum = poly;
          } else {
            accum = performBoolean(accum, poly, op);
          }
        }

        if (!accum || accum.length === 0) return;

        // Tessellate directly from MultiPolygon structure.
        // polygon-clipping returns [Polygon, ...] where each Polygon = [outerRing, ...holeRings].
        // Ring[0] = outer (CCW), Ring[1+] = holes (CW) — use this directly instead of
        // flattening and reconstructing containment.
        const allRingArrays: Float32Array[] = [];
        // For each polygon, store [outerContourIdx, holeContourIdx, ...]
        const polyRingIndices: number[][] = [];

        for (const polygon of accum) {
          if (polygon.length === 0) continue;
          const ringIndices: number[] = [];
          for (const ring of polygon) {
            // polygon-clipping returns closed rings (first==last); remove duplicate
            // Use epsilon comparison — floating-point results may not be exactly equal
            let pts = ring;
            if (pts.length > 1) {
              const f = pts[0]!;
              const l = pts[pts.length - 1]!;
              if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) {
                pts = pts.slice(0, -1);
              }
            }
            if (pts.length < 3) continue;
            const flat = new Float32Array(pts.length * 2);
            for (let j = 0; j < pts.length; j++) {
              flat[j * 2] = pts[j]![0];
              flat[j * 2 + 1] = pts[j]![1];
            }
            ringIndices.push(allRingArrays.length);
            allRingArrays.push(flat);
          }
          if (ringIndices.length > 0) {
            polyRingIndices.push(ringIndices);
          }
        }

        if (allRingArrays.length === 0) return;

        // Build combined vertex buffer
        const globalVertStarts: number[] = [];
        let totalFloats = 0;
        for (const arr of allRingArrays) {
          globalVertStarts.push(totalFloats / 2);
          totalFloats += arr.length;
        }
        vertices = new Float32Array(totalFloats);
        let writeOffset = 0;
        for (const arr of allRingArrays) {
          vertices.set(arr, writeOffset);
          writeOffset += arr.length;
        }

        // Tessellate each polygon (outer + its holes)
        const allFillIndices: number[] = [];
        for (const ringIdxs of polyRingIndices) {
          let groupFloats = 0;
          for (const ri of ringIdxs) groupFloats += allRingArrays[ri]!.length;

          const groupVerts = new Float32Array(groupFloats);
          const groupHoles: number[] = [];
          const localStarts: number[] = [];
          let lo = 0;
          for (let gi = 0; gi < ringIdxs.length; gi++) {
            const ri = ringIdxs[gi]!;
            localStarts.push(lo / 2);
            if (gi > 0) groupHoles.push(lo / 2); // holes are ring[1+]
            groupVerts.set(allRingArrays[ri]!, lo);
            lo += allRingArrays[ri]!.length;
          }

          if (groupVerts.length / 2 < 3) continue;
          const indices = earcut(groupVerts, groupHoles.length > 0 ? groupHoles : undefined);

          for (const localIdx of indices) {
            let slot = 0;
            for (let gi = ringIdxs.length - 1; gi >= 0; gi--) {
              if (localIdx >= localStarts[gi]!) {
                slot = gi;
                break;
              }
            }
            const ri = ringIdxs[slot]!;
            const within = localIdx - localStarts[slot]!;
            allFillIndices.push(globalVertStarts[ri]! + within);
          }
        }
        fillIndices = allFillIndices;

        // Cache the result
        const entry: TessellationCacheEntry = {
          geoKey: cacheKey,
          vertices,
          fillIndices,
          strokeCache: new Map(),
        };
        this.geometryCache.set(cacheKey, entry);

        // Cache per-ring arrays for per-ring stroke rendering
        this.booleanRingCache.set(cacheKey, allRingArrays);
      } catch (_err) {
        return;
      }
    }

    const gl = this.renderer.context;

    // Ensure correct GL state — flat program + VAO must be active
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Boolean result is in world space — use identity model matrix
    const identityMatrix = mat3.identity();
    const modelArray = mat3.toFloat32Array(identityMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelArray);

    // Render fills using combined buffer + earcut indices (correct — indices skip between rings)
    const fills = groupNode.fills ?? [];
    const strokes = groupNode.strokes ?? [];
    const nodeOpacity = this.currentEffectiveOpacity;

    for (const fill of fills) {
      if (fill.visible && fill.type !== 'none') {
        this.renderFill(vertices!, fillIndices!, fill, nodeOpacity);
      }
    }

    // Render strokes PER-RING to avoid bridge lines between disjoint contours.
    // Uses triangle strip instead of earcut to avoid artifacts on concave outlines.
    const ringArrays = this.booleanRingCache.get(cacheKey);
    if (ringArrays) {
      for (const stroke of strokes) {
        if (stroke.visible && stroke.width > 0) {
          for (const ringVerts of ringArrays) {
            const numVerts = ringVerts.length / 2;
            if (numVerts < 2) continue;
            const outline = generateStrokeOutlineVertices(
              ringVerts,
              numVerts,
              stroke.width,
              true,
              stroke.align ?? 'center'
            );
            if (outline.length / 2 < 3) continue;

            if (stroke.gradient) {
              this.renderStrokeStripGradient(
                outline,
                stroke.gradient,
                stroke.opacity * nodeOpacity,
                true
              );
            } else {
              const color = this.getStrokeColor(stroke, nodeOpacity);
              this.renderStrokeStrip(outline, color, true);
            }
          }
        }
      }
    }
  }

  /**
   * Recursively compute the polygon for a nested boolean group.
   */
  private computeNestedBooleanPolygon(
    group: GroupNode,
    _groupWorldTransform: Matrix3,
    sceneGraph: SceneGraph,
    depth: number = 0
  ): MultiPolygon | null {
    if (depth > 10) return null;
    const op = group.booleanOp;
    if (!op) return null;

    const children = sceneGraph.getChildren(group.id).filter((c) => c.visible);
    if (children.length < 2) return null;

    let accum: MultiPolygon | null = null;
    for (const child of children) {
      const childTransform = sceneGraph.getWorldTransform(child.id);
      let poly: MultiPolygon | null;

      if (child.type === 'group' && child.booleanOp) {
        poly = this.computeNestedBooleanPolygon(child, childTransform, sceneGraph, depth + 1);
      } else {
        poly = nodeToPolygon(child, childTransform);
      }
      if (!poly) continue;

      if (!accum) {
        accum = poly;
      } else {
        accum = performBoolean(accum, poly, op);
      }
    }

    return accum;
  }

  /**
   * Build a cache key for a boolean group's computed geometry.
   */
  private buildBooleanGroupCacheKey(
    _groupNode: GroupNode,
    children: Node[],
    childTransforms: Matrix3[],
    op: BooleanOp
  ): string {
    const parts: string[] = [`BG:${op}`];
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const t = childTransforms[i]!;
      parts.push(
        `${buildGeometryKey(child)}@${t.a.toFixed(4)},${t.b.toFixed(4)},${t.c.toFixed(4)},${t.d.toFixed(4)},${t.tx.toFixed(2)},${t.ty.toFixed(2)}`
      );
    }
    return parts.join('|');
  }

  /**
   * Get or compute tessellation for multi-contour path with earcut holes.
   * Concatenates all contours' vertices and builds hole index array for earcut.
   */
  private getCachedMultiContourTessellation(
    nodeId: string,
    node: PathNode
  ): { vertices: Float32Array; fillIndices: number[] } {
    const geoKey = buildGeometryKey(node);
    const cached = this.geometryCache.get(nodeId);

    if (cached && cached.geoKey === geoKey) {
      return { vertices: cached.vertices, fillIndices: cached.fillIndices };
    }

    // Tessellate each contour
    const allContours = [node.points, ...(node.subpaths ?? [])];
    const contourArrays: Float32Array[] = [];
    for (const contour of allContours) {
      const processed = applyCornerRadius(contour, true);
      contourArrays.push(tessellatePathToVertices(processed, true, DEFAULT_TESSELLATION_TOLERANCE));
    }

    // Compute global vertex start index for each contour
    const globalVertStarts: number[] = [];
    let totalFloats = 0;
    for (const arr of contourArrays) {
      globalVertStarts.push(totalFloats / 2);
      totalFloats += arr.length;
    }

    // Build combined vertex array
    const combined = new Float32Array(totalFloats);
    let writeOffset = 0;
    for (const arr of contourArrays) {
      combined.set(arr, writeOffset);
      writeOffset += arr.length;
    }

    // Group contours by containment: outers with their holes
    const groups = groupContoursByContainment(contourArrays);

    // Tessellate each group independently with earcut, then remap indices
    const allFillIndices: number[] = [];
    for (const group of groups) {
      const contourIndices = [group.outer, ...group.holes];

      // Build per-group vertex array + hole indices
      let groupFloats = 0;
      for (const ci of contourIndices) groupFloats += contourArrays[ci]!.length;

      const groupVerts = new Float32Array(groupFloats);
      const groupHoles: number[] = [];
      // Track where each contour starts within the group-local array (vertex index)
      const localContourStarts: number[] = [];
      let localOffset = 0;

      for (let gi = 0; gi < contourIndices.length; gi++) {
        const ci = contourIndices[gi]!;
        localContourStarts.push(localOffset / 2);
        if (gi > 0) {
          groupHoles.push(localOffset / 2);
        }
        groupVerts.set(contourArrays[ci]!, localOffset);
        localOffset += contourArrays[ci]!.length;
      }

      if (groupVerts.length / 2 < 3) continue;

      const indices = earcut(groupVerts, groupHoles.length > 0 ? groupHoles : undefined);

      // Remap each local index to global: find which contour it belongs to, offset
      for (const localIdx of indices) {
        // Find which contour this local vertex belongs to
        let contourSlot = 0;
        for (let gi = contourIndices.length - 1; gi >= 0; gi--) {
          if (localIdx >= localContourStarts[gi]!) {
            contourSlot = gi;
            break;
          }
        }
        const ci = contourIndices[contourSlot]!;
        const withinContour = localIdx - localContourStarts[contourSlot]!;
        allFillIndices.push(globalVertStarts[ci]! + withinContour);
      }
    }

    // Store per-contour vertex counts for skinned compound path stroke rendering
    const contourVertexCounts = contourArrays.map((arr) => arr.length / 2);

    const entry: TessellationCacheEntry = {
      geoKey,
      vertices: combined,
      fillIndices: allFillIndices,
      strokeCache: new Map(),
      contourVertexCounts,
    };
    this.geometryCache.set(nodeId, entry);

    return { vertices: combined, fillIndices: allFillIndices };
  }

  /**
   * Render filled polygon using cached earcut triangulation indices.
   */
  private renderFill(
    vertices: Float32Array,
    fillIndices: number[],
    fill: Fill,
    nodeOpacity: number = 1
  ): void {
    if (fill.type === 'gradient' && fill.gradient) {
      this.renderFillGradient(vertices, fillIndices, fill.gradient, fill.opacity * nodeOpacity);
      return;
    }

    if (!this.program) return;

    const gl = this.renderer.context;

    // Ensure flat-color program is active
    this.renderer.useProgram(this.program);

    // Set fill color
    const color = this.getFillColor(fill, nodeOpacity);
    gl.uniform4fv(this.program.uniforms.u_color ?? null, color);

    // Upload vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);

    const numVertices = vertices.length / 2;
    if (numVertices < 3) return;

    if (fillIndices.length === 0) {
      // Fallback to triangle fan if earcut produced no indices
      gl.drawArrays(gl.TRIANGLE_FAN, 0, numVertices);
      return;
    }

    // Upload cached indices
    const indicesArray = new Uint16Array(fillIndices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);

    // Draw using indexed triangles
    gl.drawElements(gl.TRIANGLES, fillIndices.length, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Render stroke as a filled outline polygon.
   * WebGL lineWidth is capped at 1px on most browsers, so we expand the stroke
   * into a filled polygon using perpendicular offsets and earcut triangulation.
   * Uses cached stroke outline and indices when available.
   */
  private renderStroke(
    nodeId: string,
    vertices: Float32Array,
    stroke: Stroke,
    closed: boolean,
    nodeOpacity: number = 1
  ): void {
    const align = stroke.align ?? 'center';
    const cached = this.getCachedStrokeOutline(
      nodeId,
      vertices,
      stroke.width,
      closed,
      align,
      stroke.widthProfile
    );
    if (!cached) return;

    const { outline: outlineVertices } = cached;

    if (stroke.gradient) {
      this.renderStrokeStripGradient(
        outlineVertices,
        stroke.gradient,
        stroke.opacity * nodeOpacity,
        closed
      );
      return;
    }

    // Use triangle strip for solid strokes — avoids earcut artifacts on concave shapes
    const color = this.getStrokeColor(stroke, nodeOpacity);
    this.renderStrokeStrip(outlineVertices, color, closed);
  }

  /**
   * Convert a stroke outline polygon (left forward + right reversed) to
   * triangle strip vertex order (interleaved left/right pairs).
   * This avoids earcut on self-intersecting outlines from concave shapes.
   */
  private outlineToTriangleStrip(outline: Float32Array, closed: boolean): Float32Array | null {
    const totalOutlineVerts = outline.length / 2;
    if (totalOutlineVerts < 4 || totalOutlineVerts % 2 !== 0) return null;

    const N = totalOutlineVerts / 2; // vertices per side
    const stripPairs = closed ? N + 1 : N;
    const strip = new Float32Array(stripPairs * 4); // 2 vertices per pair, 2 coords each

    for (let i = 0; i < N; i++) {
      // left[i]: outline vertex at index i
      strip[i * 4] = outline[i * 2]!;
      strip[i * 4 + 1] = outline[i * 2 + 1]!;
      // right[i]: outline vertex at index (2N - 1 - i) (right side is reversed)
      const ri = 2 * N - 1 - i;
      strip[i * 4 + 2] = outline[ri * 2]!;
      strip[i * 4 + 3] = outline[ri * 2 + 1]!;
    }

    if (closed) {
      // Close the strip by repeating the first pair
      strip[N * 4] = outline[0]!;
      strip[N * 4 + 1] = outline[1]!;
      const ri = 2 * N - 1;
      strip[N * 4 + 2] = outline[ri * 2]!;
      strip[N * 4 + 3] = outline[ri * 2 + 1]!;
    }

    return strip;
  }

  /**
   * Render stroke as a triangle strip from the outline polygon.
   * More robust than earcut for concave shapes where the outline self-intersects.
   */
  private renderStrokeStrip(outline: Float32Array, color: Float32Array, closed: boolean): void {
    if (!this.program) return;
    const strip = this.outlineToTriangleStrip(outline, closed);
    if (!strip) return;

    const gl = this.renderer.context;
    this.renderer.useProgram(this.program);
    gl.uniform4fv(this.program.uniforms.u_color ?? null, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, strip);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip.length / 2);
  }

  /**
   * Render stroke as a triangle strip with gradient coloring.
   * Uses the same strip generation as solid strokes but renders with the gradient shader.
   */
  private renderStrokeStripGradient(
    outline: Float32Array,
    gradient: Gradient,
    opacity: number,
    closed: boolean
  ): void {
    if (!this.gradientProgram) return;
    const strip = this.outlineToTriangleStrip(outline, closed);
    if (!strip) return;

    const gl = this.renderer.context;
    this.renderer.useProgram(this.gradientProgram);
    try {
      if (this.currentModelMatrix) {
        gl.uniformMatrix3fv(
          this.gradientProgram.uniforms.u_model ?? null,
          false,
          this.currentModelMatrix
        );
      }
      this.setGradientUniforms(gradient, computeBounds(outline), opacity);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, strip);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip.length / 2);
    } finally {
      if (this.program) {
        this.renderer.useProgram(this.program);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Gradient Rendering
  // --------------------------------------------------------------------------

  /**
   * Render vertices with a gradient using the gradient shader program.
   * Uses cached triangulation indices.
   */
  private renderFillGradient(
    vertices: Float32Array,
    cachedIndices: number[],
    gradient: Gradient,
    opacity: number
  ): void {
    if (!this.gradientProgram) return;

    const gl = this.renderer.context;
    const numVertices = vertices.length / 2;
    if (numVertices < 3) return;

    // Switch to gradient program
    this.renderer.useProgram(this.gradientProgram);
    try {
      // Re-set viewProjection and model on the gradient program
      if (this.currentModelMatrix) {
        gl.uniformMatrix3fv(
          this.gradientProgram.uniforms.u_model ?? null,
          false,
          this.currentModelMatrix
        );
      }

      // Upload gradient uniforms
      this.setGradientUniforms(gradient, computeBounds(vertices), opacity);

      // Upload vertices
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);

      if (cachedIndices.length === 0) {
        gl.drawArrays(gl.TRIANGLE_FAN, 0, numVertices);
      } else {
        const indicesArray = new Uint16Array(cachedIndices);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);
        gl.drawElements(gl.TRIANGLES, cachedIndices.length, gl.UNSIGNED_SHORT, 0);
      }
    } finally {
      // Switch back to flat program for subsequent rendering
      if (this.program) {
        this.renderer.useProgram(this.program);
      }
    }
  }

  /**
   * Set all gradient-related uniforms on the gradient shader program.
   */
  private setGradientUniforms(
    gradient: Gradient,
    bounds: [number, number, number, number],
    opacity: number
  ): void {
    if (!this.gradientProgram) return;

    const gl = this.renderer.context;
    const u = this.gradientProgram.uniforms;

    // Gradient type: 0=linear, 1=radial, 2=conic
    const typeMap: Record<string, number> = { linear: 0, radial: 1, conic: 2 };
    gl.uniform1i(u['u_gradientType'] ?? null, typeMap[gradient.type] ?? 0);

    // Normalize stops
    const stops = normalizeGradientStops(gradient.stops);
    const stopCount = Math.min(stops.length, MAX_GRADIENT_STOPS);
    gl.uniform1i(u['u_stopCount'] ?? null, stopCount);

    // Upload individual stop colors and offsets
    for (let i = 0; i < stopCount; i++) {
      const s = stops[i]!;
      const stopUniform = u[`u_stops[${i}]`];
      const offsetUniform = u[`u_offsets[${i}]`];
      if (stopUniform) {
        gl.uniform4fv(
          stopUniform,
          new Float32Array([s.color.r / 255, s.color.g / 255, s.color.b / 255, s.color.a])
        );
      }
      if (offsetUniform) {
        gl.uniform1f(offsetUniform, s.offset);
      }
    }

    // Bounds
    gl.uniform4fv(u['u_bounds'] ?? null, new Float32Array(bounds));

    // Gradient-specific params
    gl.uniform1f(u['u_angle'] ?? null, gradient.angle ?? 0);
    gl.uniform2fv(
      u['u_center'] ?? null,
      new Float32Array([gradient.center?.x ?? 0.5, gradient.center?.y ?? 0.5])
    );
    gl.uniform1f(u['u_radius'] ?? null, gradient.radius ?? 0.5);
    gl.uniform1f(u['u_opacity'] ?? null, opacity);

    // Linear gradient start/end — fall back to angle-based computation
    if (gradient.type === 'linear') {
      const start = gradient.start;
      const end = gradient.end;
      if (start && end) {
        gl.uniform2fv(u['u_gradStart'] ?? null, new Float32Array([start.x, start.y]));
        gl.uniform2fv(u['u_gradEnd'] ?? null, new Float32Array([end.x, end.y]));
      } else {
        const fallback = linearGradientFromAngle(gradient.angle ?? 0);
        gl.uniform2fv(
          u['u_gradStart'] ?? null,
          new Float32Array([fallback.start.x, fallback.start.y])
        );
        gl.uniform2fv(u['u_gradEnd'] ?? null, new Float32Array([fallback.end.x, fallback.end.y]));
      }
    } else {
      // Non-linear gradients: set defaults that won't affect rendering
      gl.uniform2fv(u['u_gradStart'] ?? null, new Float32Array([0, 0.5]));
      gl.uniform2fv(u['u_gradEnd'] ?? null, new Float32Array([1, 0.5]));
    }
  }

  // --------------------------------------------------------------------------
  // Ghost Rendering (for onion skinning)
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // Bone Rendering
  // --------------------------------------------------------------------------

  /**
   * Parse a hex color string to [r, g, b, a] float array.
   */
  private parseBoneColor(hex: string): [number, number, number, number] {
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.slice(0, 2), 16) / 255;
    const g = parseInt(cleaned.slice(2, 4), 16) / 255;
    const b = parseInt(cleaned.slice(4, 6), 16) / 255;
    return [r, g, b, 1.0];
  }

  /**
   * Build bone geometry vertices based on style.
   * Stick: thin quad from (0,0) to (length,0)
   * Octahedral: diamond shape
   */
  private buildBoneVertices(length: number, style: string): Float32Array {
    if (style === 'stick') {
      const halfH = Math.max(length * 0.04, 1);
      // Simple quad: 2 triangles
      return new Float32Array([
        0,
        -halfH,
        length,
        -halfH,
        length,
        halfH,
        0,
        -halfH,
        length,
        halfH,
        0,
        halfH,
      ]);
    }

    // Octahedral (diamond) style
    const midX = length * 0.25;
    const halfW = length * 0.1;
    // 4 triangles forming a diamond: root → mid-top → tip, root → mid-bottom → tip
    return new Float32Array([
      // Top half: root → mid-top → tip
      0,
      0,
      midX,
      halfW,
      length,
      0,
      // Bottom half: root → tip → mid-bottom
      0,
      0,
      length,
      0,
      midX,
      -halfW,
    ]);
  }

  /**
   * Render a bone node.
   */
  private renderBone(node: BoneNode, worldTransform: Float32Array | Matrix3): void {
    if (!this.program) return;
    const gl = this.renderer.context;

    const modelMatrix =
      worldTransform instanceof Float32Array ? worldTransform : mat3.toFloat32Array(worldTransform);

    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelMatrix);

    const color = this.parseBoneColor(node.boneColor);
    const effectiveOpacity = this.currentEffectiveOpacity ?? node.opacity;
    gl.uniform4fv(
      this.program.uniforms.u_color ?? null,
      new Float32Array([color[0], color[1], color[2], color[3] * effectiveOpacity])
    );

    const vertices = this.buildBoneVertices(node.length, node.boneStyle);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);

    // Draw outline for visibility
    const outlineColor = [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6, effectiveOpacity];
    gl.uniform4fv(this.program.uniforms.u_color ?? null, new Float32Array(outlineColor));

    let outlineVerts: Float32Array;
    if (node.boneStyle === 'stick') {
      const halfH = Math.max(node.length * 0.04, 1);
      outlineVerts = new Float32Array([
        0,
        -halfH,
        node.length,
        -halfH,
        node.length,
        -halfH,
        node.length,
        halfH,
        node.length,
        halfH,
        0,
        halfH,
        0,
        halfH,
        0,
        -halfH,
      ]);
    } else {
      const midX = node.length * 0.25;
      const halfW = node.length * 0.1;
      outlineVerts = new Float32Array([
        0,
        0,
        midX,
        halfW,
        midX,
        halfW,
        node.length,
        0,
        node.length,
        0,
        midX,
        -halfW,
        midX,
        -halfW,
        0,
        0,
      ]);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outlineVerts);
    gl.drawArrays(gl.LINES, 0, outlineVerts.length / 2);
  }

  /**
   * Render a bone with color override (for ghost/onion skinning).
   */
  private renderBoneWithOverride(
    node: BoneNode,
    worldTransform: Float32Array | Matrix3,
    override: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.program) return;
    const gl = this.renderer.context;

    const modelMatrix =
      worldTransform instanceof Float32Array ? worldTransform : mat3.toFloat32Array(worldTransform);

    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, modelMatrix);

    const baseColor = this.parseBoneColor(node.boneColor);
    // Apply tint: 50% mix
    const r = baseColor[0] * 0.5 + override.tint[0] * 0.5;
    const g = baseColor[1] * 0.5 + override.tint[1] * 0.5;
    const b = baseColor[2] * 0.5 + override.tint[2] * 0.5;

    gl.uniform4fv(
      this.program.uniforms.u_color ?? null,
      new Float32Array([r, g, b, override.alpha])
    );

    const vertices = this.buildBoneVertices(node.length, node.boneStyle);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
  }

  // --------------------------------------------------------------------------
  // Skinned Mesh Rendering
  // --------------------------------------------------------------------------

  /**
   * Collect current bone world transforms from the scene graph for a skinned node.
   */
  private collectBoneTransforms(
    skinData: SkinData,
    sceneGraph: SceneGraph
  ): Record<string, AffineTransform2D> {
    const boneWorldTransforms: Record<string, AffineTransform2D> = {};
    for (const boneId of Object.keys(skinData.inverseBindMatrices)) {
      const boneNode = sceneGraph.getNode(boneId);
      if (!boneNode) continue;
      const bw = sceneGraph.getWorldTransform(boneId);
      boneWorldTransforms[boneId] = { a: bw.a, b: bw.b, c: bw.c, d: bw.d, tx: bw.tx, ty: bw.ty };
    }
    return boneWorldTransforms;
  }

  /**
   * Ensure GPU skin data (packed vertices + bone ID mapping) is cached for a skinned node.
   * Called lazily on first GPU render of a skinned node.
   */
  private ensureSkinnedCacheData(
    cached: TessellationCacheEntry,
    skinData: SkinData,
    morphOffsets?: Float32Array
  ): void {
    // Rebuild if morph offsets or skinData changed (reference identity check) or never built
    const morphChanged = morphOffsets !== cached.lastMorphOffsets;
    const skinChanged = skinData !== cached.lastSkinData;
    if (cached.skinnedVertexData && cached.boneIdToIndex && !morphChanged && !skinChanged) return;
    cached.boneIdToIndex = buildBoneIdToIndex(skinData);
    cached.skinnedVertexData = packSkinnedVertices(
      cached.vertices,
      skinData,
      cached.boneIdToIndex,
      morphOffsets
    );
    cached.lastMorphOffsets = morphOffsets;
    cached.lastSkinData = skinData;
  }

  /**
   * Upload bone matrix uniforms to a skinned shader program.
   */
  private uploadBoneMatrices(program: ShaderProgram, boneMatrixData: Float32Array): void {
    const gl = this.renderer.context;
    const maxBones = boneMatrixData.length / 9;
    for (let i = 0; i < maxBones; i++) {
      const uniformLoc = program.uniforms[`u_boneMatrices[${i}]`];
      if (uniformLoc) {
        gl.uniformMatrix3fv(uniformLoc, false, boneMatrixData.subarray(i * 9, i * 9 + 9));
      }
    }
  }

  /**
   * Render fills of a skinned node via GPU vertex shader LBS.
   * Bind-pose vertices + bone weights are in the skinned VBO; only bone matrices update per frame.
   */
  private renderSkinnedFillsGPU(
    cached: TessellationCacheEntry,
    skinData: SkinData,
    fills: Fill[],
    boneWorldTransforms: Record<string, AffineTransform2D>,
    nodeOpacity: number
  ): void {
    if (!this.skinnedProgram || !this.skinnedVAO || !this.skinnedVertexBuffer) return;

    const gl = this.renderer.context;
    const skinnedVertexData = cached.skinnedVertexData!;
    const boneIdToIndex = cached.boneIdToIndex!;
    const fillIndices = cached.fillIndices;

    // Compute bone matrix uniforms
    const boneMatrixData = computeBoneMatrixUniforms(skinData, boneIdToIndex, boneWorldTransforms);

    // Switch to skinned VAO and upload interleaved vertex data
    this.renderer.bindVAO(this.skinnedVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skinnedVertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, skinnedVertexData);

    for (const fill of fills) {
      if (!fill.visible || fill.type === 'none') continue;

      if (fill.type === 'gradient' && fill.gradient && this.skinnedGradientProgram) {
        // Use skinned gradient program
        this.renderer.useProgram(this.skinnedGradientProgram);
        this.uploadBoneMatrices(this.skinnedGradientProgram, boneMatrixData);
        // Set gradient uniforms on the skinned gradient program
        // (setGradientUniforms uses this.gradientProgram, so we temporarily swap)
        const savedGradProg = this.gradientProgram;
        this.gradientProgram = this.skinnedGradientProgram;
        this.setGradientUniforms(
          fill.gradient,
          computeBounds(cached.vertices),
          fill.opacity * nodeOpacity
        );
        this.gradientProgram = savedGradProg;

        // Upload fill indices and draw
        if (fillIndices.length > 0) {
          const indexArray = new Uint16Array(fillIndices);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
          gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indexArray);
          gl.drawElements(gl.TRIANGLES, fillIndices.length, gl.UNSIGNED_SHORT, 0);
        }
      } else {
        // Use skinned flat-color program
        this.renderer.useProgram(this.skinnedProgram);
        this.uploadBoneMatrices(this.skinnedProgram, boneMatrixData);

        const color = this.getFillColor(fill, nodeOpacity);
        gl.uniform4fv(this.skinnedProgram.uniforms.u_color ?? null, color);

        // Upload fill indices and draw
        if (fillIndices.length > 0) {
          const indexArray = new Uint16Array(fillIndices);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
          gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indexArray);
          gl.drawElements(gl.TRIANGLES, fillIndices.length, gl.UNSIGNED_SHORT, 0);
        }
      }
    }

    // Restore standard VAO
    this.renderer.bindVAO(this.vao);
  }

  /**
   * Render strokes for a skinned node via CPU-deformed vertices.
   * Strokes need CPU deformation because outline generation requires actual deformed positions.
   */
  private renderSkinnedStrokes(
    deformedVertices: Float32Array,
    strokes: Stroke[],
    closed: boolean,
    contourVertexCounts: number[] | undefined,
    nodeOpacity: number
  ): void {
    if (strokes.length === 0) return;

    // Ensure flat-color program is active with identity model matrix
    if (!this.program) return;
    this.renderer.useProgram(this.program);
    const identityMatrix = mat3.toFloat32Array(mat3.create());
    this.currentModelMatrix = identityMatrix;
    const gl = this.renderer.context;
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, identityMatrix);

    if (contourVertexCounts && contourVertexCounts.length > 1) {
      // Per-contour stroke rendering for compound paths
      let vertOffset = 0;
      for (const contourVCount of contourVertexCounts) {
        if (contourVCount < 2) {
          vertOffset += contourVCount * 2;
          continue;
        }
        const contourDeformed = deformedVertices.subarray(
          vertOffset,
          vertOffset + contourVCount * 2
        );
        for (const stroke of strokes) {
          if (!stroke.visible || stroke.width <= 0) continue;
          const align = stroke.align ?? 'center';
          const outlineVertices = generateStrokeOutlineVertices(
            contourDeformed,
            contourVCount,
            stroke.width,
            true,
            align,
            stroke.widthProfile
          );
          if (outlineVertices.length / 2 < 3) continue;
          if (stroke.gradient) {
            this.renderStrokeStripGradient(
              outlineVertices,
              stroke.gradient,
              stroke.opacity * nodeOpacity,
              true
            );
          } else {
            const color = this.getStrokeColor(stroke, nodeOpacity);
            this.renderStrokeStrip(outlineVertices, color, true);
          }
        }
        vertOffset += contourVCount * 2;
      }
    } else {
      // Single contour
      const numDeformedVerts = deformedVertices.length / 2;
      if (numDeformedVerts >= 2) {
        for (const stroke of strokes) {
          if (!stroke.visible || stroke.width <= 0) continue;
          const align = stroke.align ?? 'center';
          const outlineVertices = generateStrokeOutlineVertices(
            deformedVertices,
            numDeformedVerts,
            stroke.width,
            closed,
            align,
            stroke.widthProfile
          );
          if (outlineVertices.length / 2 < 3) continue;
          if (stroke.gradient) {
            this.renderStrokeStripGradient(
              outlineVertices,
              stroke.gradient,
              stroke.opacity * nodeOpacity,
              closed
            );
          } else {
            const color = this.getStrokeColor(stroke, nodeOpacity);
            this.renderStrokeStrip(outlineVertices, color, closed);
          }
        }
      }
    }
  }

  /**
   * Render a skinned node using hybrid GPU/CPU approach:
   * - GPU path for fills (vertex shader LBS) when available and bone count ≤ 32
   * - CPU path for strokes (needs deformed positions for outline generation)
   */
  private renderSkinnedNode(node: Node, sceneGraph: SceneGraph): void {
    if (!this.program) return;

    const skinData = (node as any).skinData as SkinData;
    if (!skinData) return;

    // Get bind-pose tessellation from geometry cache
    const cached = this.geometryCache.get(node.id);
    if (!cached) return;

    // Get fills/strokes from node
    const fills: Fill[] = 'fills' in node ? (node as any).fills : [];
    const strokes: Stroke[] = 'strokes' in node ? (node as any).strokes : [];
    const closed = 'closed' in node ? (node as any).closed : true;

    // Collect current bone world transforms
    const boneWorldTransforms = this.collectBoneTransforms(skinData, sceneGraph);

    // Get morph offsets for this node (from Smart Bones evaluation)
    const nodeMorphOffsets = this.currentMorphOffsets?.get(node.id);

    // Determine if GPU path is available
    const boneCount = Object.keys(skinData.inverseBindMatrices).length;
    const canUseGPU =
      this.skinnedProgram != null &&
      this.skinnedVAO != null &&
      this.skinnedVertexBuffer != null &&
      boneCount <= MAX_BONES_GPU;

    // --- Fills ---
    if (fills.length > 0) {
      if (canUseGPU) {
        // Ensure GPU skin data is cached (with morph offsets baked in)
        this.ensureSkinnedCacheData(cached, skinData, nodeMorphOffsets);
        if (cached.skinnedVertexData && cached.boneIdToIndex) {
          this.renderSkinnedFillsGPU(
            cached,
            skinData,
            fills,
            boneWorldTransforms,
            this.currentEffectiveOpacity
          );
        }
      } else {
        // CPU fallback for fills
        const deformed = deformVertices(
          cached.vertices,
          skinData,
          boneWorldTransforms,
          nodeMorphOffsets
        );
        this.renderer.useProgram(this.program);
        const identityMatrix = mat3.toFloat32Array(mat3.create());
        this.currentModelMatrix = identityMatrix;
        const gl = this.renderer.context;
        gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, identityMatrix);
        for (const fill of fills) {
          if (fill.visible && fill.type !== 'none') {
            this.renderFill(deformed, cached.fillIndices, fill, this.currentEffectiveOpacity);
          }
        }
      }
    }

    // --- Strokes (always CPU — needs deformed positions for outline generation) ---
    if (strokes.length > 0) {
      const deformed = deformVertices(
        cached.vertices,
        skinData,
        boneWorldTransforms,
        nodeMorphOffsets
      );
      this.renderSkinnedStrokes(
        deformed,
        strokes,
        closed,
        cached.contourVertexCounts,
        this.currentEffectiveOpacity
      );
    }
  }

  /**
   * Render a skinned image node — deforms the textured quad via CPU skinning.
   */
  private renderSkinnedImage(node: ImageNode, sceneGraph: SceneGraph): void {
    if (!this.textureProgram || !this.textureVAO || !this.textureVertexBuffer) return;

    const skinData = node.skinData as SkinData;
    if (!skinData) return;

    const texture = this.getTexture(node.src);
    if (!texture) return;

    // Get bind-pose quad from geometry cache
    const cached = this.geometryCache.get(node.id);
    if (!cached) return;

    const gl = this.renderer.context;

    // Collect current bone world transforms
    const boneWorldTransforms: Record<string, AffineTransform2D> = {};
    for (const boneId of Object.keys(skinData.inverseBindMatrices)) {
      const boneNode = sceneGraph.getNode(boneId);
      if (!boneNode) continue;
      const bw = sceneGraph.getWorldTransform(boneId);
      boneWorldTransforms[boneId] = { a: bw.a, b: bw.b, c: bw.c, d: bw.d, tx: bw.tx, ty: bw.ty };
    }

    // Get morph offsets for this image node (from Smart Bones evaluation)
    const nodeMorphOffsets = this.currentMorphOffsets?.get(node.id);

    // Deform quad vertices via CPU linear blend skinning — result is in world space
    const deformed = deformVertices(
      cached.vertices,
      skinData,
      boneWorldTransforms,
      nodeMorphOffsets
    );

    // Build interleaved position+UV buffer from deformed quad
    // Bind-pose vertex order: [BL, BR, TL, TR] (matches renderImage)
    // UV order: BL=(0,1), BR=(1,1), TL=(0,0), TR=(1,0)
    const quadData = new Float32Array([
      deformed[0],
      deformed[1],
      0,
      1, // bottom-left
      deformed[2],
      deformed[3],
      1,
      1, // bottom-right
      deformed[4],
      deformed[5],
      0,
      0, // top-left
      deformed[6],
      deformed[7],
      1,
      0, // top-right
    ]);

    // Switch to texture program
    this.renderer.useProgram(this.textureProgram);
    this.renderer.bindVAO(this.textureVAO);

    if (this.currentVPArray) {
      gl.uniformMatrix3fv(
        this.textureProgram.uniforms.u_viewProjection ?? null,
        false,
        this.currentVPArray
      );
    }

    // Identity model matrix — deformed vertices are already in world space
    const identityMatrix = mat3.toFloat32Array(mat3.create());
    gl.uniformMatrix3fv(this.textureProgram.uniforms.u_model ?? null, false, identityMatrix);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureVertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, quadData);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.textureProgram.uniforms.u_texture ?? null, 0);

    gl.uniform1f(this.textureProgram.uniforms.u_opacity ?? null, this.currentEffectiveOpacity);
    gl.uniform4fv(this.textureProgram.uniforms.u_tintColor ?? null, new Float32Array([0, 0, 0, 0]));

    // Image adjustments
    const adj = node.adjustments;
    gl.uniform1f(this.textureProgram.uniforms.u_brightness ?? null, (adj?.brightness ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_contrast ?? null, (adj?.contrast ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_saturation ?? null, (adj?.saturation ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_hue ?? null, ((adj?.hue ?? 0) * Math.PI) / 180);
    gl.uniform1f(this.textureProgram.uniforms.u_exposure ?? null, (adj?.exposure ?? 0) / 100);
    gl.uniform1f(this.textureProgram.uniforms.u_temperature ?? null, (adj?.temperature ?? 0) / 100);

    // Corner radius SDF — disable for skinned (deformed quad breaks SDF)
    gl.uniform2f(this.textureProgram.uniforms.u_rectSize ?? null, node.width, node.height);
    gl.uniform4fv(
      this.textureProgram.uniforms.u_cornerRadius ?? null,
      new Float32Array([0, 0, 0, 0])
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Restore shape program + VAO
    if (this.program && this.vao) {
      this.renderer.useProgram(this.program);
      this.renderer.bindVAO(this.vao);
    }
  }

  /**
   * Get tessellated vertex positions for a node (from the geometry cache).
   * Returns world-space Float32Array of xy pairs, or null if not cached.
   */
  getTessellatedVertices(nodeId: string): Float32Array | null {
    const cached = this.geometryCache.get(nodeId);
    if (!cached) return null;
    return cached.vertices;
  }

  /**
   * Get the axis-aligned bounding box of a skinned node's deformed vertices in world space.
   * Returns {x, y, width, height} or null if the node has no skinData or no cached geometry.
   */
  getDeformedBounds(
    node: Node,
    sceneGraph: SceneGraph
  ): { x: number; y: number; width: number; height: number } | null {
    const skinData = (node as any).skinData as SkinData | undefined;
    if (!skinData) return null;

    const cached = this.geometryCache.get(node.id);
    if (!cached) return null;

    // Collect current bone world transforms
    const boneWorldTransforms: Record<string, AffineTransform2D> = {};
    for (const boneId of Object.keys(skinData.inverseBindMatrices)) {
      const boneNode = sceneGraph.getNode(boneId);
      if (!boneNode) continue;
      const bw = sceneGraph.getWorldTransform(boneId);
      boneWorldTransforms[boneId] = { a: bw.a, b: bw.b, c: bw.c, d: bw.d, tx: bw.tx, ty: bw.ty };
    }

    const deformed = deformVertices(cached.vertices, skinData, boneWorldTransforms);
    if (deformed.length < 2) return null;

    let minX = deformed[0];
    let minY = deformed[1];
    let maxX = deformed[0];
    let maxY = deformed[1];
    for (let i = 2; i < deformed.length; i += 2) {
      const x = deformed[i];
      const y = deformed[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Render weight visualization overlay — heat map showing bone influence per vertex.
   * Call this after normal rendering when weight paint tool is active.
   */
  renderWeightVisualization(
    node: Node,
    activeBoneId: string,
    viewProjectionMatrix: Matrix3,
    sceneGraph: SceneGraph
  ): void {
    if (
      !this.weightProgram ||
      !this.weightVAO ||
      !this.weightVertexBuffer ||
      !this.weightColorBuffer
    )
      return;

    const skinData = (node as any).skinData as SkinData;
    if (!skinData) return;

    const gl = this.renderer.context;

    // Get tessellation
    const cached = this.geometryCache.get(node.id);
    if (!cached) return;

    const vertices = cached.vertices;
    const fillIndices = cached.fillIndices;
    const numVertices = vertices.length / 2;
    if (numVertices === 0 || fillIndices.length === 0) return;

    // Build vertex colors based on weights for activeBoneId
    const colors = new Float32Array(numVertices * 3);
    for (let i = 0; i < numVertices; i++) {
      const entry = i < skinData.vertices.length ? skinData.vertices[i] : null;
      const weight = entry
        ? (entry.influences.find((inf) => inf.boneId === activeBoneId)?.weight ?? 0)
        : 0;

      // Heat map: 0=blue, 0.5=green, 1.0=red
      let r: number, g: number, b: number;
      if (weight <= 0.5) {
        const t = weight * 2;
        r = 0;
        g = t;
        b = 1 - t;
      } else {
        const t = (weight - 0.5) * 2;
        r = t;
        g = 1 - t;
        b = 0;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    // Get world-space vertex positions (may be deformed)
    let worldVertices: Float32Array;
    if (Object.keys(skinData.inverseBindMatrices).length > 0) {
      const boneWorldTransforms: Record<string, AffineTransform2D> = {};
      for (const boneId of Object.keys(skinData.inverseBindMatrices)) {
        const bw = sceneGraph.getWorldTransform(boneId);
        boneWorldTransforms[boneId] = { a: bw.a, b: bw.b, c: bw.c, d: bw.d, tx: bw.tx, ty: bw.ty };
      }
      worldVertices = deformVertices(vertices, skinData, boneWorldTransforms);
    } else {
      worldVertices = vertices;
    }

    // Setup weight shader
    this.renderer.useProgram(this.weightProgram);
    this.renderer.bindVAO(this.weightVAO);

    const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
    gl.uniformMatrix3fv(this.weightProgram.uniforms.u_viewProjection ?? null, false, vpArray);

    const identityMatrix = mat3.toFloat32Array(mat3.create());
    gl.uniformMatrix3fv(this.weightProgram.uniforms.u_model ?? null, false, identityMatrix);
    gl.uniform1f(this.weightProgram.uniforms.u_alpha ?? null, 0.6);

    // Upload positions
    gl.bindBuffer(gl.ARRAY_BUFFER, this.weightVertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, worldVertices);

    // Upload colors
    gl.bindBuffer(gl.ARRAY_BUFFER, this.weightColorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);

    // Draw using fill indices
    if (fillIndices.length > 0) {
      const indexData = new Uint16Array(fillIndices);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indexData);
      gl.drawElements(gl.TRIANGLES, fillIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    // Restore normal shader state
    this.renderer.useProgram(this.program!);
    this.renderer.bindVAO(this.vao);
  }

  /**
   * Render a single node as a ghost frame with tint color and alpha override.
   * Used by OnionSkinRenderer for onion skinning.
   */
  renderGhostNode(
    node: Node,
    viewProjectionMatrix: Matrix3,
    alpha: number,
    tintColor: [number, number, number]
  ): void {
    if (!this.program || !this.vao || !node.visible) return;

    const gl = this.renderer.context;

    // Set up shader program
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Set view-projection matrix
    const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
    this.currentVPArray = vpArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_viewProjection ?? null, false, vpArray);

    // Create world matrix from node transform
    const worldMatrix = mat3.compose(
      node.transform.position,
      node.transform.rotation,
      node.transform.scale,
      node.transform.anchor
    );

    // Multiply ghost alpha by node's own opacity for correct visual representation
    const effectiveAlpha = alpha * (node.opacity ?? 1);
    const colorOverride = { tint: tintColor, alpha: effectiveAlpha };

    switch (node.type) {
      case 'rectangle':
        this.renderRectangleWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'ellipse':
        this.renderEllipseWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'polygon':
        this.renderPolygonWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'path':
        this.renderPathWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'text':
        this.renderTextWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'image':
        this.renderImageWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'bone':
        this.renderBoneWithOverride(node, worldMatrix, colorOverride);
        break;
    }

    this.renderer.bindVAO(null);
  }

  /**
   * Render a ghost boolean group node (for onion skinning).
   * Ghost nodes are transient, so we skip caching.
   */
  renderGhostBooleanGroup(
    groupNode: GroupNode,
    children: Node[],
    childTransforms: Matrix3[],
    viewProjectionMatrix: Matrix3,
    alpha: number,
    tintColor: [number, number, number]
  ): void {
    if (!this.program || !this.vao) return;
    const op = groupNode.booleanOp;
    if (!op || children.length < 2) return;

    // Compute boolean result
    let accum: MultiPolygon | null = null;
    for (let i = 0; i < children.length; i++) {
      const poly = nodeToPolygon(children[i]!, childTransforms[i]!);
      if (!poly) continue;
      if (!accum) {
        accum = poly;
      } else {
        accum = performBoolean(accum, poly, op);
      }
    }
    if (!accum || accum.length === 0) return;

    // Tessellate directly from MultiPolygon ring structure (outer+holes per polygon)
    const allRingArrays: Float32Array[] = [];
    const polyRings: number[][] = [];
    for (const polygon of accum) {
      if (polygon.length === 0) continue;
      const idxs: number[] = [];
      for (const ring of polygon) {
        let pts = ring;
        if (pts.length > 1) {
          const f = pts[0]!;
          const l = pts[pts.length - 1]!;
          if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) {
            pts = pts.slice(0, -1);
          }
        }
        if (pts.length < 3) continue;
        const flat = new Float32Array(pts.length * 2);
        for (let j = 0; j < pts.length; j++) {
          flat[j * 2] = pts[j]![0];
          flat[j * 2 + 1] = pts[j]![1];
        }
        idxs.push(allRingArrays.length);
        allRingArrays.push(flat);
      }
      if (idxs.length > 0) polyRings.push(idxs);
    }
    if (allRingArrays.length === 0) return;

    // Combine all ring vertices
    let totalFloats = 0;
    const gvStarts: number[] = [];
    for (const arr of allRingArrays) {
      gvStarts.push(totalFloats / 2);
      totalFloats += arr.length;
    }
    const vertices = new Float32Array(totalFloats);
    let wo = 0;
    for (const arr of allRingArrays) {
      vertices.set(arr, wo);
      wo += arr.length;
    }

    // Earcut each polygon with proper holes
    const ghostFillIndices: number[] = [];
    for (const ringIdxs of polyRings) {
      let gf = 0;
      for (const ri of ringIdxs) gf += allRingArrays[ri]!.length;
      const gv = new Float32Array(gf);
      const gh: number[] = [];
      const ls: number[] = [];
      let lo = 0;
      for (let gi = 0; gi < ringIdxs.length; gi++) {
        const ri = ringIdxs[gi]!;
        ls.push(lo / 2);
        if (gi > 0) gh.push(lo / 2);
        gv.set(allRingArrays[ri]!, lo);
        lo += allRingArrays[ri]!.length;
      }
      if (gv.length / 2 < 3) continue;
      const idcs = earcut(gv, gh.length > 0 ? gh : undefined);
      for (const li of idcs) {
        let slot = 0;
        for (let gi = ringIdxs.length - 1; gi >= 0; gi--) {
          if (li >= ls[gi]!) {
            slot = gi;
            break;
          }
        }
        ghostFillIndices.push(gvStarts[ringIdxs[slot]!]! + li - ls[slot]!);
      }
    }

    const gl = this.renderer.context;
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
    gl.uniformMatrix3fv(this.program.uniforms.u_viewProjection ?? null, false, vpArray);

    // Use identity model matrix (result is in world space)
    const identityArray = mat3.toFloat32Array(mat3.identity());
    gl.uniformMatrix3fv(this.program.uniforms.u_model ?? null, false, identityArray);

    const effectiveAlpha = alpha * (groupNode.opacity ?? 1);
    const fills = groupNode.fills ?? [];
    const strokes = groupNode.strokes ?? [];

    for (const fill of fills) {
      if (fill.visible && fill.type !== 'none') {
        const color = this.applyTintAndAlpha(this.getFillColor(fill), tintColor, effectiveAlpha);
        this.renderFillWithColor(vertices, ghostFillIndices, color);
      }
    }
    // Render strokes per-ring to avoid bridge lines between disjoint contours
    for (const stroke of strokes) {
      if (stroke.visible && stroke.width > 0) {
        const color = this.applyTintAndAlpha(
          this.getStrokeColor(stroke),
          tintColor,
          effectiveAlpha
        );
        for (const ringVerts of allRingArrays) {
          this.renderStrokeWithColor(ringVerts, stroke, true, color);
        }
      }
    }
    this.renderer.bindVAO(null);
  }

  /**
   * Apply tint color (50% mix) and multiply alpha.
   */
  applyTintAndAlpha(
    color: Float32Array,
    tint: [number, number, number],
    alpha: number
  ): Float32Array {
    const mix = 0.5;
    return new Float32Array([
      (color[0] ?? 0) * (1 - mix) + tint[0] * mix,
      (color[1] ?? 0) * (1 - mix) + tint[1] * mix,
      (color[2] ?? 0) * (1 - mix) + tint[2] * mix,
      (color[3] ?? 0) * alpha,
    ]);
  }

  /**
   * Shared helper for ghost override methods: sets model matrix uniform and
   * delegates to renderFillsAndStrokesGhost. Each shape-specific override
   * method generates its own tessellated vertices and calls this.
   */
  private renderNodeGhost(
    tessellated: Float32Array,
    fills: Fill[],
    strokes: Stroke[],
    closed: boolean,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.program) return;
    const gl = this.renderer.context;
    gl.uniformMatrix3fv(
      this.program.uniforms.u_model ?? null,
      false,
      mat3.toFloat32Array(worldMatrix)
    );
    this.renderFillsAndStrokesGhost(tessellated, fills, strokes, closed, colorOverride);
  }

  private renderRectangleWithOverride(
    node: RectangleNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    const pathPoints = createRectanglePath(
      -node.width * node.transform.anchor.x,
      -node.height * node.transform.anchor.y,
      node.width,
      node.height,
      node.cornerRadius
    );
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);
    this.renderNodeGhost(tessellated, node.fills, node.strokes, true, worldMatrix, colorOverride);
  }

  private renderEllipseWithOverride(
    node: EllipseNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    const pathPoints = createEllipsePath(0, 0, node.radiusX, node.radiusY);
    const tessellated = tessellatePathToVertices(pathPoints, true, ELLIPSE_TESSELLATION_TOLERANCE);
    this.renderNodeGhost(tessellated, node.fills, node.strokes, true, worldMatrix, colorOverride);
  }

  private renderPolygonWithOverride(
    node: PolygonNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    const pathPoints =
      node.innerRadius !== undefined
        ? createStarPath(
            0,
            0,
            node.radius,
            node.innerRadius,
            node.sides,
            undefined,
            node.cornerRadius
          )
        : createPolygonPath(0, 0, node.radius, node.sides, undefined, node.cornerRadius);
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);
    this.renderNodeGhost(tessellated, node.fills, node.strokes, true, worldMatrix, colorOverride);
  }

  private renderPathWithOverride(
    node: PathNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (node.points.length < 2) return;

    // Multi-contour ghost rendering
    if (node.subpaths && node.subpaths.length > 0 && node.closed) {
      const allContours = [node.points, ...node.subpaths];
      const contourArrays: Float32Array[] = [];
      for (const contour of allContours) {
        const processed = applyCornerRadius(contour, true);
        contourArrays.push(
          tessellatePathToVertices(processed, true, DEFAULT_TESSELLATION_TOLERANCE)
        );
      }

      // Compute global vertex starts
      const globalVertStarts: number[] = [];
      let totalFloats = 0;
      for (const arr of contourArrays) {
        globalVertStarts.push(totalFloats / 2);
        totalFloats += arr.length;
      }

      const combined = new Float32Array(totalFloats);
      let writeOff = 0;
      for (const arr of contourArrays) {
        combined.set(arr, writeOff);
        writeOff += arr.length;
      }

      // Group by containment and tessellate per group
      const groups = groupContoursByContainment(contourArrays);
      const ghostFillIndices: number[] = [];
      for (const group of groups) {
        const contourIndices = [group.outer, ...group.holes];
        let groupFloats = 0;
        for (const ci of contourIndices) groupFloats += contourArrays[ci]!.length;
        const groupVerts = new Float32Array(groupFloats);
        const groupHoles: number[] = [];
        const localStarts: number[] = [];
        let lOff = 0;
        for (let gi = 0; gi < contourIndices.length; gi++) {
          const ci = contourIndices[gi]!;
          localStarts.push(lOff / 2);
          if (gi > 0) groupHoles.push(lOff / 2);
          groupVerts.set(contourArrays[ci]!, lOff);
          lOff += contourArrays[ci]!.length;
        }
        if (groupVerts.length / 2 < 3) continue;
        const indices = earcut(groupVerts, groupHoles.length > 0 ? groupHoles : undefined);
        for (const localIdx of indices) {
          let slot = 0;
          for (let gi = contourIndices.length - 1; gi >= 0; gi--) {
            if (localIdx >= localStarts[gi]!) {
              slot = gi;
              break;
            }
          }
          ghostFillIndices.push(
            globalVertStarts[contourIndices[slot]!]! + localIdx - localStarts[slot]!
          );
        }
      }

      // Ghost fills
      if (!this.program) return;
      const gl = this.renderer.context;
      gl.uniformMatrix3fv(
        this.program.uniforms.u_model ?? null,
        false,
        mat3.toFloat32Array(worldMatrix)
      );

      for (const fill of node.fills) {
        if (fill.visible && fill.type !== 'none') {
          const color = this.applyTintAndAlpha(
            this.getFillColor(fill),
            colorOverride.tint,
            colorOverride.alpha
          );
          this.renderFillWithColor(combined, ghostFillIndices, color);
        }
      }

      // Ghost strokes per contour
      for (const contourVerts of contourArrays) {
        for (const stroke of node.strokes) {
          if (stroke.visible && stroke.width > 0) {
            const color = this.applyTintAndAlpha(
              this.getStrokeColor(stroke),
              colorOverride.tint,
              colorOverride.alpha
            );
            this.renderStrokeWithColor(contourVerts, stroke, true, color);
          }
        }
      }
      return;
    }

    // Simple single-contour ghost
    const processed = applyCornerRadius(node.points, node.closed);
    const tessellated = tessellatePathToVertices(
      processed,
      node.closed,
      DEFAULT_TESSELLATION_TOLERANCE
    );
    const fills = node.closed ? node.fills : [];
    this.renderNodeGhost(tessellated, fills, node.strokes, node.closed, worldMatrix, colorOverride);
  }

  private renderTextWithOverride(
    node: TextNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!node.content) return;

    const fm = getFontManager();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const font = fm.getFontOrFallback(node.fontFamily, node.fontWeight);
    if (!font) return;

    // Apply anchor offset for non-zero anchors (centers text geometry)
    let adjustedMatrix = worldMatrix;
    const ax = node.transform.anchor.x;
    const ay = node.transform.anchor.y;
    if (ax !== 0 || ay !== 0) {
      const rawBounds = getTextBounds(
        node.content,
        node.fontFamily,
        node.fontSize,
        node.lineHeight,
        node.letterSpacing,
        node.textAlign
      );
      const offsetX = -(rawBounds.x + rawBounds.width * ax);
      const offsetY = -(rawBounds.y + rawBounds.height * ay);
      adjustedMatrix = mat3.translate(worldMatrix, offsetX, offsetY);
    }

    const result = textToSubpaths(node.content, font, node.fontSize, {
      textAlign: node.textAlign,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
    });

    if (result.subpaths.length === 0) return;

    // Tessellate all glyph contours
    const contourArrays: Float32Array[] = [];
    for (const sp of result.subpaths) {
      if (sp.length < 2) continue;
      const verts = tessellatePathToVertices(sp, true, DEFAULT_TESSELLATION_TOLERANCE);
      if (verts.length >= 6) contourArrays.push(verts);
    }

    if (contourArrays.length === 0) return;

    // Combine into single array
    let totalFloats = 0;
    for (const arr of contourArrays) totalFloats += arr.length;
    const combined = new Float32Array(totalFloats);
    let writeOff = 0;
    for (const arr of contourArrays) {
      combined.set(arr, writeOff);
      writeOff += arr.length;
    }

    this.renderNodeGhost(combined, node.fills, node.strokes, true, adjustedMatrix, colorOverride);
  }

  private renderImageWithOverride(
    node: ImageNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.textureProgram || !this.textureVAO || !this.textureVertexBuffer) return;

    const texture = this.getTexture(node.src);
    if (!texture) return;

    const gl = this.renderer.context;

    // Switch to texture program + VAO
    this.renderer.useProgram(this.textureProgram);
    this.renderer.bindVAO(this.textureVAO);

    // Set VP matrix (cached from renderGhostNode)
    if (this.currentVPArray) {
      gl.uniformMatrix3fv(
        this.textureProgram.uniforms.u_viewProjection ?? null,
        false,
        this.currentVPArray
      );
    }

    // Set model matrix
    gl.uniformMatrix3fv(
      this.textureProgram.uniforms.u_model ?? null,
      false,
      mat3.toFloat32Array(worldMatrix)
    );

    // Build quad
    const ax = node.transform.anchor.x;
    const ay = node.transform.anchor.y;
    const x0 = -node.width * ax;
    const y0 = -node.height * ay;
    const x1 = x0 + node.width;
    const y1 = y0 + node.height;

    const quadData = new Float32Array([x0, y0, 0, 1, x1, y0, 1, 1, x0, y1, 0, 0, x1, y1, 1, 0]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureVertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, quadData);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.textureProgram.uniforms.u_texture ?? null, 0);

    // Set opacity with ghost alpha
    gl.uniform1f(this.textureProgram.uniforms.u_opacity ?? null, colorOverride.alpha);

    // Tint color for ghost rendering (0.5 mix)
    gl.uniform4fv(
      this.textureProgram.uniforms.u_tintColor ?? null,
      new Float32Array([colorOverride.tint[0], colorOverride.tint[1], colorOverride.tint[2], 0.5])
    );

    // No adjustments for ghost
    gl.uniform1f(this.textureProgram.uniforms.u_brightness ?? null, 0);
    gl.uniform1f(this.textureProgram.uniforms.u_contrast ?? null, 0);
    gl.uniform1f(this.textureProgram.uniforms.u_saturation ?? null, 0);
    gl.uniform1f(this.textureProgram.uniforms.u_hue ?? null, 0);
    gl.uniform1f(this.textureProgram.uniforms.u_exposure ?? null, 0);
    gl.uniform1f(this.textureProgram.uniforms.u_temperature ?? null, 0);

    // Corner radius SDF uniforms
    gl.uniform2f(this.textureProgram.uniforms.u_rectSize ?? null, node.width, node.height);
    const cr2 = node.cornerRadius ?? [0, 0, 0, 0];
    gl.uniform4fv(
      this.textureProgram.uniforms.u_cornerRadius ?? null,
      new Float32Array([cr2[0], cr2[1], cr2[2], cr2[3]])
    );

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Restore shape program + VAO
    if (this.program && this.vao) {
      this.renderer.useProgram(this.program);
      this.renderer.bindVAO(this.vao);
    }
  }

  /**
   * Render fill with explicit color (bypassing getFillColor).
   * Accepts pre-computed earcut indices.
   */
  private renderFillWithColor(
    vertices: Float32Array,
    cachedIndices: number[],
    color: Float32Array
  ): void {
    if (!this.program) return;
    const gl = this.renderer.context;
    gl.uniform4fv(this.program.uniforms.u_color ?? null, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    const numVertices = vertices.length / 2;
    if (numVertices < 3) return;
    if (cachedIndices.length === 0) {
      gl.drawArrays(gl.TRIANGLE_FAN, 0, numVertices);
      return;
    }
    const indicesArray = new Uint16Array(cachedIndices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);
    gl.drawElements(gl.TRIANGLES, cachedIndices.length, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Render stroke with explicit color (bypassing getStrokeColor)
   */
  private renderStrokeWithColor(
    vertices: Float32Array,
    stroke: Stroke,
    closed: boolean,
    color: Float32Array
  ): void {
    if (!this.program) return;
    const numVertices = vertices.length / 2;
    if (numVertices < 2) return;
    const outlineVertices = generateStrokeOutlineVertices(
      vertices,
      numVertices,
      stroke.width,
      closed,
      stroke.align ?? 'center'
    );
    if (outlineVertices.length / 2 < 3) return;
    this.renderStrokeStrip(outlineVertices, color, closed);
  }

  // --------------------------------------------------------------------------
  // Color Utilities
  // --------------------------------------------------------------------------

  private getFillColor(fill: Fill, nodeOpacity: number = 1): Float32Array {
    if (fill.type === 'solid' && fill.color) {
      return this.colorToFloat32Array(fill.color, fill.opacity, nodeOpacity);
    }
    if (fill.type === 'gradient' && fill.gradient && fill.gradient.stops.length > 0) {
      // For flat-color contexts (e.g. ghost rendering), use first stop color
      return this.colorToFloat32Array(fill.gradient.stops[0]!.color, fill.opacity, nodeOpacity);
    }
    return new Float32Array([0.5, 0.5, 0.5, fill.opacity * nodeOpacity]);
  }

  private getStrokeColor(stroke: Stroke, nodeOpacity: number = 1): Float32Array {
    return this.colorToFloat32Array(stroke.color, stroke.opacity, nodeOpacity);
  }

  private colorToFloat32Array(
    color: Color,
    opacity: number,
    nodeOpacity: number = 1
  ): Float32Array {
    return new Float32Array([
      color.r / 255,
      color.g / 255,
      color.b / 255,
      color.a * opacity * nodeOpacity,
    ]);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  dispose(): void {
    const gl = this.renderer.context;

    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
      this.vertexBuffer = null;
    }
    if (this.indexBuffer) {
      gl.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    // Texture resources
    if (this.textureVertexBuffer) {
      gl.deleteBuffer(this.textureVertexBuffer);
      this.textureVertexBuffer = null;
    }
    if (this.textureVAO) {
      gl.deleteVertexArray(this.textureVAO);
      this.textureVAO = null;
    }
    for (const texture of this.textureCache.values()) {
      gl.deleteTexture(texture);
    }
    this.textureCache.clear();
    this.pendingImages.clear();

    // Weight visualization resources
    if (this.weightVertexBuffer) {
      gl.deleteBuffer(this.weightVertexBuffer);
      this.weightVertexBuffer = null;
    }
    if (this.weightColorBuffer) {
      gl.deleteBuffer(this.weightColorBuffer);
      this.weightColorBuffer = null;
    }
    if (this.weightVAO) {
      gl.deleteVertexArray(this.weightVAO);
      this.weightVAO = null;
    }

    // GPU skinning resources
    if (this.skinnedVertexBuffer) {
      gl.deleteBuffer(this.skinnedVertexBuffer);
      this.skinnedVertexBuffer = null;
    }
    if (this.skinnedVAO) {
      gl.deleteVertexArray(this.skinnedVAO);
      this.skinnedVAO = null;
    }

    // Clean up shader programs from WebGLRenderer
    this.renderer.deleteProgram('shape');
    this.renderer.deleteProgram('shape-gradient');
    this.renderer.deleteProgram('shape-texture');
    this.renderer.deleteProgram('shape-weight');
    this.renderer.deleteProgram('shape-skinned');
    this.renderer.deleteProgram('shape-skinned-gradient');
    this.program = null;
    this.gradientProgram = null;
    this.textureProgram = null;
    this.weightProgram = null;
    this.skinnedProgram = null;
    this.skinnedGradientProgram = null;

    this.geometryCache.clear();

    // Effect renderer cleanup
    this.effectRenderer.dispose();
  }
}
