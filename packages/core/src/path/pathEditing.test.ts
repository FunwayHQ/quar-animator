/**
 * Tests for simplifying a path's contour
 */

import { describe, it, expect } from 'vitest';
import type { PathPoint } from '@quar/types';
import {
  cutContour,
  joinContours,
  simplifyContour,
  transformContour,
  posedPointFrames,
  posedSegmentPoints,
  nearestPathSegment,
} from './pathEditing';
import { bezier } from './bezier';
import { mat3 } from '../math';
import { getAbsoluteControlPoints } from './pathUtils';

const corner = (x: number, y: number): PathPoint => ({
  position: { x, y },
  handleIn: null,
  handleOut: null,
  type: 'corner',
});

/** Points along a contour's curves, to measure its shape. */
function trace(points: PathPoint[], closed: boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const segments = closed ? points.length : points.length - 1;
  for (let i = 0; i < segments; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const { cp1, cp2 } = getAbsoluteControlPoints(a, b);
    for (let k = 0; k <= 10; k++)
      out.push(bezier.cubicPoint(a.position, cp1, cp2, b.position, k / 10));
  }
  return out;
}

describe('simplifyContour', () => {
  it('takes a circle drawn as many points down to a few, still round', () => {
    const circle = Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return corner(Math.cos(a) * 100, Math.sin(a) * 100);
    });
    const simple = simplifyContour(circle, true, 0.5);

    expect(simple.length).toBeLessThanOrEqual(12);
    for (const p of trace(simple, true)) {
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(98.5);
      expect(Math.hypot(p.x, p.y)).toBeLessThan(101.5);
    }
  });

  it('leaves a rectangle as it is: nothing to take away', () => {
    const rectangle = [corner(0, 0), corner(100, 0), corner(100, 50), corner(0, 50)];
    expect(simplifyContour(rectangle, true, 0.5)).toBe(rectangle);
  });

  it("keeps an open path's ends where they are", () => {
    const wave = Array.from({ length: 50 }, (_, i) => corner(i * 4, Math.sin(i / 8) * 30));
    const simple = simplifyContour(wave, false, 0.5);
    expect(simple.length).toBeLessThan(20);
    expect(simple[0]!.position).toEqual(wave[0]!.position);
    expect(simple[simple.length - 1]!.position).toEqual(wave[49]!.position);
  });
});

const xs = (points: PathPoint[]) => points.map((p) => p.position.x);

describe('cutContour', () => {
  const line = [corner(0, 0), corner(10, 0), corner(20, 0), corner(30, 0)];

  it('cuts an open contour into pieces that share the cut point', () => {
    expect(cutContour(line, false, [1]).map(xs)).toEqual([
      [0, 10],
      [10, 20, 30],
    ]);
    expect(cutContour(line, false, [2, 1]).map(xs)).toEqual([
      [0, 10],
      [10, 20],
      [20, 30],
    ]);
  });

  it("doesn't cut an open contour at its ends", () => {
    expect(cutContour(line, false, [0, 3])).toEqual([line]);
  });

  it('opens a closed contour at its one cut, keeping every segment', () => {
    expect(cutContour(line, true, [2]).map(xs)).toEqual([[20, 30, 0, 10, 20]]);
    expect(cutContour(line, true, [1, 3]).map(xs)).toEqual([
      [10, 20, 30],
      [30, 0, 10],
    ]);
  });

  it('leaves no handle sticking out of a new end', () => {
    const smooth = line.map((p) => ({
      ...p,
      handleIn: { x: -3, y: 0 },
      handleOut: { x: 3, y: 0 },
    }));
    const [first, second] = cutContour(smooth, false, [1]);
    expect(first![1]!.handleOut).toBeNull();
    expect(first![1]!.handleIn).toEqual({ x: -3, y: 0 });
    expect(second![0]!.handleIn).toBeNull();
    expect(second![0]!.handleOut).toEqual({ x: 3, y: 0 });
  });
});

