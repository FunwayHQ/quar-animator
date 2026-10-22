import { describe, it, expect } from 'vitest';
import type { PathPoint, PathShape, Vector2 } from '@quar/types';
import {
  computeSegmentArcLengths,
  subdivideSegmentPoints,
  normalizePointCount,
  findBestCorrespondence,
  applyCorrespondence,
  interpolatePathPoints,
  prepareShapeTween,
  interpolateShapeTween,
  isPathShape,
  pathShapeOf,
  preparePathShapeTween,
  interpolatePathShapeTween,
  toPathShape,
} from './shapeTween';
import { bezier } from '../path/bezier';

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
  // The cubic from a to b, as the path draws it
  function segmentPoint(a: PathPoint, b: PathPoint, t: number): Vector2 {
    const cp1 = a.handleOut
      ? { x: a.position.x + a.handleOut.x, y: a.position.y + a.handleOut.y }
      : a.position;
    const cp2 = b.handleIn
      ? { x: b.position.x + b.handleIn.x, y: b.position.y + b.handleIn.y }
      : b.position;
    return bezier.cubicPoint(a.position, cp1, cp2, b.position, t);
  }

  it('adds points without changing the curve: the end of a split curve gets a shorter handle', () => {
    // An arch, split in two to match a three-point target
    const arch = [smooth(0, 0, 0, 0, 0, 60), smooth(100, 0, 0, 60, 0, 0)];
    const { source } = normalizePointCount(
      arch,
      [corner(0, 0), corner(50, 0), corner(100, 0)],
      false,
      false
    );
    expect(source).toHaveLength(3);
    expect(Math.hypot(source[2]!.handleIn!.x, source[2]!.handleIn!.y)).toBeLessThan(40);
    // Both halves lie on the original arch
    for (const t of [0.1, 0.25, 0.4]) {
      const original = segmentPoint(arch[0]!, arch[1]!, t / 2 + 0.5);
      const half = segmentPoint(source[1]!, source[2]!, t);
      expect(half.x).toBeCloseTo(original.x, 1);
      expect(half.y).toBeCloseTo(original.y, 1);
    }
  });

  it('gives a closed path’s first point the shorter handle when the closing curve is split', () => {
    // The closing curve (from the last point back to the first) is the longest
    const a: PathPoint = {
      position: { x: 0, y: 0 },
      handleIn: { x: 0, y: -40 },
      handleOut: null,
      type: 'corner',
    };
    const c: PathPoint = {
      position: { x: -60, y: 0 },
      handleIn: null,
      handleOut: { x: 0, y: -40 },
      type: 'corner',
    };
    const shape = [a, corner(10, 0), c];
    const target = [corner(0, 0), corner(10, 0), corner(0, 10), corner(-60, 0)];
    const { source } = normalizePointCount(shape, target, true, true);
    expect(source).toHaveLength(4);
    const first = source.find((p) => p.position.x === 0 && p.position.y === 0)!;
    expect(Math.hypot(first.handleIn!.x, first.handleIn!.y)).toBeLessThan(39);
  });

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

// ============================================================================
// Contour direction
// ============================================================================

/** Twice the signed area (positive counter-clockwise, Y up). */
function signedArea(points: PathPoint[]): number {
  let area = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    area += p.position.x * q.position.y - q.position.x * p.position.y;
  });
  return area;
}

