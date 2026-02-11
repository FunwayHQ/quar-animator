/**
 * Tests for brushOutline utility
 */

import { describe, it, expect } from 'vitest';
import {
  generateBrushOutline,
  computePolylineLength,
  generateRoundCap,
  cornerPoint,
} from './brushOutline';
import type { PathPoint, BrushProfile } from '@quar/types';

function makeSpine(positions: { x: number; y: number }[]): PathPoint[] {
  return positions.map((pos) => ({
    position: pos,
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  }));
}

describe('generateBrushOutline', () => {
  it('should return input when fewer than 2 spine points', () => {
    const single = makeSpine([{ x: 0, y: 0 }]);
    const result = generateBrushOutline(single, [5]);
    expect(result).toEqual(single);
  });

  it('should return input when spine points are coincident', () => {
    const coincident = makeSpine([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ]);
    const result = generateBrushOutline(coincident, [5, 5]);
    // With zero length polyline, returns input
    expect(result).toEqual(coincident);
  });

  it('should generate a closed outline with more points than input', () => {
    const spine = makeSpine([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    const widths = [10, 10, 10];
    const outline = generateBrushOutline(spine, widths);

    // Outline should have many more points (left + right sides + caps)
    expect(outline.length).toBeGreaterThan(spine.length);
    // All points should be corner type
    for (const p of outline) {
      expect(p.type).toBe('corner');
      expect(p.handleIn).toBeNull();
      expect(p.handleOut).toBeNull();
    }
  });

  it('should produce identical results with no profile vs uniform profile', () => {
    const spine = makeSpine([
      { x: 0, y: 0 },
      { x: 50, y: 25 },
      { x: 100, y: 0 },
    ]);
    const widths = [8, 8, 8];

    const noProfile = generateBrushOutline(spine, widths);
    const uniformProfile: BrushProfile = { id: 'uniform', name: 'Uniform', samples: [1, 1] };
    const withUniform = generateBrushOutline(spine, widths, uniformProfile);

    expect(noProfile.length).toBe(withUniform.length);
    for (let i = 0; i < noProfile.length; i++) {
      expect(noProfile[i].position.x).toBeCloseTo(withUniform[i].position.x, 4);
      expect(noProfile[i].position.y).toBeCloseTo(withUniform[i].position.y, 4);
    }
  });

  it('should narrow the end when using taper-out profile', () => {
    const spine = makeSpine([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    const widths = [10, 10];

    const noProfile = generateBrushOutline(spine, widths);
    const taperOut: BrushProfile = {
      id: 'taper-out',
      name: 'Taper Out',
      samples: [1, 1, 0.8, 0.5, 0.2, 0],
    };
    const tapered = generateBrushOutline(spine, widths, taperOut);

    // Both should produce outlines
    expect(noProfile.length).toBeGreaterThan(0);
    expect(tapered.length).toBeGreaterThan(0);

    // Compute bounding boxes — tapered should be narrower at the end (x=100 side)
    const noProfileEndPoints = noProfile.filter((p) => p.position.x > 80);
    const taperedEndPoints = tapered.filter((p) => p.position.x > 80);

    if (noProfileEndPoints.length > 0 && taperedEndPoints.length > 0) {
      const noProfileYSpread =
        Math.max(...noProfileEndPoints.map((p) => p.position.y)) -
        Math.min(...noProfileEndPoints.map((p) => p.position.y));
      const taperedYSpread =
        Math.max(...taperedEndPoints.map((p) => p.position.y)) -
        Math.min(...taperedEndPoints.map((p) => p.position.y));

      // Tapered end should be narrower than uniform
      expect(taperedYSpread).toBeLessThan(noProfileYSpread);
    }
  });

  it('should handle null profile same as no profile', () => {
    const spine = makeSpine([
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ]);
    const widths = [6, 6];

    const noProfile = generateBrushOutline(spine, widths);
    const nullProfile = generateBrushOutline(spine, widths, null);

    expect(noProfile.length).toBe(nullProfile.length);
    for (let i = 0; i < noProfile.length; i++) {
      expect(noProfile[i].position.x).toBeCloseTo(nullProfile[i].position.x, 4);
      expect(noProfile[i].position.y).toBeCloseTo(nullProfile[i].position.y, 4);
    }
  });

  it('should apply profile interpolation correctly at midpoint', () => {
    // Profile that is 0 at start and 1 at end
    const spine = makeSpine([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    const widths = [10, 10];
    const rampProfile: BrushProfile = { id: 'ramp', name: 'Ramp', samples: [0, 1] };
    const result = generateBrushOutline(spine, widths, rampProfile);

    // Start of the outline should be narrower than the end
    const startPoints = result.filter((p) => p.position.x < 20);
    const endPoints = result.filter((p) => p.position.x > 80);

    if (startPoints.length > 0 && endPoints.length > 0) {
      const startYSpread =
        Math.max(...startPoints.map((p) => p.position.y)) -
        Math.min(...startPoints.map((p) => p.position.y));
      const endYSpread =
        Math.max(...endPoints.map((p) => p.position.y)) -
        Math.min(...endPoints.map((p) => p.position.y));

      expect(endYSpread).toBeGreaterThan(startYSpread);
    }
  });
});

describe('computePolylineLength', () => {
  it('should return 0 for empty or single point', () => {
    expect(computePolylineLength([])).toBe(0);
    expect(computePolylineLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it('should compute correct length for horizontal line', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(computePolylineLength(points)).toBeCloseTo(100, 5);
  });

  it('should compute correct length for multi-segment line', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 4 },
    ];
    expect(computePolylineLength(points)).toBeCloseTo(5, 5);
  });
});

describe('generateRoundCap', () => {
  it('should return empty for zero radius', () => {
    const center = { x: 0, y: 0 };
    const left = { x: 0, y: 0 };
    const right = { x: 0, y: 0 };
    expect(generateRoundCap(center, left, right, 4, true)).toEqual([]);
  });

  it('should generate correct number of points', () => {
    const center = { x: 0, y: 0 };
    const left = { x: 0, y: 5 };
    const right = { x: 0, y: -5 };
    const cap = generateRoundCap(center, left, right, 4, true);
    expect(cap.length).toBe(5); // numPoints + 1
  });
});

describe('cornerPoint', () => {
  it('should create corner PathPoint from Vector2', () => {
    const p = cornerPoint({ x: 10, y: 20 });
    expect(p.position).toEqual({ x: 10, y: 20 });
    expect(p.type).toBe('corner');
    expect(p.handleIn).toBeNull();
    expect(p.handleOut).toBeNull();
  });
});
