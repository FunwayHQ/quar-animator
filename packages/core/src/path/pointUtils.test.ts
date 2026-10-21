/**
 * Tests for giving a path point a type
 */

import { describe, it, expect } from 'vitest';
import type { PathPoint } from '@quar/types';
import { setPointType } from './pointUtils';

const at = (handleIn: [number, number] | null, handleOut: [number, number] | null): PathPoint => ({
  position: { x: 0, y: 0 },
  handleIn: handleIn && { x: handleIn[0], y: handleIn[1] },
  handleOut: handleOut && { x: handleOut[0], y: handleOut[1] },
  type: 'corner',
});

describe('setPointType', () => {
  it('leaves a corner its handles', () => {
    const point = { ...at([-10, 5], [20, 0]), type: 'smooth' as const };
    expect(setPointType(point, 'corner', null, null)).toEqual({ ...point, type: 'corner' });
  });

  it('lines the handles up for smooth, keeping their lengths', () => {
    const smooth = setPointType(at([0, 10], [20, 0]), 'smooth', null, null);
    const { handleIn, handleOut } = smooth;
    // Opposite directions
    expect(handleIn!.x * handleOut!.y - handleIn!.y * handleOut!.x).toBeCloseTo(0);
    expect(handleIn!.x * handleOut!.x + handleIn!.y * handleOut!.y).toBeLessThan(0);
    expect(Math.hypot(handleOut!.x, handleOut!.y)).toBeCloseTo(20);
    expect(Math.hypot(handleIn!.x, handleIn!.y)).toBeCloseTo(10);
  });

  it('evens the lengths out for symmetric', () => {
    const symmetric = setPointType(at([-10, 0], [30, 0]), 'symmetric', null, null);
    expect(symmetric.handleOut).toEqual({ x: 20, y: 0 });
    expect(symmetric.handleIn!.x).toBeCloseTo(-20);
    expect(symmetric.handleIn!.y).toBeCloseTo(0);
  });

  it('gives a point without handles some along its neighbours', () => {
    const smooth = setPointType(at(null, null), 'smooth', { x: -100, y: 0 }, { x: 100, y: 0 });
    expect(smooth.handleOut!.x).toBeGreaterThan(0);
    expect(smooth.handleOut!.y).toBeCloseTo(0);
    expect(smooth.handleIn!.x).toBeLessThan(0);
  });
});
