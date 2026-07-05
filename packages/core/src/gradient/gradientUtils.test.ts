import { describe, it, expect } from 'vitest';
import {
  computeBounds,
  normalizeGradientStops,
  sampleGradientColor,
  createDefaultGradient,
  getNodeLocalBounds,
} from './gradientUtils';
import { createPolygonPath, tessellatePathToVertices } from '../path/pathUtils';
import type { GradientStop, Node } from '@quar/types';

// ============================================================================
// computeBounds
// ============================================================================

describe('computeBounds', () => {
  it('computes bounds of a simple quad', () => {
    const verts = new Float32Array([0, 0, 100, 0, 100, 50, 0, 50]);
    expect(computeBounds(verts)).toEqual([0, 0, 100, 50]);
  });

  it('handles negative coordinates', () => {
    const verts = new Float32Array([-50, -30, 50, 30]);
    expect(computeBounds(verts)).toEqual([-50, -30, 50, 30]);
  });

  it('returns zeros for empty vertices', () => {
    expect(computeBounds(new Float32Array([]))).toEqual([0, 0, 0, 0]);
  });

  it('handles single vertex', () => {
    const verts = new Float32Array([10, 20]);
    expect(computeBounds(verts)).toEqual([10, 20, 10, 20]);
  });
});

// ============================================================================
// normalizeGradientStops
// ============================================================================

describe('normalizeGradientStops', () => {
  it('returns default black-white for empty stops', () => {
    const result = normalizeGradientStops([]);
    expect(result).toHaveLength(2);
    expect(result[0].offset).toBe(0);
    expect(result[1].offset).toBe(1);
  });

  it('duplicates single stop to start and end', () => {
    const stops: GradientStop[] = [{ offset: 0.5, color: { r: 255, g: 0, b: 0, a: 1 } }];
    const result = normalizeGradientStops(stops);
    expect(result).toHaveLength(2);
    expect(result[0].offset).toBe(0);
    expect(result[1].offset).toBe(1);
    expect(result[0].color.r).toBe(255);
    expect(result[1].color.r).toBe(255);
  });

  it('sorts unsorted stops', () => {
    const stops: GradientStop[] = [
      { offset: 0.8, color: { r: 0, g: 0, b: 255, a: 1 } },
      { offset: 0.2, color: { r: 255, g: 0, b: 0, a: 1 } },
      { offset: 0.5, color: { r: 0, g: 255, b: 0, a: 1 } },
    ];
    const result = normalizeGradientStops(stops);
    expect(result.map((s) => s.offset)).toEqual([0.2, 0.5, 0.8]);
  });

  it('clamps out-of-range offsets', () => {
    const stops: GradientStop[] = [
      { offset: -0.5, color: { r: 0, g: 0, b: 0, a: 1 } },
      { offset: 1.5, color: { r: 255, g: 255, b: 255, a: 1 } },
    ];
    const result = normalizeGradientStops(stops);
    expect(result[0].offset).toBe(0);
    expect(result[1].offset).toBe(1);
  });
});

// ============================================================================
// sampleGradientColor
// ============================================================================

describe('sampleGradientColor', () => {
  const verts = new Float32Array([0, 0, 100, 0, 100, 100, 0, 100]);

  it('samples linear gradient at midpoint', () => {
    const gradient = createDefaultGradient('linear');
    gradient.angle = 0;
    const color = sampleGradientColor(gradient, verts, 50, 50);
    // At midpoint of a 0-degree linear gradient, should be between the two stop colors
    expect(color.r).toBeGreaterThan(0);
    expect(color.a).toBe(1);
  });

  it('samples radial gradient at center', () => {
    const gradient = createDefaultGradient('radial');
    const color = sampleGradientColor(gradient, verts, 50, 50);
    // At center, t=0, should be first stop color
    expect(color.r).toBe(gradient.stops[0].color.r);
    expect(color.g).toBe(gradient.stops[0].color.g);
  });

  it('samples radial gradient at edge', () => {
    const gradient = createDefaultGradient('radial');
    // At corner, far from center
    const color = sampleGradientColor(gradient, verts, 100, 100);
    // Should be closer to the second stop
    expect(color.r).not.toBe(gradient.stops[0].color.r);
  });

  it('samples conic gradient', () => {
    const gradient = createDefaultGradient('conic');
    const color = sampleGradientColor(gradient, verts, 100, 50);
    expect(color.a).toBe(1);
  });

  it('clamps t to 0-1', () => {
    const gradient = createDefaultGradient('linear');
    gradient.angle = 0;
    // Position well outside bounds
    const color = sampleGradientColor(gradient, verts, -1000, 50);
    expect(color.a).toBe(1);
    // Should be the first stop color
    expect(color.r).toBe(gradient.stops[0].color.r);
  });
});

