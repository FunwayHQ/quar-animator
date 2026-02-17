import { describe, it, expect } from 'vitest';
import type { PathPoint } from '@quar/types';
import {
  computeSegmentArcLengths,
  subdivideSegmentPoints,
  normalizePointCount,
  findBestCorrespondence,
  applyCorrespondence,
  interpolatePathPoints,
  prepareShapeTween,
  interpolateShapeTween,
} from './shapeTween';

// ============================================================================
// Helpers
// ============================================================================

function corner(x: number, y: number): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut: null, type: 'corner' };
}

function smooth(
  x: number,
  y: number,
  hInX: number,
  hInY: number,
  hOutX: number,
  hOutY: number
): PathPoint {
  return {
    position: { x, y },
    handleIn: { x: hInX, y: hInY },
    handleOut: { x: hOutX, y: hOutY },
    type: 'smooth',
  };
}

// ============================================================================
// computeSegmentArcLengths
// ============================================================================

describe('computeSegmentArcLengths', () => {
  it('returns lengths for a closed triangle', () => {
    const pts = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const lengths = computeSegmentArcLengths(pts, true);
    expect(lengths).toHaveLength(3);
    // First segment: (0,0)→(100,0) = 100
    expect(lengths[0]).toBeCloseTo(100, 0);
    // All lengths should be positive
    for (const l of lengths) expect(l).toBeGreaterThan(0);
  });

  it('returns lengths for an open path', () => {
    const pts = [corner(0, 0), corner(100, 0), corner(200, 0)];
    const lengths = computeSegmentArcLengths(pts, false);
    expect(lengths).toHaveLength(2);
    expect(lengths[0]).toBeCloseTo(100, 0);
    expect(lengths[1]).toBeCloseTo(100, 0);
  });

  it('handles single point', () => {
    const lengths = computeSegmentArcLengths([corner(0, 0)], false);
    expect(lengths).toHaveLength(0);
  });

  it('handles straight-line segment', () => {
    const pts = [corner(0, 0), corner(50, 0)];
    const lengths = computeSegmentArcLengths(pts, false);
    expect(lengths).toHaveLength(1);
    expect(lengths[0]).toBeCloseTo(50, 0);
  });
});

// ============================================================================
// subdivideSegmentPoints
// ============================================================================

describe('subdivideSegmentPoints', () => {
  it('returns endpoints for count=1', () => {
    const p0 = corner(0, 0);
    const p1 = corner(100, 0);
    const result = subdivideSegmentPoints(p0, p1, 1);
    expect(result).toHaveLength(2);
    expect(result[0].position.x).toBe(0);
    expect(result[1].position.x).toBe(100);
  });

  it('subdivides a straight line into equal parts', () => {
    const p0 = corner(0, 0);
    const p1 = corner(100, 0);
    const result = subdivideSegmentPoints(p0, p1, 3);
    // Should produce 4 points (3 segments)
    expect(result).toHaveLength(4);
    // Intermediate points should be approximately evenly spaced
    expect(result[0].position.x).toBeCloseTo(0, 0);
    expect(result[1].position.x).toBeCloseTo(33.3, 0);
    expect(result[2].position.x).toBeCloseTo(66.7, 0);
    expect(result[3].position.x).toBeCloseTo(100, 0);
  });

  it('subdivides a bezier curve', () => {
    const p0 = smooth(0, 0, 0, 0, 30, 0);
    const p1 = smooth(100, 0, -30, 0, 0, 0);
    const result = subdivideSegmentPoints(p0, p1, 2);
    // Should produce 3 points
    expect(result).toHaveLength(3);
    // Middle point should be roughly at x=50
    expect(result[1].position.x).toBeCloseTo(50, 0);
    // Interior point should have handles
    expect(result[1].handleIn).not.toBeNull();
    expect(result[1].handleOut).not.toBeNull();
  });
});

// ============================================================================
// normalizePointCount
// ============================================================================

