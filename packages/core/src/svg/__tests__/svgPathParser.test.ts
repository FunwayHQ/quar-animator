import { describe, it, expect } from 'vitest';
import { parseSvgPath } from '../svgPathParser';

describe('parseSvgPath', () => {
  // --------------------------------------------------------------------------
  // Basic Commands
  // --------------------------------------------------------------------------

  describe('MoveTo + LineTo', () => {
    it('parses M L commands', () => {
      const result = parseSvgPath('M 10 20 L 30 40 L 50 60');
      expect(result).toHaveLength(1);
      expect(result[0].closed).toBe(false);
      expect(result[0].points).toHaveLength(3);
      expect(result[0].points[0].position).toEqual({ x: 10, y: 20 });
      expect(result[0].points[1].position).toEqual({ x: 30, y: 40 });
      expect(result[0].points[2].position).toEqual({ x: 50, y: 60 });
    });

    it('parses relative m l commands', () => {
      const result = parseSvgPath('m 10 20 l 20 20 l 20 20');
      expect(result).toHaveLength(1);
      expect(result[0].points[0].position).toEqual({ x: 10, y: 20 });
      expect(result[0].points[1].position).toEqual({ x: 30, y: 40 });
      expect(result[0].points[2].position).toEqual({ x: 50, y: 60 });
    });

    it('implicit L after M', () => {
      const result = parseSvgPath('M 0 0 10 10 20 20');
      expect(result).toHaveLength(1);
      expect(result[0].points).toHaveLength(3);
      expect(result[0].points[2].position).toEqual({ x: 20, y: 20 });
    });
  });

  describe('H and V commands', () => {
    it('parses H (horizontal)', () => {
      const result = parseSvgPath('M 0 0 H 100');
      expect(result[0].points[1].position).toEqual({ x: 100, y: 0 });
    });

    it('parses V (vertical)', () => {
      const result = parseSvgPath('M 0 0 V 100');
      expect(result[0].points[1].position).toEqual({ x: 0, y: 100 });
    });

    it('parses relative h and v', () => {
      const result = parseSvgPath('M 10 10 h 50 v 50');
      expect(result[0].points[1].position).toEqual({ x: 60, y: 10 });
      expect(result[0].points[2].position).toEqual({ x: 60, y: 60 });
    });
  });

  describe('Close path (Z)', () => {
    it('marks subpath as closed', () => {
      const result = parseSvgPath('M 0 0 L 100 0 L 100 100 Z');
      expect(result).toHaveLength(1);
      expect(result[0].closed).toBe(true);
      expect(result[0].points).toHaveLength(3);
    });

    it('merges last point with first when coincident', () => {
      const result = parseSvgPath('M 0 0 L 100 0 L 100 100 L 0 0 Z');
      expect(result[0].closed).toBe(true);
      // Last point (0,0) should be merged with first
      expect(result[0].points).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // Cubic Bezier
  // --------------------------------------------------------------------------

  describe('Cubic Bezier (C)', () => {
    it('parses C command', () => {
      const result = parseSvgPath('M 0 0 C 10 20 30 40 50 60');
      expect(result).toHaveLength(1);
      expect(result[0].points).toHaveLength(2);

      // First point should have handleOut
      const first = result[0].points[0];
      expect(first.handleOut).toEqual({ x: 10, y: 20 });
      expect(first.type).toBe('smooth');

      // Second point should have handleIn
      const second = result[0].points[1];
      expect(second.position).toEqual({ x: 50, y: 60 });
      expect(second.handleIn).toEqual({ x: 30 - 50, y: 40 - 60 });
    });

    it('parses relative c command', () => {
      const result = parseSvgPath('M 100 100 c 10 20 30 40 50 60');
      const second = result[0].points[1];
      expect(second.position).toEqual({ x: 150, y: 160 });
      expect(second.handleIn).toEqual({ x: 100 + 30 - 150, y: 100 + 40 - 160 });
    });
  });

  describe('Smooth Cubic (S)', () => {
    it('reflects previous control point', () => {
      const result = parseSvgPath('M 0 0 C 10 20 30 40 50 50 S 80 90 100 100');
      expect(result[0].points).toHaveLength(3);

      // The S command should create a reflected control point
      const middle = result[0].points[1];
      expect(middle.handleOut).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // Quadratic Bezier
  // --------------------------------------------------------------------------

  describe('Quadratic Bezier (Q)', () => {
    it('parses Q command (converted to cubic)', () => {
      const result = parseSvgPath('M 0 0 Q 50 100 100 0');
      expect(result[0].points).toHaveLength(2);

      // Should be converted to cubic bezier
      const first = result[0].points[0];
      expect(first.handleOut).toBeTruthy();
      expect(first.type).toBe('smooth');

      const second = result[0].points[1];
      expect(second.handleIn).toBeTruthy();
      expect(second.position).toEqual({ x: 100, y: 0 });
    });
  });

  describe('Smooth Quadratic (T)', () => {
    it('reflects previous quadratic control', () => {
      const result = parseSvgPath('M 0 0 Q 50 100 100 0 T 200 0');
      expect(result[0].points).toHaveLength(3);
      expect(result[0].points[2].position).toEqual({ x: 200, y: 0 });
    });
  });

  // --------------------------------------------------------------------------
  // Arc
  // --------------------------------------------------------------------------

  describe('Arc (A)', () => {
    it('parses A command (converted to beziers)', () => {
      const result = parseSvgPath('M 0 50 A 50 50 0 0 1 100 50');
      expect(result).toHaveLength(1);
      // Arc creates one or more bezier segments
      expect(result[0].points.length).toBeGreaterThanOrEqual(2);

      // Last point should be at target
      const last = result[0].points[result[0].points.length - 1];
      expect(last.position.x).toBeCloseTo(100, 0);
      expect(last.position.y).toBeCloseTo(50, 0);
    });

    it('handles degenerate arc (rx=0)', () => {
      const result = parseSvgPath('M 0 0 A 0 50 0 0 1 100 50');
      expect(result).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Multiple Subpaths
  // --------------------------------------------------------------------------

  describe('multiple subpaths', () => {
    it('creates separate subpaths for multiple M commands', () => {
      const result = parseSvgPath('M 0 0 L 10 10 M 50 50 L 60 60');
      expect(result).toHaveLength(2);
      expect(result[0].points).toHaveLength(2);
      expect(result[1].points).toHaveLength(2);
      expect(result[1].points[0].position).toEqual({ x: 50, y: 50 });
    });

    it('handles Z followed by M', () => {
      const result = parseSvgPath('M 0 0 L 10 0 L 10 10 Z M 20 20 L 30 30');
      expect(result).toHaveLength(2);
      expect(result[0].closed).toBe(true);
      expect(result[1].closed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty for empty string', () => {
      expect(parseSvgPath('')).toEqual([]);
    });

    it('handles negative numbers as separators', () => {
      const result = parseSvgPath('M0 0L10-20');
      expect(result[0].points[1].position).toEqual({ x: 10, y: -20 });
    });

    it('handles decimal points without leading zero', () => {
      const result = parseSvgPath('M .5 .5 L 1.5 1.5');
      expect(result[0].points[0].position).toEqual({ x: 0.5, y: 0.5 });
    });

    it('handles compact notation', () => {
      const result = parseSvgPath('M0,0L100,0L100,100L0,100Z');
      expect(result).toHaveLength(1);
      expect(result[0].closed).toBe(true);
      expect(result[0].points).toHaveLength(4);
    });

    it('all points have correct types', () => {
      const result = parseSvgPath('M 0 0 L 10 10');
      for (const point of result[0].points) {
        expect(['corner', 'smooth', 'symmetric']).toContain(point.type);
      }
    });

    it('corner points have null handles', () => {
      const result = parseSvgPath('M 0 0 L 10 10 L 20 0');
      for (const point of result[0].points) {
        if (point.type === 'corner') {
          expect(point.handleIn).toBeNull();
          expect(point.handleOut).toBeNull();
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Real-world SVG paths
  // --------------------------------------------------------------------------

  describe('real-world paths', () => {
    it('parses a triangle', () => {
      const result = parseSvgPath('M 50 0 L 100 100 L 0 100 Z');
      expect(result).toHaveLength(1);
      expect(result[0].closed).toBe(true);
      expect(result[0].points).toHaveLength(3);
    });

    it('parses a heart shape (cubic beziers)', () => {
      const d =
        'M 10 30 C 10 27 12 25 15 25 C 18 25 20 27 20 30 C 20 35 10 45 10 45 C 10 45 0 35 0 30 C 0 27 2 25 5 25 C 8 25 10 27 10 30 Z';
      const result = parseSvgPath(d);
      expect(result).toHaveLength(1);
      expect(result[0].closed).toBe(true);
      expect(result[0].points.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('arc compact flags (F047)', () => {
    const allFinite = (subs: ReturnType<typeof parseSvgPath>) => {
      for (const sub of subs) {
        for (const pt of sub.points) {
          expect(Number.isFinite(pt.position.x)).toBe(true);
          expect(Number.isFinite(pt.position.y)).toBe(true);
          if (pt.handleIn) expect(Number.isFinite(pt.handleIn.x)).toBe(true);
          if (pt.handleOut) expect(Number.isFinite(pt.handleOut.x)).toBe(true);
        }
      }
    };

    it('parses compact flags (011 => flag 0, flag 1) without NaN', () => {
      const subs = parseSvgPath('M0 0a1 1 0 011 1');
      allFinite(subs);
      const last = subs[subs.length - 1]!.points.at(-1)!;
      expect(last.position.x).toBeCloseTo(1, 1);
      expect(last.position.y).toBeCloseTo(1, 1);
    });

    it('parses an SVGO compact circle without NaN', () => {
      const subs = parseSvgPath('M8 0a8 8 0 100 16 8 8 0 100-16z');
      expect(subs).toHaveLength(1);
      expect(subs[0]!.closed).toBe(true);
      allFinite(subs);
    });

    it('still parses spaced arc flags (regression)', () => {
      const subs = parseSvgPath('M 0 50 A 50 50 0 0 1 100 50');
      const last = subs[subs.length - 1]!.points.at(-1)!;
      expect(last.position.x).toBeCloseTo(100, 0);
      expect(last.position.y).toBeCloseTo(50, 0);
    });
  });
});
