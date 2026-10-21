/**
 * Tests for simplifying a path's contour
 */

import { describe, it, expect } from 'vitest';
import type { PathPoint } from '@quar/types';
import { simplifyContour } from './pathEditing';
import { bezier } from './bezier';
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