describe('prepareShapeTween direction', () => {
  const square = [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)];

  it('runs a closed source the other way when the target does', () => {
    const backwards = [corner(0, 0), corner(0, 110), corner(110, 110), corner(110, 0)];
    const tween = prepareShapeTween(square, backwards, true, true);
    // Never inside out: halfway it still has the target's area, not zero
    const halfway = interpolateShapeTween(tween, 0.5);
    expect(Math.sign(signedArea(halfway))).toBe(Math.sign(signedArea(backwards)));
    expect(Math.abs(signedArea(halfway))).toBeGreaterThan(2 * 100 * 100);
  });

  it('keeps an open path the way it was drawn', () => {
    const line = [corner(0, 0), corner(50, 0), corner(100, 0)];
    const back = [corner(100, 10), corner(50, 10), corner(0, 10)];
    const tween = prepareShapeTween(line, back, false, false);
    expect(tween.sourceNormalized.map((p) => p.position.x)).toEqual([0, 50, 100]);
  });

  it('adds no points between the ends of open paths', () => {
    const line = [corner(0, 0), corner(100, 0)];
    const zigzag = [corner(0, 0), corner(30, 40), corner(60, 0), corner(100, 40)];
    const tween = prepareShapeTween(line, zigzag, false, false);
    const xs = tween.sourceNormalized.map((p) => p.position.x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(100);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});

// ============================================================================
// Whole shapes
// ============================================================================

describe('whole-shape tweens', () => {
  const outer = [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)];
  const hole = [corner(40, 40), corner(40, 60), corner(60, 60), corner(60, 40)];
  const ring: PathShape = { points: outer, subpaths: [hole], closed: true };
  const solid: PathShape = { points: outer, closed: true };

  it('tells shapes from older point arrays, and reads those as closed main contours', () => {
    expect(isPathShape(ring)).toBe(true);
    expect(isPathShape(outer)).toBe(false);
    expect(isPathShape(null)).toBe(false);
    expect(toPathShape(outer)).toEqual({ points: outer, closed: true });
    expect(toPathShape(ring)).toBe(ring);
  });

  it('records every contour of a path, as copies', () => {
    const shape = pathShapeOf({ points: outer, subpaths: [hole], closed: false });
    expect(shape).toEqual({ points: outer, subpaths: [hole], closed: false });
    expect(shape.points[0]).not.toBe(outer[0]);
    expect(pathShapeOf({ points: outer, subpaths: [], closed: true })).not.toHaveProperty(
      'subpaths'
    );
  });

  it('tweens holes along with the outline', () => {
    const bigger = [corner(30, 30), corner(30, 70), corner(70, 70), corner(70, 30)];
    const tween = preparePathShapeTween(ring, { ...ring, subpaths: [bigger] });
    const halfway = interpolatePathShapeTween(tween, 0.5);
    expect(halfway.subpaths).toHaveLength(1);
    expect(halfway.subpaths![0]!.map((p) => p.position.x).sort()).toEqual([35, 35, 65, 65]);
  });

  it('grows a hole only the later shape has from its middle', () => {
    const tween = preparePathShapeTween(solid, ring);
    expect(interpolatePathShapeTween(tween, 0).subpaths).toBeUndefined();
    const start = interpolatePathShapeTween(tween, 0.01).subpaths![0]!;
    for (const p of start) {
      expect(p.position.x).toBeCloseTo(50, 0);
      expect(p.position.y).toBeCloseTo(50, 0);
    }
    expect(interpolatePathShapeTween(tween, 1).subpaths).toEqual([hole]);
  });

  it('shrinks a hole only the earlier shape has to its middle, gone at the end', () => {
    const tween = preparePathShapeTween(ring, solid);
    expect(interpolatePathShapeTween(tween, 0).subpaths).toEqual([hole]);
    expect(interpolatePathShapeTween(tween, 0.5).subpaths![0]![0]!.position).toEqual({
      x: 45,
      y: 45,
    });
    expect(interpolatePathShapeTween(tween, 1).subpaths).toBeUndefined();
  });

  it('tweens an open shape as open', () => {
    const open: PathShape = { points: [corner(0, 0), corner(100, 0)], closed: false };
    const longer: PathShape = {
      points: [corner(0, 0), corner(50, 50), corner(100, 0)],
      closed: false,
    };
    const tween = preparePathShapeTween(open, longer);
    const halfway = interpolatePathShapeTween(tween, 0.5);
    expect(halfway.closed).toBe(false);
    const xs = halfway.points.map((p) => p.position.x);
    expect(xs).toHaveLength(3);
    [0, 50, 100].forEach((x, i) => expect(xs[i]).toBeCloseTo(x, 5));
  });
});
