/**
 * Gradient utilities for Quar Animator
 * Pure math functions for gradient computation
 */

import type { Gradient, GradientStop, Color } from '@quar/types';

// ============================================================================
// Bounds computation
// ============================================================================

/**
 * Compute the bounding box of a set of vertices.
 * Returns [minX, minY, maxX, maxY].
 */
export function computeBounds(vertices: Float32Array): [number, number, number, number] {
  if (vertices.length < 2) return [0, 0, 0, 0];

  let minX = vertices[0];
  let minY = vertices[1];
  let maxX = vertices[0];
  let maxY = vertices[1];

  for (let i = 2; i < vertices.length; i += 2) {
    const x = vertices[i];
    const y = vertices[i + 1];
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
    return [
      { ...stops[0], offset: 0 },
      { ...stops[0], offset: 1 },
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
    const angle = gradient.angle ?? 0;
    const rad = (angle * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    t = (nx - 0.5) * dir.x + (ny - 0.5) * dir.y + 0.5;
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
  if (t <= stops[0].offset) return { ...stops[0].color };
  if (t >= stops[stops.length - 1].offset) return { ...stops[stops.length - 1].color };

  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].offset) {
      const s0 = stops[i - 1];
      const s1 = stops[i];
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

  return { ...stops[stops.length - 1].color };
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
      return { type: 'linear', stops, angle: 0 };
    case 'radial':
      return { type: 'radial', stops, center: { x: 0.5, y: 0.5 }, radius: 0.5 };
    case 'conic':
      return { type: 'conic', stops, center: { x: 0.5, y: 0.5 }, angle: 0 };
  }
}
