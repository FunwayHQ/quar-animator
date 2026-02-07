import { describe, it, expect } from 'vitest';
import {
  computeBounds,
  normalizeGradientStops,
  sampleGradientColor,
  createDefaultGradient,
} from './gradientUtils';
import type { GradientStop } from '@quar/types';

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
    const stops: GradientStop[] = [
      { offset: 0.5, color: { r: 255, g: 0, b: 0, a: 1 } },
    ];
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