describe('joinContours', () => {
  it('makes ends that meet one point, its handles from both sides', () => {
    const a = [corner(0, 0), { ...corner(10, 0), handleIn: { x: -2, y: 1 } }];
    const b = [{ ...corner(10, 0.2), handleOut: { x: 2, y: 1 } }, corner(20, 0)];
    const joined = joinContours(a, b, 0.5);
    expect(xs(joined)).toEqual([0, 10, 20]);
    expect(joined[1]!.handleIn).toEqual({ x: -2, y: 1 });
    expect(joined[1]!.handleOut).toEqual({ x: 2, y: 1 });
  });

  it('bridges ends apart with a straight segment', () => {
    expect(
      xs(joinContours([corner(0, 0), corner(10, 0)], [corner(50, 0), corner(60, 0)], 0.5))
    ).toEqual([0, 10, 50, 60]);
  });
});

describe('transformContour', () => {
  it('moves positions and turns handles, without moving the handles', () => {
    const m = { a: 0, b: 1, c: -1, d: 0, tx: 100, ty: 0 }; // 90° turn, then 100 right
    const [p] = transformContour([{ ...corner(10, 0), handleOut: { x: 5, y: 0 } }], m);
    expect(p!.position.x).toBeCloseTo(100);
    expect(p!.position.y).toBeCloseTo(10);
    expect(p!.handleOut!.x).toBeCloseTo(0);
    expect(p!.handleOut!.y).toBeCloseTo(5);
  });
});

describe('posedPointFrames', () => {
  const at = (x: number, y: number) => ({
    position: { x, y },
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  });
  // Two vertices: one moved by (10, 0), one turned a quarter and moved to (0, 50)
  const pose = {
    vertices: new Float32Array([0, 0, 100, 0]),
    deformed: new Float32Array([10, 0, 0, 150]),
    linear: new Float32Array([1, 0, 0, 1, 0, 1, -1, 0]),
  };

  it('maps each point through the skinning of the mesh vertex nearest it', () => {
    const frames = posedPointFrames([at(0, 0), at(98, 1)], pose)!;
    expect(frames[0]).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 0 });
    // Exactly where the vertex is drawn at the vertex, its skinning around it
    expect(mat3.transformPoint(frames[1]!, { x: 100, y: 0 })).toEqual({ x: 0, y: 150 });
    expect(mat3.transformPoint(frames[1]!, { x: 98, y: 1 })).toEqual({ x: -1, y: 148 });
  });

  it("is null when the pose doesn't fit together", () => {
    expect(posedPointFrames([at(0, 0)], { ...pose, deformed: new Float32Array(2) })).toBeNull();
    expect(posedPointFrames([at(0, 0)], { ...pose, linear: new Float32Array(4) })).toBeNull();
    expect(
      posedPointFrames([at(0, 0)], {
        vertices: new Float32Array(0),
        deformed: new Float32Array(0),
        linear: new Float32Array(0),
      })
    ).toBeNull();
  });
});

describe('segments of a bound path', () => {
  const at = (x: number, y: number) => ({
    position: { x, y },
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  });
  // A straight segment (0,0)–(100,0) whose far half the bones lift 50 up
  const pose = {
    vertices: new Float32Array([0, 0, 25, 0, 50, 0, 75, 0, 100, 0]),
    deformed: new Float32Array([0, 0, 25, 0, 50, 0, 75, 50, 100, 50]),
    linear: new Float32Array(Array.from({ length: 5 }, () => [1, 0, 0, 1]).flat()),
  };

  it('follows the bend, not the chord between its ends', () => {
    const points = posedSegmentPoints(at(0, 0), at(100, 0), pose, 4)!;
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[4]).toEqual({ x: 100, y: 50 });
    // Even steps of the curve's parameter: t = 0.75 is at x ≈ 84, lifted with the far half
    expect(points[3]!.x).toBeCloseTo(84.375);
    expect(points[3]!.y).toBe(50);
    expect(points[1]!.y).toBe(0);
  });

  it('is hit where the bones draw it', () => {
    const node = {
      points: [at(0, 0), at(100, 0)],
      closed: false,
    } as unknown as Parameters<typeof nearestPathSegment>[0];
    const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    // On the chord, but off the bent segment
    expect(nearestPathSegment(node, identity, { x: 80, y: 20 }, 5, pose)).toBeNull();
    const hit = nearestPathSegment(node, identity, { x: 90, y: 50 }, 5, pose)!;
    expect(hit.segmentIndex).toBe(0);
    expect(hit.t).toBeGreaterThan(0.75);
  });
});
