import { describe, expect, it } from 'vitest';
import { trimPathToProgress } from './pathReveal';
import type { PathPoint } from '@quar/types';

function point(x: number, y: number, handleOut: PathPoint['handleOut'] = null): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut, type: 'corner' };
}

describe('trimPathToProgress', () => {
  it('trims a straight open path by distance', () => {
    const original = [point(0, 0), point(100, 0)];

    const half = trimPathToProgress(original, false, 0.5);

    expect(half).toHaveLength(2);
    expect(half[0]?.position).toEqual({ x: 0, y: 0 });
    expect(half[1]?.position.x).toBeCloseTo(50, 0);
    expect(half[1]?.position.y).toBeCloseTo(0, 4);
    expect(original[0]?.handleOut).toBeNull();
  });

  it('keeps a partial bezier segment curved at its new endpoint', () => {
    const curve = [point(0, 0, { x: 0, y: 100 }), point(100, 100, { x: -100, y: 0 })];

    const half = trimPathToProgress(curve, false, 0.5);

    expect(half).toHaveLength(2);
    expect(half[0]?.handleOut).not.toBeNull();
    expect(half[1]?.handleIn).not.toBeNull();
    expect(half[1]?.position.x).toBeLessThan(50);
    expect(half[1]?.position.y).toBeGreaterThan(50);
  });

  it('includes a closing segment for a partially revealed closed path', () => {
    const triangle = [point(0, 0), point(100, 0), point(100, 100)];

    const threeQuarters = trimPathToProgress(triangle, true, 0.75);

    expect(threeQuarters).toHaveLength(4);
    expect(threeQuarters[3]?.position.x).toBeCloseTo(60, 0);
    expect(threeQuarters[3]?.position.y).toBeCloseTo(60, 0);
  });
});
