/**
 * Math utilities for Quar Animator
 */

import type { Vector2, Rect, Matrix3 } from '@quar/types';

/**
 * Standard epsilon for floating-point comparisons throughout the math module.
 */
export const EPSILON = 1e-10;

// ============================================================================
// Vector2 Operations
// ============================================================================

export const vec2 = {
  create(x = 0, y = 0): Vector2 {
    return { x, y };
  },

  clone(v: Vector2): Vector2 {
    return { x: v.x, y: v.y };
  },

  add(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  subtract(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  multiply(v: Vector2, scalar: number): Vector2 {
    return { x: v.x * scalar, y: v.y * scalar };
  },

  divide(v: Vector2, scalar: number): Vector2 {
    if (Math.abs(scalar) < EPSILON) {
      throw new Error('Division by zero in vec2.divide');
    }
    return { x: v.x / scalar, y: v.y / scalar };
  },

  dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
  },

  cross(a: Vector2, b: Vector2): number {
    return a.x * b.y - a.y * b.x;
  },

  length(v: Vector2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  },

  lengthSquared(v: Vector2): number {
    return v.x * v.x + v.y * v.y;
  },

  normalize(v: Vector2): Vector2 {
    const len = vec2.length(v);
    if (len < EPSILON) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  distance(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  distanceSquared(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  },

  lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  },

  rotate(v: Vector2, angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: v.x * cos - v.y * sin,
      y: v.x * sin + v.y * cos,
    };
  },

  angle(v: Vector2): number {
    return Math.atan2(v.y, v.x);
  },

  angleBetween(a: Vector2, b: Vector2): number {
    return Math.atan2(vec2.cross(a, b), vec2.dot(a, b));
  },

  equals(a: Vector2, b: Vector2, epsilon = 0.0001): boolean {
    return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
  },

  zero(): Vector2 {
    return { x: 0, y: 0 };
  },

  one(): Vector2 {
    return { x: 1, y: 1 };
  },
};

// ============================================================================
// Matrix3 Operations (2D transformation matrix)
// ============================================================================

export const mat3 = {
  identity(): Matrix3 {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  },

  create(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0): Matrix3 {
    return { a, b, c, d, tx, ty };
  },

  clone(m: Matrix3): Matrix3 {
    return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty };
  },

  multiply(a: Matrix3, b: Matrix3): Matrix3 {
    return {
      a: a.a * b.a + a.c * b.b,
      b: a.b * b.a + a.d * b.b,
      c: a.a * b.c + a.c * b.d,
      d: a.b * b.c + a.d * b.d,
      tx: a.a * b.tx + a.c * b.ty + a.tx,
      ty: a.b * b.tx + a.d * b.ty + a.ty,
    };
  },

  translate(m: Matrix3, x: number, y: number): Matrix3 {
    return mat3.multiply(m, { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y });
  },

  rotate(m: Matrix3, angle: number): Matrix3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return mat3.multiply(m, { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 });
  },

  scale(m: Matrix3, sx: number, sy: number): Matrix3 {
    return mat3.multiply(m, { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 });
  },

  skew(m: Matrix3, skewX: number, skewY: number): Matrix3 {
    return mat3.multiply(m, {
      a: 1,
      b: Math.tan(skewY),
      c: Math.tan(skewX),
      d: 1,
      tx: 0,
      ty: 0,
    });
  },

  invert(m: Matrix3): Matrix3 | null {
    const det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) < EPSILON) return null;

    const invDet = 1 / det;
    return {
      a: m.d * invDet,
      b: -m.b * invDet,
      c: -m.c * invDet,
      d: m.a * invDet,
      tx: (m.c * m.ty - m.d * m.tx) * invDet,
      ty: (m.b * m.tx - m.a * m.ty) * invDet,
    };
  },

  transformPoint(m: Matrix3, p: Vector2): Vector2 {
    return {
      x: m.a * p.x + m.c * p.y + m.tx,
      y: m.b * p.x + m.d * p.y + m.ty,
    };
  },

  decompose(m: Matrix3): {
    position: Vector2;
    rotation: number;
    scale: Vector2;
    skew: Vector2;
  } {
    const a = m.a;
    const b = m.b;
    const c = m.c;
    const d = m.d;

    const scaleX = Math.sqrt(a * a + b * b);
    const scaleY = Math.sqrt(c * c + d * d);

    // Guard against zero scale
    if (scaleX < EPSILON) {
      return {
        position: { x: m.tx, y: m.ty },
        rotation: 0,
        scale: { x: 0, y: scaleY },
        skew: { x: 0, y: 0 },
      };
    }

    // Normalize
    const na = a / scaleX;
    const nb = b / scaleX;

    const rotation = Math.atan2(nb, na);

    return {
      position: { x: m.tx, y: m.ty },
      rotation: rotation * (180 / Math.PI),
      scale: { x: scaleX, y: scaleY },
      skew: { x: 0, y: 0 }, // Simplified
    };
  },

  compose(
    position: Vector2,
    rotation: number,
    scale: Vector2,
    anchor: Vector2 = { x: 0, y: 0 }
  ): Matrix3 {
    const rad = rotation * (Math.PI / 180);

    // Start with identity
    let m = mat3.identity();

    // Translate to position
    m = mat3.translate(m, position.x, position.y);

    // Rotate
    m = mat3.rotate(m, rad);

    // Scale
    m = mat3.scale(m, scale.x, scale.y);

    // Translate by negative anchor
    m = mat3.translate(m, -anchor.x, -anchor.y);

    return m;
  },

  toArray(m: Matrix3): number[] {
    // Column-major for WebGL
    return [m.a, m.b, 0, m.c, m.d, 0, m.tx, m.ty, 1];
  },

  toFloat32Array(m: Matrix3): Float32Array {
    return new Float32Array(mat3.toArray(m));
  },
};

// ============================================================================
// Rect Operations
// ============================================================================

export const rect = {
  create(x = 0, y = 0, width = 0, height = 0): Rect {
    return { x, y, width, height };
  },

  fromPoints(p1: Vector2, p2: Vector2): Rect {
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);
    return { x, y, width, height };
  },

  contains(r: Rect, p: Vector2): boolean {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  },

  intersects(a: Rect, b: Rect): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  },

  union(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    return { x, y, width: right - x, height: bottom - y };
  },

  center(r: Rect): Vector2 {
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },

  expand(r: Rect, amount: number): Rect {
    return {
      x: r.x - amount,
      y: r.y - amount,
      width: r.width + amount * 2,
      height: r.height + amount * 2,
    };
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  const range = b - a;
  if (Math.abs(range) < EPSILON) return 0;
  return (value - a) / range;
}

export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
