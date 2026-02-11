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
  Node,
  Fill,
  Stroke,
  Color,
  Gradient,
  BooleanOp,
} from '@quar/types';
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
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;

  // Texture rendering
  private textureVAO: WebGLVertexArrayObject | null = null;
  private textureVertexBuffer: WebGLBuffer | null = null;
  private textureCache: Map<string, WebGLTexture> = new Map();
  private pendingImages: Map<string, Promise<HTMLImageElement>> = new Map();
  private currentVPArray: Float32Array | null = null;

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

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.vertices = new Float32Array(MAX_VERTICES * 2);
    this.indices = new Uint16Array(MAX_VERTICES * 3); // Triangulated indices

    this.initializeShaders();
    this.initializeBuffers();
    this.initializeTextureBuffers();
    this.effectRenderer = new EffectRenderer(renderer);
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
    align: string
  ): { outline: Float32Array; indices: number[] } | null {
    const numVertices = vertices.length / 2;
    if (numVertices < 2) return null;

    const strokeKey = `${strokeWidth}:${align}`;
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
      align as 'center' | 'inside' | 'outside'
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
    _selectedIds: Set<string> = new Set()
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

    // Cache VP array for texture program
    this.currentVPArray = vpArray;

    // Get canvas dimensions for effect rendering
    const canvasWidth = gl.drawingBufferWidth;
    const canvasHeight = gl.drawingBufferHeight;

    // Traverse and render visible shapes
    sceneGraph.traverseVisible((node) => {
      const worldTransform = sceneGraph.getWorldTransform(node.id);
      this.currentEffectiveOpacity = sceneGraph.getEffectiveOpacity(node.id);

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
    });

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
    }

    this.renderer.bindVAO(null);
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

    // UV: Y inverted because texImage2D loads top-to-bottom but world is Y-up
    const quadData = new Float32Array([
      x0,
      y0,
      0,
      1, // bottom-left  → UV (0,1)
      x1,
      y0,
      1,
      1, // bottom-right → UV (1,1)
      x0,
      y1,
      0,
      0, // top-left     → UV (0,0)
      x1,
      y1,
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

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
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
            let pts = ring;
            if (
              pts.length > 1 &&
              pts[0]![0] === pts[pts.length - 1]![0] &&
              pts[0]![1] === pts[pts.length - 1]![1]
            ) {
              pts = pts.slice(0, -1);
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
    // Cannot use renderStroke() here because getCachedStrokeOutline uses the same
    // cacheKey for all rings, so ring 2+ would get ring 1's cached outline.
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
            const strokeIndices = earcut(outline);
            if (strokeIndices.length === 0) continue;

            if (stroke.gradient) {
              this.renderFillGradient(
                outline,
                Array.from(strokeIndices),
                stroke.gradient,
                stroke.opacity * nodeOpacity
              );
            } else {
              this.renderer.useProgram(this.program);
              const color = this.getStrokeColor(stroke, nodeOpacity);
              gl.uniform4fv(this.program.uniforms.u_color ?? null, color);
              gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
              gl.bufferSubData(gl.ARRAY_BUFFER, 0, outline);
              const idxArr = new Uint16Array(strokeIndices);
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
              gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, idxArr);
              gl.drawElements(gl.TRIANGLES, strokeIndices.length, gl.UNSIGNED_SHORT, 0);
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

    const entry: TessellationCacheEntry = {
      geoKey,
      vertices: combined,
      fillIndices: allFillIndices,
      strokeCache: new Map(),
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
    const cached = this.getCachedStrokeOutline(nodeId, vertices, stroke.width, closed, align);
    if (!cached) return;

    const { outline: outlineVertices, indices: strokeIndices } = cached;

    // Use gradient shader for stroke gradient
    if (stroke.gradient) {
      this.renderFillGradient(
        outlineVertices,
        strokeIndices,
        stroke.gradient,
        stroke.opacity * nodeOpacity
      );
      return;
    }

    if (!this.program) return;

    const gl = this.renderer.context;

    // Ensure flat-color program is active
    this.renderer.useProgram(this.program);

    // Set stroke color
    const color = this.getStrokeColor(stroke, nodeOpacity);
    gl.uniform4fv(this.program.uniforms.u_color ?? null, color);

    // Upload outline vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outlineVertices);

    if (strokeIndices.length === 0) return;

    // Upload cached indices and draw
    const indicesArray = new Uint16Array(strokeIndices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);

    gl.drawElements(gl.TRIANGLES, strokeIndices.length, gl.UNSIGNED_SHORT, 0);
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
        if (
          pts.length > 1 &&
          pts[0]![0] === pts[pts.length - 1]![0] &&
          pts[0]![1] === pts[pts.length - 1]![1]
        ) {
          pts = pts.slice(0, -1);
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

    this.renderNodeGhost(combined, node.fills, node.strokes, true, worldMatrix, colorOverride);
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
    const gl = this.renderer.context;
    const numVertices = vertices.length / 2;
    if (numVertices < 2) return;
    const outlineVertices = generateStrokeOutlineVertices(
      vertices,
      numVertices,
      stroke.width,
      closed,
      stroke.align ?? 'center'
    );
    const outlineCount = outlineVertices.length / 2;
    if (outlineCount < 3) return;
    gl.uniform4fv(this.program.uniforms.u_color ?? null, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outlineVertices);
    const indices = earcut(outlineVertices);
    if (indices.length === 0) return;
    const indicesArray = new Uint16Array(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
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

    // Clean up shader programs from WebGLRenderer
    this.renderer.deleteProgram('shape');
    this.renderer.deleteProgram('shape-gradient');
    this.renderer.deleteProgram('shape-texture');
    this.program = null;
    this.gradientProgram = null;
    this.textureProgram = null;

    this.geometryCache.clear();

    // Effect renderer cleanup
    this.effectRenderer.dispose();
  }
}