// ============================================================================
// createDefaultGradient
// ============================================================================

describe('createDefaultGradient', () => {
  it('creates linear gradient', () => {
    const g = createDefaultGradient('linear');
    expect(g.type).toBe('linear');
    expect(g.stops).toHaveLength(2);
    expect(g.angle).toBe(0);
  });

  it('creates radial gradient', () => {
    const g = createDefaultGradient('radial');
    expect(g.type).toBe('radial');
    expect(g.center).toEqual({ x: 0.5, y: 0.5 });
    expect(g.radius).toBe(0.5);
  });

  it('creates conic gradient', () => {
    const g = createDefaultGradient('conic');
    expect(g.type).toBe('conic');
    expect(g.center).toEqual({ x: 0.5, y: 0.5 });
    expect(g.angle).toBe(0);
  });

  it('defaults to linear', () => {
    const g = createDefaultGradient();
    expect(g.type).toBe('linear');
  });

  it('all gradients have valid stops with offset 0 and 1', () => {
    for (const type of ['linear', 'radial', 'conic'] as const) {
      const g = createDefaultGradient(type);
      expect(g.stops[0].offset).toBe(0);
      expect(g.stops[1].offset).toBe(1);
      expect(g.stops[0].color.a).toBe(1);
      expect(g.stops[1].color.a).toBe(1);
    }
  });
});

// ============================================================================
// getNodeLocalBounds (F034)
// ============================================================================

describe('getNodeLocalBounds', () => {
  const polygon = (radius: number, sides: number, sx: number, sy: number): Node =>
    ({
      type: 'polygon',
      radius,
      sides,
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: sx, y: sy },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
    }) as unknown as Node;

  it('is scale-invariant for polygons and matches the renderer bbox (F034)', () => {
    const b1 = getNodeLocalBounds(polygon(100, 5, 1, 1));
    const b2 = getNodeLocalBounds(polygon(100, 5, 2, 2));
    // Scale is applied via the world matrix, so it must NOT be baked in here.
    expect(b2).toEqual(b1);

    // Matches the renderer's unscaled tessellated-vertex bbox...
    const verts = tessellatePathToVertices(
      createPolygonPath(0, 0, 100, 5, undefined, undefined),
      true,
      1.0
    );
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < verts.length; i += 2) {
      minX = Math.min(minX, verts[i]!);
      maxX = Math.max(maxX, verts[i]!);
    }
    expect(b1[0]).toBeCloseTo(minX, 3);
    expect(b1[2]).toBeCloseTo(maxX, 3);
    // ...and is NOT the circumscribed-circle box.
    expect(b1).not.toEqual([-100, -100, 100, 100]);
  });

  it('returns a tighter-than-circumscribed box for a triangle (F034)', () => {
    const [, minY, maxX] = getNodeLocalBounds(polygon(100, 3, 1, 1));
    expect(maxX).toBeLessThan(100);
    expect(minY).toBeGreaterThan(-100);
  });

  it('includes bezier curve extrema for paths (F034)', () => {
    const path = {
      type: 'path',
      closed: true,
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      points: [
        {
          position: { x: 0, y: 0 },
          handleIn: { x: 0, y: 0 },
          handleOut: { x: 50, y: 120 },
          type: 'smooth',
        },
        {
          position: { x: 100, y: 0 },
          handleIn: { x: -50, y: 120 },
          handleOut: { x: 0, y: 0 },
          type: 'smooth',
        },
      ],
    } as unknown as Node;
    const [, , , maxY] = getNodeLocalBounds(path);
    // The anchor-only bbox has maxY = 0; the curve bulges well beyond it.
    expect(maxY).toBeGreaterThan(10);
  });
});