describe('normalizePointCount', () => {
  it('returns clones when counts are equal', () => {
    const src = [corner(0, 0), corner(100, 0), corner(50, 50)];
    const tgt = [corner(10, 10), corner(90, 10), corner(50, 60)];
    const result = normalizePointCount(src, tgt, true, true);
    expect(result.source).toHaveLength(3);
    expect(result.target).toHaveLength(3);
    // Check it's a clone, not the same reference
    expect(result.source[0]).not.toBe(src[0]);
  });

  it('adds points to shorter path (3→6)', () => {
    const src = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const tgt = [
      corner(0, 0),
      corner(50, 0),
      corner(100, 0),
      corner(100, 50),
      corner(50, 100),
      corner(0, 50),
    ];
    const result = normalizePointCount(src, tgt, true, true);
    expect(result.source).toHaveLength(6);
    expect(result.target).toHaveLength(6);
  });

  it('works with open paths', () => {
    const src = [corner(0, 0), corner(100, 0)];
    const tgt = [corner(0, 0), corner(50, 0), corner(100, 0)];
    const result = normalizePointCount(src, tgt, false, false);
    expect(result.source).toHaveLength(3);
    expect(result.target).toHaveLength(3);
  });

  it('preserves handles during normalization', () => {
    const src = [smooth(0, 0, 0, 0, 20, 0), smooth(100, 0, -20, 0, 0, 0)];
    const tgt = [corner(0, 0), corner(50, 0), corner(100, 0)];
    const result = normalizePointCount(src, tgt, false, false);
    expect(result.source).toHaveLength(3);
    // Subdivided source points should have handles
    expect(result.source[1].type).toBe('smooth');
  });

  it('handles empty arrays', () => {
    const result = normalizePointCount([], [corner(0, 0)], false, false);
    expect(result.source).toHaveLength(0);
    expect(result.target).toHaveLength(1);
  });
});

// ============================================================================
// findBestCorrespondence
// ============================================================================

describe('findBestCorrespondence', () => {
  it('returns 0 for identical paths', () => {
    const pts = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const offset = findBestCorrespondence(pts, pts, true, true);
    expect(offset).toBe(0);
  });

  it('finds correct offset for a rotated square', () => {
    // source: 4 corners of a square
    const src = [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)];
    // target: same square but rotated by 1
    const tgt = [corner(100, 0), corner(100, 100), corner(0, 100), corner(0, 0)];
    const offset = findBestCorrespondence(src, tgt, true, true);
    // Rotating source by 1 should align with target
    expect(offset).toBe(1);
  });

  it('returns 0 for open paths', () => {
    const src = [corner(0, 0), corner(100, 0)];
    const tgt = [corner(100, 0), corner(0, 0)];
    const offset = findBestCorrespondence(src, tgt, false, false);
    expect(offset).toBe(0);
  });

  it('returns 0 for single-point paths', () => {
    const offset = findBestCorrespondence([corner(0, 0)], [corner(10, 10)], true, true);
    expect(offset).toBe(0);
  });
});

// ============================================================================
// applyCorrespondence
// ============================================================================

describe('applyCorrespondence', () => {
  it('returns clone for offset=0', () => {
    const pts = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const result = applyCorrespondence(pts, 0);
    expect(result).toHaveLength(3);
    expect(result[0].position.x).toBe(0);
    expect(result[0]).not.toBe(pts[0]);
  });

  it('rotates correctly with offset=1', () => {
    const pts = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const result = applyCorrespondence(pts, 1);
    expect(result).toHaveLength(3);
    expect(result[0].position.x).toBe(100);
    expect(result[0].position.y).toBe(0);
    expect(result[1].position.x).toBe(50);
    expect(result[2].position.x).toBe(0);
  });

  it('wraps around correctly', () => {
    const pts = [corner(1, 0), corner(2, 0), corner(3, 0), corner(4, 0)];
    const result = applyCorrespondence(pts, 3);
    expect(result[0].position.x).toBe(4);
    expect(result[1].position.x).toBe(1);
    expect(result[2].position.x).toBe(2);
    expect(result[3].position.x).toBe(3);
  });
});

// ============================================================================
// interpolatePathPoints
// ============================================================================

