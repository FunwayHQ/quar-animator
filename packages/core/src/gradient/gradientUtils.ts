/**
 * Gradient utilities for Quar Animator
 * Pure math functions for gradient computation
 */

import type { Gradient, GradientStop, Color, Vector2, Matrix3, Node } from '@quar/types';
import { mat3 } from '../math';
import {
  createPolygonPath,
  createStarPath,
  tessellatePathToVertices,
  applyCornerRadius,
} from '../path/pathUtils';

/** Mirrors ShapeRenderer's DEFAULT_TESSELLATION_TOLERANCE (module-local there);
 *  the exact value barely affects a bounding box. */
const GRADIENT_BOUNDS_TOLERANCE = 1.0;

/** [minX, minY, maxX, maxY] of an interleaved xy vertex array, or all-zero. */
function boundsFromVertices(vertices: Float32Array): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vertices.length; i += 2) {
    const x = vertices[i]!;
    const y = vertices[i + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

// ============================================================================
// Bounds computation
// ============================================================================

/**
 * Compute the bounding box of a set of vertices.
 * Returns [minX, minY, maxX, maxY].
 */
export function computeBounds(vertices: Float32Array): [number, number, number, number] {
  if (vertices.length < 2) return [0, 0, 0, 0];

  let minX = vertices[0] as number;
  let minY = vertices[1] as number;
  let maxX = minX;
  let maxY = minY;

  for (let i = 2; i < vertices.length; i += 2) {
    const x = vertices[i] as number;
    const y = vertices[i + 1] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return [minX, minY, maxX, maxY];
}

// ============================================================================
// Stop normalization
// ============================================================================

/**
 * Normalize gradient stops: sort by offset, clamp to 0-1, ensure at least 2 stops.
 */
export function normalizeGradientStops(stops: GradientStop[]): GradientStop[] {
  if (stops.length === 0) {
    return [
      { offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 255, g: 255, b: 255, a: 1 } },
    ];
  }

  if (stops.length === 1) {
    const stop = stops[0]!;
    return [
      { ...stop, offset: 0 },
      { ...stop, offset: 1 },
    ];
  }

  // Clone, clamp offsets, and sort
  const normalized = stops
    .map((s) => ({
      ...s,
      offset: Math.max(0, Math.min(1, s.offset)),
    }))
    .sort((a, b) => a.offset - b.offset);

  return normalized;
}

// ============================================================================
// CPU-side gradient sampling
// ============================================================================

/**
 * Sample the gradient color at a given position within the vertex bounding box.
 * Used for thumbnails, tests, and CPU-side rendering.
 */
export function sampleGradientColor(
  gradient: Gradient,
  vertices: Float32Array,
  x: number,
  y: number
): Color {
  const [minX, minY, maxX, maxY] = computeBounds(vertices);
  const stops = normalizeGradientStops(gradient.stops);
  const w = maxX - minX;
  const h = maxY - minY;

  // Normalize position to 0-1
  const nx = w > 0 ? (x - minX) / w : 0.5;
  const ny = h > 0 ? (y - minY) / h : 0.5;

  let t: number;

  if (gradient.type === 'linear') {
    const start = gradient.start;
    const end = gradient.end;
    if (start && end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.001) {
        const ndx = dx / len;
        const ndy = dy / len;
        t = ((nx - start.x) * ndx + (ny - start.y) * ndy) / len;
      } else {
        t = 0.5;
      }
    } else {
      const angle = gradient.angle ?? 0;
      const rad = (angle * Math.PI) / 180;
      const dir = { x: Math.cos(rad), y: Math.sin(rad) };
      t = (nx - 0.5) * dir.x + (ny - 0.5) * dir.y + 0.5;
    }
  } else if (gradient.type === 'radial') {
    const cx = gradient.center?.x ?? 0.5;
    const cy = gradient.center?.y ?? 0.5;
    let r = gradient.radius ?? 0.5;
    if (r <= 0) r = 0.001;
    const dx = nx - cx;
    const dy = ny - cy;
    t = Math.sqrt(dx * dx + dy * dy) / r;
  } else {
    // conic
    const cx = gradient.center?.x ?? 0.5;
    const cy = gradient.center?.y ?? 0.5;
    const startAngle = gradient.angle ?? 0;
    const dx = nx - cx;
    const dy = ny - cy;
    const a = Math.atan2(dy, dx) + Math.PI;
    const startRad = (startAngle * Math.PI) / 180;
    const rawT = ((a - startRad + Math.PI * 4) % (Math.PI * 2)) / (Math.PI * 2);
    t = isFinite(rawT) ? rawT : 0;
  }

  t = Math.max(0, Math.min(1, t));

  return interpolateStopColor(stops, t);
}

/**
 * Interpolate color from sorted gradient stops at parameter t.
 */
function interpolateStopColor(stops: GradientStop[], t: number): Color {
  if (stops.length === 0) return { r: 0, g: 0, b: 0, a: 1 };
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (t <= first.offset) return { ...first.color };
  if (t >= last.offset) return { ...last.color };

  for (let i = 1; i < stops.length; i++) {
    const s1 = stops[i]!;
    if (t <= s1.offset) {
      const s0 = stops[i - 1]!;
      const range = s1.offset - s0.offset;
      const st = range > 0 ? (t - s0.offset) / range : 0;
      return {
        r: Math.round(s0.color.r + (s1.color.r - s0.color.r) * st),
        g: Math.round(s0.color.g + (s1.color.g - s0.color.g) * st),
        b: Math.round(s0.color.b + (s1.color.b - s0.color.b) * st),
        a: s0.color.a + (s1.color.a - s0.color.a) * st,
      };
    }
  }

  return { ...last.color };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a default gradient with sensible defaults.
 */
export function createDefaultGradient(type: 'linear' | 'radial' | 'conic' = 'linear'): Gradient {
  const stops: GradientStop[] = [
    { offset: 0, color: { r: 168, g: 85, b: 247, a: 1 } }, // Violet (accent color)
    { offset: 1, color: { r: 236, g: 72, b: 153, a: 1 } }, // Pink
  ];

  switch (type) {
    case 'linear':
      return {
        type: 'linear',
        stops,
        angle: 0,
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
      };
    case 'radial':
      return {
        type: 'radial',
        stops,
        center: { x: 0.5, y: 0.5 },
        radius: 0.5,
        end: { x: 1, y: 0.5 },
      };
    case 'conic':
      return { type: 'conic', stops, center: { x: 0.5, y: 0.5 }, angle: 0 };
  }
}

// ============================================================================
// Gradient coordinate conversions
// ============================================================================

/**
 * Convert a linear gradient angle to normalized start/end points (0-1 space).
 * angle=0 means left-to-right, angle=90 means bottom-to-top.
 */
export function linearGradientFromAngle(angle: number): { start: Vector2; end: Vector2 } {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    start: { x: 0.5 - cos * 0.5, y: 0.5 - sin * 0.5 },
    end: { x: 0.5 + cos * 0.5, y: 0.5 + sin * 0.5 },
  };
}

/**
 * Convert start/end points (normalized 0-1) back to an angle in degrees.
 */
export function angleFromLinearGradient(start: Vector2, end: Vector2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Get local-space bounding box for a node, matching ShapeRenderer's coordinate system.
 * Returns [minX, minY, maxX, maxY] in node-local coordinates.
 */
export function getNodeLocalBounds(node: Node): [number, number, number, number] {
  const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };
  switch (node.type) {
    case 'rectangle': {
      const x = -node.width * anchor.x;
      const y = -node.height * anchor.y;
      return [x, y, x + node.width, y + node.height];
    }
    case 'ellipse':
      return [-node.radiusX, -node.radiusY, node.radiusX, node.radiusY];
    case 'polygon': {
      // Match the renderer: it tessellates at the UNSCALED radius and applies
      // scale only via the world matrix. Reading transform.scale here would
      // double-apply it (the gradient overlay also uses the world matrix), and
      // the circumscribed-circle box does not match the real vertex bbox.
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
      return boundsFromVertices(
        tessellatePathToVertices(pathPoints, true, GRADIENT_BOUNDS_TOLERANCE)
      );
    }
    case 'path': {
      if (node.points.length === 0) return [0, 0, 0, 0];
      // Match the renderer: tessellate the actual curves (incl. bezier extrema)
      // of every contour rather than using only anchor-point positions.
      const contours = [node.points, ...(node.subpaths ?? [])];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const contour of contours) {
        const processed = applyCornerRadius(contour, node.closed);
        const verts = tessellatePathToVertices(processed, node.closed, GRADIENT_BOUNDS_TOLERANCE);
        if (verts.length === 0) continue;
        const [cx0, cy0, cx1, cy1] = boundsFromVertices(verts);
        if (cx0 < minX) minX = cx0;
        if (cy0 < minY) minY = cy0;
        if (cx1 > maxX) maxX = cx1;
        if (cy1 > maxY) maxY = cy1;
      }
      if (minX === Infinity) return [0, 0, 0, 0];
      return [minX, minY, maxX, maxY];
    }
    default:
      return [0, 0, 0, 0];
  }
}

/**
 * Convert a normalized gradient position (0-1 in local bounds space) to world coordinates.
 */
export function gradientNormalizedToWorld(
  normalized: Vector2,
  localBounds: [number, number, number, number],
  worldMatrix: Matrix3
): Vector2 {
  const [minX, minY, maxX, maxY] = localBounds;
  const w = maxX - minX;
  const h = maxY - minY;
  // Map normalized 0-1 to local coordinates
  const localX = minX + normalized.x * w;
  const localY = minY + normalized.y * h;
  // Transform to world
  return mat3.transformPoint(worldMatrix, { x: localX, y: localY });
}

/**
 * Convert a world position back to normalized gradient coordinates (0-1).
 */
export function worldToGradientNormalized(
  worldPos: Vector2,
  localBounds: [number, number, number, number],
  inverseWorldMatrix: Matrix3
): Vector2 {
  // Transform world to local
  const local = mat3.transformPoint(inverseWorldMatrix, worldPos);
  const [minX, minY, maxX, maxY] = localBounds;
  const w = maxX - minX;
  const h = maxY - minY;
  // Map local to normalized 0-1
  return {
    x: w > 0 ? (local.x - minX) / w : 0.5,
    y: h > 0 ? (local.y - minY) / h : 0.5,
  };
}