describe('interpolatePathPoints', () => {
  it('returns source at t=0', () => {
    const a = [corner(0, 0), corner(100, 0)];
    const b = [corner(0, 100), corner(100, 100)];
    const result = interpolatePathPoints(a, b, 0);
    expect(result[0].position.x).toBe(0);
    expect(result[0].position.y).toBe(0);
    expect(result[1].position.x).toBe(100);
    expect(result[1].position.y).toBe(0);
  });

  it('returns target at t=1', () => {
    const a = [corner(0, 0), corner(100, 0)];
    const b = [corner(0, 100), corner(100, 100)];
    const result = interpolatePathPoints(a, b, 1);
    expect(result[0].position.y).toBe(100);
    expect(result[1].position.y).toBe(100);
  });

  it('returns midpoint at t=0.5', () => {
    const a = [corner(0, 0)];
    const b = [corner(100, 200)];
    const result = interpolatePathPoints(a, b, 0.5);
    expect(result[0].position.x).toBeCloseTo(50);
    expect(result[0].position.y).toBeCloseTo(100);
  });

  it('lerps handles when one is null and other is not', () => {
    const a: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 10, y: 0 }, type: 'smooth' },
    ];
    const b: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 20, y: 0 }, type: 'smooth' },
    ];
    const result = interpolatePathPoints(a, b, 0.5);
    expect(result[0].handleOut).not.toBeNull();
    expect(result[0].handleOut!.x).toBeCloseTo(15);
  });

  it('keeps handles null when both are null', () => {
    const a = [corner(0, 0)];
    const b = [corner(100, 0)];
    const result = interpolatePathPoints(a, b, 0.5);
    expect(result[0].handleIn).toBeNull();
    expect(result[0].handleOut).toBeNull();
  });

  it('snaps type at t=0.5', () => {
    const a: PathPoint[] = [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
    ];
    const b: PathPoint[] = [
      { position: { x: 10, y: 0 }, handleIn: null, handleOut: null, type: 'smooth' },
    ];
    expect(interpolatePathPoints(a, b, 0.49)[0].type).toBe('corner');
    expect(interpolatePathPoints(a, b, 0.5)[0].type).toBe('smooth');
  });

  it('lerps cornerRadius when both defined', () => {
    const a: PathPoint[] = [
      {
        position: { x: 0, y: 0 },
        handleIn: null,
        handleOut: null,
        type: 'corner',
        cornerRadius: 10,
      },
    ];
    const b: PathPoint[] = [
      {
        position: { x: 10, y: 0 },
        handleIn: null,
        handleOut: null,
        type: 'corner',
        cornerRadius: 30,
      },
    ];
    const result = interpolatePathPoints(a, b, 0.5);
    expect(result[0].cornerRadius).toBeCloseTo(20);
  });
});

// ============================================================================
// prepareShapeTween / interpolateShapeTween (integration)
// ============================================================================

describe('prepareShapeTween', () => {
  it('produces ShapeTweenData with equal-length arrays', () => {
    const src = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const tgt = [
      corner(0, 0),
      corner(50, 0),
      corner(100, 0),
      corner(100, 100),
      corner(50, 100),
      corner(0, 100),
    ];
    const data = prepareShapeTween(src, tgt, true, true);
    expect(data.sourceNormalized).toHaveLength(data.targetNormalized.length);
    expect(data.sourceNormalized).toHaveLength(6);
  });

  it('handles same point count (no normalization needed)', () => {
    const src = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const tgt = [corner(10, 10), corner(90, 10), corner(50, 110)];
    const data = prepareShapeTween(src, tgt, true, true);
    expect(data.sourceNormalized).toHaveLength(3);
    expect(data.targetNormalized).toHaveLength(3);
  });
});

describe('interpolateShapeTween', () => {
  it('returns source shape at t=0', () => {
    const src = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const tgt = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const data = prepareShapeTween(src, tgt, true, true);
    const result = interpolateShapeTween(data, 0);
    expect(result).toHaveLength(3);
    expect(result[0].position.x).toBeCloseTo(0);
  });

  it('returns target shape at t=1', () => {
    const src = [corner(0, 0), corner(100, 0), corner(50, 100)];
    const tgt = [corner(200, 200), corner(300, 200), corner(250, 300)];
    const data = prepareShapeTween(src, tgt, true, true);
    const result = interpolateShapeTween(data, 1);
    expect(result[0].position.x).toBeCloseTo(200);
    expect(result[0].position.y).toBeCloseTo(200);
  });

  it('produces intermediate shape at t=0.5', () => {
    const src = [corner(0, 0), corner(100, 0)];
    const tgt = [corner(0, 100), corner(100, 100)];
    const data = prepareShapeTween(src, tgt, false, false);
    const result = interpolateShapeTween(data, 0.5);
    expect(result[0].position.y).toBeCloseTo(50);
    expect(result[1].position.y).toBeCloseTo(50);
  });
});
